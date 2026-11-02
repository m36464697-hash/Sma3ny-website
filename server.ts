import { spawn } from 'child_process';
import express from 'express';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import {
  cleanSongMetadataText,
  deduplicateTracks,
  isAllowedAudioProxyUrl,
  isAllowedRadioStreamUrl,
  isFullResolverRef,
  normalizeArabicText,
  sanitizeQuranServerBaseUrl,
  type LiveRadioStation,
  type MediaTrack,
  type QuranAyahItem,
  type QuranReciter,
  type QuranSurahMeta,
} from './src/utils/mediaLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Maximum chunk per /api/stream response (8 MiB — safely 4x under Cloud Run's 32 MiB HTTP/1 cap)
const MAX_STREAM_CHUNK_BYTES = 8 * 1024 * 1024;

interface DeezerTrackItem {
  id?: number;
  title?: string;
  duration?: number;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string; cover_big?: string };
}

interface SoundCloudTranscoding {
  url: string;
  preset?: string;
  duration?: number;
  snipped?: boolean;
  format?: {
    protocol?: string;
    mime_type?: string;
  };
}

interface SoundCloudTrackItem {
  id: number;
  title?: string;
  duration?: number;
  full_duration?: number;
  policy?: string;
  artwork_url?: string | null;
  track_authorization?: string;
  user?: {
    username?: string;
    avatar_url?: string | null;
  };
  publisher_metadata?: {
    artist?: string;
    album_title?: string;
  };
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
}

interface ArchiveSearchDoc {
  identifier?: string;
  title?: string;
  creator?: string | string[];
}

interface ArchiveFileEntry {
  name?: string;
  format?: string;
  length?: string;
  size?: string;
  title?: string;
  private?: string | boolean;
}

interface RawMp3QuranReciter {
  id: number;
  name: string;
  moshaf?: Array<{
    id: number;
    name: string;
    server: string;
    surah_total: number;
    surah_list?: string;
    surat_list?: string;
  }>;
}

// Cached MP3Quran catalog (114 Surahs + 244 real Reciters)
let cachedQuranData: {
  fetchedAt: number;
  suwar: QuranSurahMeta[];
  reciters: QuranReciter[];
} | null = null;

// Cached SoundCloud web client_id + query->trackId LRU cache
let cachedScClientId: { id: string; fetchedAt: number } | null = null;
let inflightScClientPromise: Promise<string | null> | null = null;
const resolvedScQueryCache = new Map<string, number>();

// Detect whether ffmpeg is installed in this runtime container
let ffmpegAvailablePromise: Promise<boolean> | null = null;
function checkFfmpegAvailable(): Promise<boolean> {
  if (!ffmpegAvailablePromise) {
    ffmpegAvailablePromise = new Promise<boolean>((resolve) => {
      try {
        const proc = spawn('ffmpeg', ['-version']);
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }
  return ffmpegAvailablePromise;
}

const FEATURED_RECITER_NAMES = [
  'مشاري العفاسي',
  'ماهر المعيقلي',
  'عبد الباسط عبد الصمد',
  'محمد صديق المنشاوي',
  'محمود خليل الحصري',
  'ياسر الدوسري',
  'سعود الشريم',
  'عبد الرحمن السديس',
  'ناصر القطامي',
  'إدريس أبكر',
  'هزاع البلوشي',
  'أحمد بن علي العجمي',
  'سعد الغامدي',
  'فارس عباد',
  'علي جابر',
  'محمد أيوب',
];

async function fetchWithTimeout(url: string, timeoutMs = 6000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json, */*',
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getSoundCloudClientId(forceRefresh = false): Promise<string | null> {
  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  if (
    !forceRefresh &&
    cachedScClientId &&
    Date.now() - cachedScClientId.fetchedAt < FOUR_HOURS
  ) {
    return cachedScClientId.id;
  }

  if (!forceRefresh && inflightScClientPromise) {
    return inflightScClientPromise;
  }

  inflightScClientPromise = (async () => {
    try {
      const homeRes = await fetchWithTimeout('https://soundcloud.com', 6000);
      if (!homeRes.ok) return cachedScClientId?.id ?? null;
      const html = await homeRes.text();
      const scriptUrls = Array.from(
        html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
        (m) => m[1]
      );

      for (const scriptUrl of scriptUrls.slice(-6).reverse()) {
        try {
          const jsRes = await fetchWithTimeout(scriptUrl, 5000);
          if (!jsRes.ok) continue;
          const jsText = await jsRes.text();
          const match = jsText.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
          if (match?.[1]) {
            cachedScClientId = { id: match[1], fetchedAt: Date.now() };
            return match[1];
          }
        } catch {
          // continue checking remaining asset bundles
        }
      }
      return cachedScClientId?.id ?? null;
    } catch {
      return cachedScClientId?.id ?? null;
    } finally {
      inflightScClientPromise = null;
    }
  })();

  return inflightScClientPromise;
}

/**
 * Returns ALL valid full-length (non-snipped) transcodings for a SoundCloud track
 * ordered from highest audio fidelity to fallback presets.
 */
function listValidFullTranscodings(track: SoundCloudTrackItem): Array<{
  transcoding: SoundCloudTranscoding;
  kbps: number;
  mode: 'hls' | 'direct';
}> {
  if (track.policy === 'SNIP') return [];
  const durMs = track.duration || 0;
  if (durMs < 40_000) return [];
  if (track.full_duration && track.full_duration > 60_000 && durMs < track.full_duration * 0.85) {
    return [];
  }

  const list = Array.isArray(track.media?.transcodings) ? track.media!.transcodings! : [];
  const valid = list.filter((t) => Boolean(t.url && !t.snipped));
  const ordered: Array<{
    transcoding: SoundCloudTranscoding;
    kbps: number;
    mode: 'hls' | 'direct';
  }> = [];

  for (const t of valid) {
    if (t.preset === 'aac_160k' && t.format?.protocol === 'hls') {
      ordered.push({ transcoding: t, kbps: 160, mode: 'hls' });
    }
  }
  for (const t of valid) {
    if (t.preset === 'aac_96k' && t.format?.protocol === 'hls') {
      ordered.push({ transcoding: t, kbps: 96, mode: 'hls' });
    }
  }
  for (const t of valid) {
    if (t.format?.protocol === 'progressive' && (t.format?.mime_type || '').includes('mpeg')) {
      ordered.push({ transcoding: t, kbps: 128, mode: 'direct' });
    }
  }
  for (const t of valid) {
    if (
      t.format?.protocol === 'hls' &&
      (t.format?.mime_type || '').includes('mp4') &&
      t.preset !== 'aac_160k' &&
      t.preset !== 'aac_96k'
    ) {
      ordered.push({ transcoding: t, kbps: 128, mode: 'hls' });
    }
  }

  return ordered;
}

function detectNasheedCategory(title: string, artist: string): boolean {
  const norm = normalizeArabicText(`${title} ${artist}`);
  return (
    norm.includes('انشوده') ||
    norm.includes('نشيد') ||
    norm.includes('ابتهال') ||
    norm.includes('العفاسي') ||
    norm.includes('ماهر زين') ||
    norm.includes('سامي يوسف') ||
    norm.includes('حمود الخضر') ||
    norm.includes('مشاري راشد') ||
    norm.includes('النقشبندي')
  );
}

async function searchSoundCloudFullTracks(query: string, limit = 26): Promise<MediaTrack[]> {
  try {
    let clientId = await getSoundCloudClientId();
    if (!clientId) return [];

    let res = await fetchWithTimeout(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}`,
      5500
    );

    if (res.status === 401 || res.status === 403) {
      clientId = await getSoundCloudClientId(true);
      if (!clientId) return [];
      res = await fetchWithTimeout(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}`,
        5500
      );
    }

    if (!res.ok) return [];
    const payload = (await res.json()) as { collection?: SoundCloudTrackItem[] };
    const collection = Array.isArray(payload.collection) ? payload.collection : [];

    const results: MediaTrack[] = [];

    for (const item of collection) {
      const validPresets = listValidFullTranscodings(item);
      if (validPresets.length === 0 || !item.id || !item.title) continue;
      const topPreset = validPresets[0];

      const durationSec = Math.max(45, Math.round((item.duration || 0) / 1000));
      const cleanedRawTitle = cleanSongMetadataText(item.title);
      const rawPublisherArtist = cleanSongMetadataText(item.publisher_metadata?.artist || '');
      const rawUsername = cleanSongMetadataText(item.user?.username || '');

      let displayTitle = cleanedRawTitle || item.title;
      let displayArtist = rawPublisherArtist || rawUsername || 'فنان';

      if (!rawPublisherArtist && cleanedRawTitle.includes(' - ')) {
        const parts = cleanedRawTitle.split(' - ').map((s) => s.trim()).filter(Boolean);
        if (parts.length === 2 && parts[0].length <= 32 && parts[1].length >= 2) {
          displayTitle = cleanedRawTitle;
          displayArtist = parts[0];
        }
      }

      const isNasheed = detectNasheedCategory(displayTitle, displayArtist);
      const sizeMB = Math.max(
        0.8,
        Number(((durationSec * (topPreset.kbps / 8)) / 1024).toFixed(1))
      );

      const rawArt = item.artwork_url || item.user?.avatar_url || undefined;
      const hiResArt = rawArt ? rawArt.replace('-large.', '-t500x500.') : undefined;
      const isFullAlbumOrConcert = durationSec >= 1200;

      results.push({
        id: `sc-${item.id}`,
        title: displayTitle,
        artist: displayArtist,
        album:
          cleanSongMetadataText(item.publisher_metadata?.album_title || '') ||
          (isFullAlbumOrConcert ? 'ألبوم / حفلة كاملة' : 'نسخة أصلية كاملة'),
        category: isNasheed ? 'nasheed' : 'music',
        durationSec,
        sizeMB,
        audioUrl: `sc://${item.id}`,
        audioFormat: 'mp3',
        sourceKind: 'full-mp3',
        sourceLabel: isFullAlbumOrConcert ? 'ألبوم / حفلة كاملة' : 'أغنية كاملة الأصل',
        coverType: isNasheed ? 'nasheed' : 'music',
        externalCoverUrl: hiResArt,
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function searchDeezerFullCatalog(query: string): Promise<MediaTrack[]> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=14`;
    const res = await fetchWithTimeout(url, 4500);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DeezerTrackItem[] };
    const list = Array.isArray(data.data) ? data.data : [];

    return list
      .filter((item) => Boolean(item.title && item.duration && item.duration >= 45))
      .map((item, idx) => {
        const title = cleanSongMetadataText(item.title || query) || query;
        const artist = cleanSongMetadataText(item.artist?.name || 'فنان') || 'فنان';
        const fullDurationSec = Math.round(item.duration!);
        const isNasheed = detectNasheedCategory(title, artist);
        const estimatedMB = Math.max(1.0, Number(((fullDurationSec * 20) / 1024).toFixed(1)));
        const resolverQuery = `${artist} ${title}`.trim();

        return {
          id: `dzfull-${item.id || idx}`,
          title,
          artist,
          album: item.album?.title || 'ألبوم غنائي رسمي',
          category: isNasheed ? 'nasheed' : 'music',
          durationSec: fullDurationSec,
          sizeMB: estimatedMB,
          audioUrl: `scq://${encodeURIComponent(resolverQuery)}?dur=${fullDurationSec}`,
          audioFormat: 'mp3',
          sourceKind: 'full-mp3',
          sourceLabel: 'أغنية كاملة الأصل',
          coverType: isNasheed ? 'nasheed' : 'music',
          externalCoverUrl: item.album?.cover_big || item.album?.cover_medium,
        };
      });
  } catch {
    return [];
  }
}

async function tryMintStreamFromTrackObject(
  trackObj: SoundCloudTrackItem,
  clientId: string
): Promise<{
  trackId: number;
  durationSec: number;
  mode: 'hls' | 'direct';
  streamUrl: string;
} | null> {
  const presets = listValidFullTranscodings(trackObj);
  if (presets.length === 0) return null;

  const authParam = trackObj.track_authorization
    ? `&track_authorization=${encodeURIComponent(trackObj.track_authorization)}`
    : '';

  for (const preset of presets) {
    try {
      const transRes = await fetchWithTimeout(
        `${preset.transcoding.url}?client_id=${clientId}${authParam}`,
        4500
      );
      if (!transRes.ok) continue;
      const transJson = (await transRes.json()) as { url?: string };
      if (transJson.url) {
        return {
          trackId: trackObj.id,
          durationSec: Math.max(45, Math.round((trackObj.duration || 0) / 1000)),
          mode: preset.mode,
          streamUrl: transJson.url,
        };
      }
    } catch {
      // Try next transcoding preset
    }
  }

  return null;
}

async function fetchAndMintByTrackId(
  trackId: number,
  initialClientId: string
): Promise<{
  trackId: number;
  durationSec: number;
  mode: 'hls' | 'direct';
  streamUrl: string;
} | null> {
  if (!Number.isFinite(trackId) || trackId <= 0) return null;

  let clientId: string | null = initialClientId;
  let trackRes = await fetchWithTimeout(
    `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
    4500
  );
  if (trackRes.status === 401 || trackRes.status === 403) {
    clientId = await getSoundCloudClientId(true);
    if (!clientId) return null;
    trackRes = await fetchWithTimeout(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      4500
    );
  }
  if (!trackRes.ok) return null;

  const trackObj = (await trackRes.json()) as SoundCloudTrackItem;
  return tryMintStreamFromTrackObject(trackObj, clientId);
}

/**
 * Self-healing full-song stream resolver:
 * 1. Tries direct `sc://<id>` across all non-snipped transcoding presets (`aac_160k` -> `aac_96k` -> `progressive`).
 * 2. Tries scored `scq://<query>` (or fallbackHint if a direct track ID was deleted/geo-blocked) across top 4 candidates.
 * 3. Falls back to open Internet Archive MP3 if SoundCloud has no match.
 */
async function resolveSoundCloudRefToStream(
  ref: string,
  fallbackHint = ''
): Promise<{
  trackId: number;
  durationSec: number;
  mode: 'hls' | 'direct';
  streamUrl: string;
} | null> {
  let clientId = await getSoundCloudClientId();
  let searchQ = fallbackHint.trim();
  let targetDurSec = 0;

  if (ref.startsWith('sc://') && clientId) {
    const directId = Number(ref.slice('sc://'.length).split('?')[0].trim());
    const directResult = await fetchAndMintByTrackId(directId, clientId);
    if (directResult) return directResult;
  } else if (ref.startsWith('scq://')) {
    const withoutScheme = ref.slice('scq://'.length);
    const [encodedQ, rawParams] = withoutScheme.split('?');
    searchQ = decodeURIComponent(encodedQ || '').trim() || searchQ;
    const params = new URLSearchParams(rawParams || '');
    targetDurSec = Number(params.get('dur') || 0);

    const cachedId = resolvedScQueryCache.get(ref);
    if (cachedId && clientId) {
      const cachedResult = await fetchAndMintByTrackId(cachedId, clientId);
      if (cachedResult) return cachedResult;
      resolvedScQueryCache.delete(ref);
    }
  }

  if (searchQ && clientId) {
    let searchRes = await fetchWithTimeout(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(searchQ)}&client_id=${clientId}&limit=12`,
      5500
    );
    if (searchRes.status === 401 || searchRes.status === 403) {
      clientId = await getSoundCloudClientId(true);
      if (clientId) {
        searchRes = await fetchWithTimeout(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(searchQ)}&client_id=${clientId}&limit=12`,
          5500
        );
      }
    }

    if (searchRes.ok && clientId) {
      const sJson = (await searchRes.json()) as { collection?: SoundCloudTrackItem[] };
      const candidates = (sJson.collection || []).filter(
        (c) => listValidFullTranscodings(c).length > 0
      );

      const queryTokens = normalizeArabicText(searchQ)
        .split(' ')
        .filter((tok) => tok.length > 1);

      const scored = candidates
        .map((cand, idx) => {
          const candDurSec = Math.round((cand.duration || 0) / 1000);
          const hay = normalizeArabicText(
            `${cand.title || ''} ${cand.publisher_metadata?.artist || ''} ${cand.user?.username || ''}`
          );
          let score = (12 - idx) * 2;
          for (const tok of queryTokens) {
            if (hay.includes(tok)) score += 12;
          }
          if (targetDurSec > 0) {
            const diff = Math.abs(candDurSec - targetDurSec);
            if (diff <= 8) score += 35;
            else if (diff <= 25) score += 20;
            else if (diff <= 60) score += 8;
            else if (candDurSec > targetDurSec * 3) score -= 30;
          } else if (candDurSec > 1200) {
            score -= 15;
          }
          return { cand, score };
        })
        .sort((a, b) => b.score - a.score);

      for (const entry of scored.slice(0, 4)) {
        const minted = await tryMintStreamFromTrackObject(entry.cand, clientId);
        if (minted) {
          if (ref.startsWith('scq://')) {
            if (resolvedScQueryCache.size > 500) {
              const oldestKey = resolvedScQueryCache.keys().next().value;
              if (oldestKey) resolvedScQueryCache.delete(oldestKey);
            }
            resolvedScQueryCache.set(ref, minted.trackId);
          }
          return minted;
        }
      }
    }
  }

  // Last-resort self-healing fallback: Internet Archive full MP3
  if (searchQ) {
    const iaMatches = await searchInternetArchiveFullMp3(searchQ);
    if (iaMatches.length > 0) {
      return {
        trackId: 0,
        durationSec: iaMatches[0].durationSec || 180,
        mode: 'direct',
        streamUrl: iaMatches[0].audioUrl,
      };
    }
  }

  return null;
}

interface ParsedFmp4Playlist {
  initUrl: string | null;
  segments: Array<{ durationSec: number; url: string }>;
}

function parseVodM3u8Segments(m3u8Text: string): ParsedFmp4Playlist {
  const lines = m3u8Text.split(/\r?\n/).map((l) => l.trim());
  let initUrl: string | null = null;
  const segments: Array<{ durationSec: number; url: string }> = [];
  let pendingDuration = 10;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      const m = line.match(/URI="([^"]+)"/);
      if (m?.[1]) initUrl = m[1];
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const durStr = line.slice('#EXTINF:'.length).split(',')[0];
      const parsed = Number(durStr);
      if (Number.isFinite(parsed) && parsed > 0) {
        pendingDuration = parsed;
      }
      continue;
    }
    if (line.startsWith('http://') || line.startsWith('https://')) {
      segments.push({ durationSec: pendingDuration, url: line });
      pendingDuration = 10;
    }
  }

  return { initUrl, segments };
}

async function getQuranCatalog(): Promise<{ suwar: QuranSurahMeta[]; reciters: QuranReciter[] }> {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (cachedQuranData && Date.now() - cachedQuranData.fetchedAt < SIX_HOURS) {
    return { suwar: cachedQuranData.suwar, reciters: cachedQuranData.reciters };
  }

  const [suwarRes, recitersRes] = await Promise.all([
    fetchWithTimeout('https://www.mp3quran.net/api/v3/suwar?language=ar', 8000),
    fetchWithTimeout('https://www.mp3quran.net/api/v3/reciters?language=ar', 9000),
  ]);

  if (!suwarRes.ok || !recitersRes.ok) {
    throw new Error('Failed to load MP3Quran v3 catalog');
  }

  const suwarJson = (await suwarRes.json()) as { suwar?: QuranSurahMeta[] };
  const recitersJson = (await recitersRes.json()) as { reciters?: RawMp3QuranReciter[] };

  const suwar = Array.isArray(suwarJson.suwar) ? suwarJson.suwar : [];
  const rawReciters = Array.isArray(recitersJson.reciters) ? recitersJson.reciters : [];

  const parsedReciters: QuranReciter[] = rawReciters
    .map((r) => {
      const validMoshafs = (r.moshaf || [])
        .filter((m) => Boolean(m.server && (m.surah_list || m.surat_list)))
        .map((m) => {
          const rawList = m.surah_list || m.surat_list || '';
          const seenNums = new Set<number>();
          const surahList: number[] = [];
          for (const part of rawList.split(',')) {
            const n = Number(part.trim());
            if (Number.isFinite(n) && n >= 1 && n <= 114 && !seenNums.has(n)) {
              seenNums.add(n);
              surahList.push(n);
            }
          }
          surahList.sort((a, b) => a - b);

          return {
            id: m.id,
            name: m.name.trim(),
            server: sanitizeQuranServerBaseUrl(m.server),
            surahTotal: surahList.length,
            surahList,
          };
        })
        .filter((m) => Boolean(m.server && m.surahList.length > 0))
        .sort((a, b) => {
          if (b.surahTotal !== a.surahTotal) return b.surahTotal - a.surahTotal;
          const aNorm = normalizeArabicText(a.name);
          const bNorm = normalizeArabicText(b.name);
          const aHafs = aNorm.includes('حفص') ? 1 : 0;
          const bHafs = bNorm.includes('حفص') ? 1 : 0;
          if (bHafs !== aHafs) return bHafs - aHafs;
          const aMurattal =
            aNorm.includes('مرتل') && !aNorm.includes('معلم') && !aNorm.includes('مجود') ? 1 : 0;
          const bMurattal =
            bNorm.includes('مرتل') && !bNorm.includes('معلم') && !bNorm.includes('مجود') ? 1 : 0;
          return bMurattal - aMurattal;
        });

      return {
        id: r.id,
        name: r.name.trim(),
        moshafs: validMoshafs,
      };
    })
    .filter((r) => r.moshafs.length > 0);

  const normFeatured = FEATURED_RECITER_NAMES.map((n) => normalizeArabicText(n));
  parsedReciters.sort((a, b) => {
    const aNorm = normalizeArabicText(a.name);
    const bNorm = normalizeArabicText(b.name);
    const aFeatIdx = normFeatured.findIndex((f) => aNorm.includes(f) || f.includes(aNorm));
    const bFeatIdx = normFeatured.findIndex((f) => bNorm.includes(f) || f.includes(bNorm));

    if (aFeatIdx !== -1 && bFeatIdx !== -1) return aFeatIdx - bFeatIdx;
    if (aFeatIdx !== -1) return -1;
    if (bFeatIdx !== -1) return 1;

    const aMax = Math.max(...a.moshafs.map((m) => m.surahTotal));
    const bMax = Math.max(...b.moshafs.map((m) => m.surahTotal));
    return bMax - aMax;
  });

  cachedQuranData = {
    fetchedAt: Date.now(),
    suwar,
    reciters: parsedReciters,
  };

  return { suwar, reciters: parsedReciters };
}

function parseDurationString(raw?: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + Math.round(parts[2]);
  if (parts.length === 2) return parts[0] * 60 + Math.round(parts[1]);
  return 0;
}

async function searchInternetArchiveFullMp3(query: string): Promise<MediaTrack[]> {
  try {
    const sanitizedPhrase = query.replace(/["\\]/g, ' ').trim();
    if (!sanitizedPhrase) return [];

    const lucene = `mediatype:audio AND (title:("${sanitizedPhrase}") OR creator:("${sanitizedPhrase}"))`;
    const searchUrl =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(lucene)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&sort[]=downloads+desc&rows=5&page=1&output=json`;

    const res = await fetchWithTimeout(searchUrl, 3400);
    if (!res.ok) return [];
    const payload = (await res.json()) as { response?: { docs?: ArchiveSearchDoc[] } };
    const docs = Array.isArray(payload.response?.docs) ? payload.response!.docs! : [];
    if (docs.length === 0) return [];

    const queryTokens = normalizeArabicText(sanitizedPhrase).split(' ').filter((t) => t.length > 1);

    const perItemTracks = await Promise.all(
      docs.slice(0, 4).map(async (doc): Promise<MediaTrack[]> => {
        if (!doc.identifier) return [];
        const creatorName = Array.isArray(doc.creator)
          ? doc.creator[0]
          : doc.creator || doc.title || 'الأرشيف الصوتي المفتوح';

        const docHaystack = normalizeArabicText(`${doc.title || ''} ${creatorName}`);
        if (queryTokens.length > 0 && !queryTokens.some((tok) => docHaystack.includes(tok))) {
          return [];
        }

        try {
          const metaRes = await fetchWithTimeout(
            `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`,
            2600
          );
          if (!metaRes.ok) return [];
          const meta = (await metaRes.json()) as {
            metadata?: Record<string, string>;
            files?: ArchiveFileEntry[];
          };
          if (meta.metadata?.['access-restricted-item'] === 'true') {
            return [];
          }

          const files = Array.isArray(meta.files) ? meta.files : [];
          const mp3Files = files
            .filter(
              (f) =>
                f.name &&
                f.private !== true &&
                f.private !== 'true' &&
                f.name.toLowerCase().endsWith('.mp3') &&
                !f.name.toLowerCase().endsWith('_vbr.mp3')
            )
            .slice(0, 3);

          const built: MediaTrack[] = [];

          mp3Files.forEach((file, fIdx) => {
            const durationSec = parseDurationString(file.length);
            if (durationSec > 0 && durationSec < 40) return;

            const rawFileTitle =
              file.title?.trim() || file.name!.replace(/\.mp3$/i, '').trim();
            const cleanFileTitle = cleanSongMetadataText(rawFileTitle);
            const cleanedDocTitle = cleanSongMetadataText(doc.title || sanitizedPhrase);
            const cleanedCreator = cleanSongMetadataText(creatorName) || 'الأرشيف الصوتي المفتوح';

            const sizeBytes = Number(file.size || 0);
            const sizeMB =
              sizeBytes > 0 ? Math.max(0.5, Number((sizeBytes / (1024 * 1024)).toFixed(1))) : undefined;
            const audioUrl = `https://archive.org/download/${encodeURIComponent(doc.identifier!)}/${encodeURIComponent(file.name!).replace(/%2F/g, '/')}`;

            built.push({
              id: `ia-${doc.identifier}-${fIdx}`,
              title:
                cleanFileTitle && !/^\d+$/.test(cleanFileTitle)
                  ? cleanFileTitle
                  : `${cleanedDocTitle} (${cleanFileTitle || fIdx + 1})`,
              artist: cleanedCreator,
              album: cleanedDocTitle || 'الأرشيف الصوتي المفتوح',
              category: 'archive',
              durationSec,
              sizeMB,
              audioUrl,
              audioFormat: 'mp3',
              sourceKind: 'full-mp3',
              sourceLabel: 'ملف كامل MP3',
              coverType: 'music',
              externalCoverUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier!)}`,
            });
          });

          return built;
        } catch {
          return [];
        }
      })
    );

    return perItemTracks.flat();
  } catch {
    return [];
  }
}

async function searchQuranMatches(query: string): Promise<MediaTrack[]> {
  try {
    const normQuery = normalizeArabicText(query);
    if (!normQuery) return [];

    const hasExplicitQuranIntent =
      normQuery.includes('سوره') ||
      normQuery.includes('قران') ||
      normQuery.includes('تلاوه') ||
      normQuery.includes('مصحف');

    const { suwar, reciters } = await getQuranCatalog();

    const queryTokens = normQuery
      .split(' ')
      .filter((tok) => tok.length > 2 && tok !== 'سوره' && tok !== 'الشيخ' && tok !== 'القاري');

    const matchedSuwar = suwar.filter((s) => {
      const sNorm = normalizeArabicText(s.name);
      return hasExplicitQuranIntent
        ? queryTokens.some((tok) => sNorm.includes(tok) || tok.includes(sNorm))
        : queryTokens.some((tok) => sNorm === tok);
    });

    const matchedReciters = reciters.filter((r) => {
      const rNorm = normalizeArabicText(r.name);
      return queryTokens.length >= 2
        ? queryTokens.every((tok) => rNorm.includes(tok) || matchedSuwar.length > 0) &&
            queryTokens.some((tok) => rNorm.includes(tok))
        : hasExplicitQuranIntent && queryTokens.some((tok) => rNorm.includes(tok));
    });

    if (!hasExplicitQuranIntent && matchedSuwar.length === 0 && matchedReciters.length === 0) {
      return [];
    }

    const targetReciters =
      matchedReciters.length > 0 ? matchedReciters.slice(0, 4) : reciters.slice(0, 5);
    const targetSuwar =
      matchedSuwar.length > 0
        ? matchedSuwar.slice(0, 5)
        : suwar.filter((s) => [1, 2, 18, 36, 55, 67].includes(s.id));

    const results: MediaTrack[] = [];

    for (const reciter of targetReciters) {
      const moshaf = reciter.moshafs[0];
      if (!moshaf) continue;
      const baseServer = sanitizeQuranServerBaseUrl(moshaf.server);

      for (const surah of targetSuwar) {
        if (!moshaf.surahList.includes(surah.id)) continue;
        const padded = String(surah.id).padStart(3, '0');
        results.push({
          id: `qsearch-${reciter.id}-${moshaf.id}-${padded}`,
          title: `سورة ${surah.name.trim()} — تلاوة كاملة`,
          artist: reciter.name,
          album: moshaf.name,
          category: 'quran',
          durationSec: 0,
          audioUrl: `${baseServer}${padded}.mp3`,
          audioFormat: 'mp3',
          sourceKind: 'full-mp3',
          sourceLabel: 'تلاوة كاملة MP3',
          coverType: 'quran',
        });
        if (results.length >= 12) break;
      }
      if (results.length >= 12) break;
    }

    return results;
  } catch {
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Pre-warm Quran 114-Surah catalog, SoundCloud client_id, and ffmpeg check on startup
  void getQuranCatalog().catch(() => {});
  void getSoundCloudClientId().catch(() => {});
  void checkFfmpegAvailable().catch(() => {});

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'Sma3ny' });
  });

  // 1. Unified Multi-Source Full-Duration Audio Search Endpoint
  app.get('/api/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length < 2) {
      res.json({ items: [] });
      return;
    }

    const normQ = normalizeArabicText(rawQuery);
    const isQuranFirst =
      normQ.includes('سوره') || normQ.includes('قران') || normQ.includes('تلاوه');

    const [quranItems, scFullItems, deezerFullItems, archiveItems] = await Promise.all([
      searchQuranMatches(rawQuery),
      searchSoundCloudFullTracks(rawQuery, 26),
      searchDeezerFullCatalog(rawQuery),
      searchInternetArchiveFullMp3(rawQuery),
    ]);

    const ordered = isQuranFirst
      ? [...quranItems, ...scFullItems, ...deezerFullItems, ...archiveItems]
      : [...scFullItems, ...deezerFullItems, ...archiveItems, ...quranItems];

    const combined = deduplicateTracks(ordered);

    res.json({
      query: rawQuery,
      items: combined,
    });
  });

  // 2. Full 114-Surah Real Quran Reciters & Suwar Endpoint
  app.get('/api/quran/catalog', async (_req, res) => {
    try {
      const catalog = await getQuranCatalog();
      res.json(catalog);
    } catch {
      res.status(502).json({
        error: 'تعذر الاتصال بخادم القرآن الكريم حالياً، يرجى إعادة المحاولة.',
      });
    }
  });

  // 3. Self-Healing Full-Duration Song Stream Resolver
  app.get('/api/sc/resolve', async (req, res) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const hint = typeof req.query.hint === 'string' ? req.query.hint.trim() : '';
    if (!isFullResolverRef(ref)) {
      res.status(400).json({ error: 'معرف الأغنية الكاملة غير صالح.' });
      return;
    }

    try {
      const resolved = await resolveSoundCloudRefToStream(ref, hint);
      if (!resolved) {
        res.status(404).json({ error: 'تعذر العثور على البث الكامل لهذه الأغنية.' });
        return;
      }

      const proxyRef = resolved.trackId > 0 ? `sc://${resolved.trackId}` : ref;
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        trackId: resolved.trackId,
        durationSec: resolved.durationSec,
        mode: resolved.mode,
        url: resolved.streamUrl,
        proxyPlaylistUrl:
          resolved.mode === 'hls'
            ? `/api/sc/playlist.m3u8?ref=${encodeURIComponent(proxyRef)}&hint=${encodeURIComponent(hint)}`
            : '',
      });
    } catch {
      res.status(502).json({ error: 'تعذر الاتصال بخادم البث الصوتي الكامل.' });
    }
  });

  // 4. Proxied HLS VOD Playlist Fallback
  app.get('/api/sc/playlist.m3u8', async (req, res) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const hint = typeof req.query.hint === 'string' ? req.query.hint.trim() : '';
    if (!isFullResolverRef(ref)) {
      res.status(400).end();
      return;
    }

    try {
      const resolved = await resolveSoundCloudRefToStream(ref, hint);
      if (!resolved || resolved.mode !== 'hls') {
        res.status(404).end();
        return;
      }

      const m3u8Res = await fetchWithTimeout(resolved.streamUrl, 5500);
      if (!m3u8Res.ok) {
        res.status(502).end();
        return;
      }

      const rawM3u8 = await m3u8Res.text();
      const rewritten = rawM3u8
        .replace(/URI="(https?:\/\/[^"]+)"/g, (_m, u: string) => {
          return `URI="/api/stream?url=${encodeURIComponent(u)}"`;
        })
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return `/api/stream?url=${encodeURIComponent(trimmed)}`;
          }
          return line;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewritten);
    } catch {
      res.status(502).end();
    }
  });

  // 5. Full-Duration Song Download Endpoint (MP3 192k or fast native M4A 160k)
  app.get('/api/sc/download', async (req, res) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const hint = typeof req.query.hint === 'string' ? req.query.hint.trim() : '';
    const requestedFormat = req.query.format === 'm4a' ? 'm4a' : 'mp3';
    const rawFilename =
      typeof req.query.filename === 'string' && req.query.filename.trim()
        ? req.query.filename.trim()
        : `sma3ny-song.${requestedFormat}`;

    if (!isFullResolverRef(ref)) {
      res.status(400).json({ error: 'رابط تحميل الأغنية غير صالح.' });
      return;
    }

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    try {
      const resolved = await resolveSoundCloudRefToStream(ref, hint);
      if (!resolved) {
        res.status(404).json({ error: 'تعذر تجهيز الملف الكامل للتحميل.' });
        return;
      }

      const baseFilenameWithoutExt = rawFilename.replace(/\.(mp3|m4a)$/i, '');

      if (resolved.mode === 'direct') {
        const finalName = `${baseFilenameWithoutExt}.mp3`;
        const safeAscii = finalName.replace(/[^\x20-\x7E]/g, '_') || 'sma3ny-song.mp3';
        const upstream = await fetch(resolved.streamUrl, { redirect: 'follow' });
        if (!upstream.ok || !upstream.body) {
          res.status(502).json({ error: 'تعذر جلب الملف المباشر.' });
          return;
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(finalName)}`
        );
        res.flushHeaders();
        const stream = Readable.fromWeb(upstream.body as never);
        stream.on('error', () => res.end());
        req.on('close', () => stream.destroy());
        stream.pipe(res);
        return;
      }

      const m3u8Res = await fetchWithTimeout(resolved.streamUrl, 6000);
      if (!m3u8Res.ok) {
        res.status(502).json({ error: 'تعذر قراءة قائمة المقاطع الكاملة.' });
        return;
      }
      const m3u8Text = await m3u8Res.text();
      const parsed = parseVodM3u8Segments(m3u8Text);
      const allUrls = [
        ...(parsed.initUrl ? [parsed.initUrl] : []),
        ...parsed.segments.map((s) => s.url),
      ];

      if (allUrls.length === 0) {
        res.status(502).json({ error: 'لا توجد بيانات صوتية صالحة في المصدر.' });
        return;
      }

      const hasFfmpeg = await checkFfmpegAvailable();
      const shouldTranscodeMp3 =
        requestedFormat === 'mp3' && hasFfmpeg && allUrls.length <= 185;

      const finalExt = shouldTranscodeMp3 ? 'mp3' : 'm4a';
      const finalName = `${baseFilenameWithoutExt}.${finalExt}`;
      const safeAscii = finalName.replace(/[^\x20-\x7E]/g, '_') || `sma3ny-song.${finalExt}`;

      res.setHeader('Content-Type', shouldTranscodeMp3 ? 'audio/mpeg' : 'audio/mp4');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(finalName)}`
      );
      res.flushHeaders();

      if (shouldTranscodeMp3) {
        const ff = spawn('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          'pipe:0',
          '-vn',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '192k',
          '-f',
          'mp3',
          'pipe:1',
        ]);

        ff.stdout.on('data', (chunk: Buffer) => {
          if (!aborted && !res.writableEnded) {
            res.write(chunk);
          }
        });
        ff.stdout.on('end', () => {
          if (!res.writableEnded) res.end();
        });
        ff.on('error', () => {
          if (!res.writableEnded) res.end();
        });
        ff.stdin.on('error', () => {});

        req.on('close', () => {
          ff.kill('SIGKILL');
        });

        const BATCH_SIZE = 10;
        for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
          if (aborted) break;
          const batch = allUrls.slice(i, i + BATCH_SIZE);
          const buffers = await Promise.all(
            batch.map(async (u) => {
              const segRes = await fetchWithTimeout(u, 8000);
              if (!segRes.ok) throw new Error('Segment fetch failed');
              return Buffer.from(await segRes.arrayBuffer());
            })
          );
          for (const buf of buffers) {
            if (aborted || ff.stdin.destroyed) break;
            const canContinue = ff.stdin.write(buf);
            if (!canContinue) {
              await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
            }
          }
        }
        if (!ff.stdin.destroyed) {
          ff.stdin.end();
        }
        return;
      }

      const BATCH_SIZE = 12;
      for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
        if (aborted || res.writableEnded) break;
        const batch = allUrls.slice(i, i + BATCH_SIZE);
        const buffers = await Promise.all(
          batch.map(async (u) => {
            const segRes = await fetchWithTimeout(u, 8000);
            if (!segRes.ok) throw new Error('Segment fetch failed');
            return Buffer.from(await segRes.arrayBuffer());
          })
        );
        for (const buf of buffers) {
          if (aborted || res.writableEnded) break;
          res.write(buf);
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'تعذر تنزيل الأغنية الكاملة حالياً.' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // 6. Fast Targeted Audio Slice Endpoint for Ringtone Trimming on Full-Length Songs
  app.get('/api/sc/trim-source', async (req, res) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const hint = typeof req.query.hint === 'string' ? req.query.hint.trim() : '';
    const startSec = Math.max(0, Number(req.query.start || 0));
    const endSec = Math.max(startSec + 2, Number(req.query.end || startSec + 20));

    if (!isFullResolverRef(ref)) {
      res.status(400).json({ error: 'معرف المقطع غير صالح للقص.' });
      return;
    }

    try {
      const resolved = await resolveSoundCloudRefToStream(ref, hint);
      if (!resolved) {
        res.status(404).json({ error: 'تعذر الوصول للمقطع الصوتي.' });
        return;
      }

      if (resolved.mode === 'direct') {
        const up = await fetchWithTimeout(resolved.streamUrl, 8000, {
          headers: { Range: `bytes=0-${6 * 1024 * 1024 - 1}` },
        });
        if (!up.ok && up.status !== 206) {
          res.status(502).end();
          return;
        }
        const buf = Buffer.from(await up.arrayBuffer());
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Slice-Offset-Sec', '0');
        res.send(buf);
        return;
      }

      const m3u8Res = await fetchWithTimeout(resolved.streamUrl, 5500);
      if (!m3u8Res.ok) {
        res.status(502).end();
        return;
      }
      const parsed = parseVodM3u8Segments(await m3u8Res.text());

      let cursor = 0;
      let sliceOffsetSec = 0;
      let started = false;
      const chosenUrls: string[] = parsed.initUrl ? [parsed.initUrl] : [];

      for (const seg of parsed.segments) {
        const segStart = cursor;
        const segEnd = cursor + seg.durationSec;
        cursor = segEnd;

        if (segEnd < startSec) continue;
        if (segStart > endSec + 2) break;

        if (!started) {
          started = true;
          sliceOffsetSec = segStart;
        }
        chosenUrls.push(seg.url);
      }

      if (chosenUrls.length <= (parsed.initUrl ? 1 : 0) && parsed.segments[0]) {
        chosenUrls.push(parsed.segments[0].url);
        sliceOffsetSec = 0;
      }

      const buffers = await Promise.all(
        chosenUrls.map(async (u) => {
          const r = await fetchWithTimeout(u, 6000);
          if (!r.ok) throw new Error('Failed segment');
          return Buffer.from(await r.arrayBuffer());
        })
      );

      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('X-Slice-Offset-Sec', String(sliceOffsetSec));
      res.send(Buffer.concat(buffers));
    } catch {
      res.status(502).json({ error: 'تعذر جلب شريحة النغمة من الأغنية الكاملة.' });
    }
  });

  // 7. Chunk-Capped Audio Stream Proxy (8 MB slices — safe for 240 MB Surahs on Cloud Run)
  app.get('/api/stream', async (req, res) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const maxBytesParam = Number(req.query.maxBytes || 0);

    if (!isAllowedAudioProxyUrl(targetUrl)) {
      res.status(400).json({ error: 'رابط المصدر الصوتي غير مدعوم.' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    try {
      const forwardHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      };

      const incomingRange = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
      if (maxBytesParam > 0 && Number.isFinite(maxBytesParam)) {
        const cap = Math.min(Math.floor(maxBytesParam), MAX_STREAM_CHUNK_BYTES);
        forwardHeaders.Range = `bytes=0-${cap - 1}`;
      } else if (incomingRange.startsWith('bytes=')) {
        const rangeMatch = incomingRange.match(/^bytes=(\d+)-(\d*)$/);
        if (rangeMatch) {
          const start = Number(rangeMatch[1]);
          const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : null;
          const cappedEnd =
            requestedEnd !== null
              ? Math.min(requestedEnd, start + MAX_STREAM_CHUNK_BYTES - 1)
              : start + MAX_STREAM_CHUNK_BYTES - 1;
          forwardHeaders.Range = `bytes=${start}-${cappedEnd}`;
        } else {
          forwardHeaders.Range = incomingRange;
        }
      } else {
        forwardHeaders.Range = `bytes=0-${MAX_STREAM_CHUNK_BYTES - 1}`;
      }

      const upstream = await fetch(targetUrl, {
        headers: forwardHeaders,
        redirect: 'follow',
        signal: abortController.signal,
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).end();
        return;
      }

      const statusToSend = maxBytesParam > 0 ? 200 : upstream.status;
      res.status(statusToSend);

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');

      const contentLength = upstream.headers.get('content-length');
      if (contentLength && Number(contentLength) <= MAX_STREAM_CHUNK_BYTES * 2) {
        res.setHeader('Content-Length', contentLength);
      }

      if (statusToSend === 206) {
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);
      }

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'تعذر بث الملف الصوتي من المصدر.' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // 8. Cloud-Run-Safe Direct File Download Proxy
  app.get('/api/download', async (req, res) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawFilename =
      typeof req.query.filename === 'string' && req.query.filename.trim()
        ? req.query.filename.trim()
        : 'sma3ny-audio.mp3';

    if (!isAllowedAudioProxyUrl(targetUrl)) {
      res.status(400).json({ error: 'رابط التحميل غير صالح أو غير مدعوم.' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: abortController.signal,
      });

      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: 'تعذر جلب الملف الأصلي من المصدر.' });
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      const safeAsciiFallback = rawFilename.replace(/[^\x20-\x7E]/g, '_') || 'sma3ny-audio.mp3';
      const encodedUtf8Name = encodeURIComponent(rawFilename);

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAsciiFallback}"; filename*=UTF-8''${encodedUtf8Name}`
      );

      const contentLength = upstream.headers.get('content-length');
      if (contentLength && Number(contentLength) > 0 && Number(contentLength) <= 24 * 1024 * 1024) {
        res.setHeader('Content-Length', contentLength);
      } else {
        res.flushHeaders();
      }

      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'حدث خطأ أثناء تنزيل الملف الصوتي.' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // 9. Quran Uthmani Surah Text + Verse Timing Ratios (1..114)
  const quranTextCache = new Map<
    number,
    { surahNumber: number; ayahs: QuranAyahItem[] }
  >();

  app.get('/api/quran/text/:surahNumber', async (req, res) => {
    const surahNum = Number(req.params.surahNumber);
    if (!Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114) {
      res.status(400).json({ error: 'رقم السورة غير صالح (1 إلى 114).' });
      return;
    }

    const cached = quranTextCache.get(surahNum);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const [versesRes, timingRes] = await Promise.allSettled([
        fetchWithTimeout(
          `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahNum}`,
          7000
        ),
        fetchWithTimeout(
          `https://api.quran.com/api/v4/chapter_recitations/7/${surahNum}`,
          6000
        ),
      ]);

      let rawAyahs: Array<{ numberInSurah: number; text: string }> = [];

      if (versesRes.status === 'fulfilled' && versesRes.value.ok) {
        const vJson = (await versesRes.value.json()) as {
          verses?: Array<{ verse_key?: string; text_uthmani?: string }>;
        };
        if (Array.isArray(vJson.verses) && vJson.verses.length > 0) {
          rawAyahs = vJson.verses.map((v, idx) => {
            const keyNum = Number(v.verse_key?.split(':')[1] || idx + 1);
            return {
              numberInSurah: Number.isFinite(keyNum) ? keyNum : idx + 1,
              text: (v.text_uthmani || '').replace(/^\uFEFF/, '').trim(),
            };
          });
        }
      }

      if (rawAyahs.length === 0) {
        const fallbackRes = await fetchWithTimeout(
          `https://api.alquran.cloud/v1/surah/${surahNum}/quran-uthmani`,
          7000
        );
        if (fallbackRes.ok) {
          const fJson = (await fallbackRes.json()) as {
            data?: { ayahs?: Array<{ numberInSurah?: number; text?: string }> };
          };
          if (Array.isArray(fJson.data?.ayahs)) {
            rawAyahs = fJson.data.ayahs.map((a, idx) => ({
              numberInSurah: a.numberInSurah || idx + 1,
              text: (a.text || '').replace(/^\uFEFF/, '').trim(),
            }));
          }
        }
      }

      if (rawAyahs.length === 0) {
        res.status(502).json({ error: 'تعذر جلب نص السورة حالياً.' });
        return;
      }

      // Compute verse timing ratios [0..1]
      const timingMap = new Map<number, { fromMs: number; toMs: number }>();
      let totalMs = 0;

      if (timingRes.status === 'fulfilled' && timingRes.value.ok) {
        const tJson = (await timingRes.value.json()) as {
          audio_file?: {
            timestamps?: Array<{
              verse_key?: string;
              timestamp_from?: number;
              timestamp_to?: number;
            }>;
          };
        };
        const stamps = tJson.audio_file?.timestamps;
        if (Array.isArray(stamps) && stamps.length > 0) {
          for (const st of stamps) {
            const vNum = Number(st.verse_key?.split(':')[1] || 0);
            const fromMs = Number(st.timestamp_from || 0);
            const toMs = Number(st.timestamp_to || 0);
            if (vNum > 0 && toMs > fromMs) {
              timingMap.set(vNum, { fromMs, toMs });
              if (toMs > totalMs) totalMs = toMs;
            }
          }
        }
      }

      const totalCharWeight = rawAyahs.reduce(
        (acc, a) => acc + Math.max(8, a.text.length),
        0
      );
      let runningChars = 0;

      const ayahs: QuranAyahItem[] = rawAyahs.map((a) => {
        const weight = Math.max(8, a.text.length);
        const charStart = runningChars / totalCharWeight;
        runningChars += weight;
        const charEnd = runningChars / totalCharWeight;

        const exact = timingMap.get(a.numberInSurah);
        if (exact && totalMs > 0) {
          return {
            numberInSurah: a.numberInSurah,
            text: a.text,
            startRatio: Number((exact.fromMs / totalMs).toFixed(5)),
            endRatio: Number((exact.toMs / totalMs).toFixed(5)),
          };
        }

        return {
          numberInSurah: a.numberInSurah,
          text: a.text,
          startRatio: Number(charStart.toFixed(5)),
          endRatio: Number(charEnd.toFixed(5)),
        };
      });

      const payload = { surahNumber: surahNum, ayahs };
      quranTextCache.set(surahNum, payload);
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'حدث خطأ أثناء تحميل آيات السورة.' });
    }
  });

  // 10. Multi-Source Synced & Plain Song Lyrics Endpoint
  const ARABIC_ARTIST_LATIN_MAP: Array<[string, string]> = [
    ['عمرو دياب', 'Amr Diab'],
    ['شيرين', 'Sherine'],
    ['تامر حسني', 'Tamer Hosny'],
    ['ام كلثوم', 'Umm Kulthum'],
    ['عبدالحليم حافظ', 'Abdel Halim Hafez'],
    ['فيروز', 'Fairuz'],
    ['محمد عبده', 'Mohammed Abdu'],
    ['اليسا', 'Elissa'],
    ['اصاله', 'Assala'],
    ['كاظم الساهر', 'Kadim Al Sahir'],
    ['ماجد المهندس', 'Majid Al Mohandis'],
    ['وائل كفوري', 'Wael Kfoury'],
    ['نانسي عجرم', 'Nancy Ajram'],
    ['حماقي', 'Mohamed Hamaki'],
    ['رامي صبري', 'Ramy Sabry'],
    ['بهاء سلطان', 'Bahaa Sultan'],
    ['كايروكي', 'Cairokee'],
    ['ويجز', 'Wegz'],
    ['حسين الجسمي', 'Hussain Al Jassmi'],
    ['انغام', 'Angham'],
    ['فضل شاكر', 'Fadel Chaker'],
    ['جورج وسوف', 'George Wassouf'],
    ['صابر الرباعي', 'Saber Rebai'],
    ['راشد الماجد', 'Rashed Al Majid'],
    ['عبدالمجيد عبدالله', 'Abdul Majeed Abdullah'],
    ['تامر عاشور', 'Tamer Ashour'],
    ['احمد سعد', 'Ahmed Saad'],
    ['حمزه نمره', 'Hamza Namira'],
    ['الشامي', 'Al Shami'],
    ['ناصيف زيتون', 'Nassif Zeytoun'],
    ['وائل جسار', 'Wael Jassar'],
    ['راغب علامه', 'Ragheb Alama'],
    ['ورده', 'Warda'],
  ];

  interface LyricsResponsePayload {
    found: boolean;
    syncedLyrics: string | null;
    plainLyrics: string | null;
    matchedTitle?: string;
    matchedArtist?: string;
  }

  const lyricsCache = new Map<string, LyricsResponsePayload>();

  app.get('/api/lyrics', async (req, res) => {
    const rawTitle = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const rawArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';

    if (!rawTitle) {
      res.status(400).json({ found: false, syncedLyrics: null, plainLyrics: null });
      return;
    }

    const cacheKey = `${normalizeArabicText(rawTitle)}::${normalizeArabicText(rawArtist)}`;
    const cached = lyricsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Clean years, parentheticals, and split "Artist - Song" if embedded in title
    let cleanTitle = cleanSongMetadataText(rawTitle)
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\b(الاصلية|الأصلية|كاملة|كامل|البوم|ألبوم|اغنية|أغنية|كلمات)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let cleanArtist = cleanSongMetadataText(rawArtist)
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(عشاق|البوم|ألبوم|قناة)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanTitle.includes(' - ')) {
      const parts = cleanTitle.split(' - ').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const normP0 = normalizeArabicText(parts[0]);
        const normArt = normalizeArabicText(cleanArtist);
        if (normArt && normP0.includes(normArt)) {
          cleanTitle = parts.slice(1).join(' ');
        } else if (normArt && normalizeArabicText(parts[parts.length - 1]).includes(normArt)) {
          cleanTitle = parts.slice(0, -1).join(' ');
        } else {
          cleanTitle = parts[parts.length - 1];
          if (!cleanArtist) cleanArtist = parts[0];
        }
      }
    }

    const combinedNorm = normalizeArabicText(`${rawTitle} ${rawArtist}`);
    let mappedLatinArtist = '';
    for (const [arKey, latName] of ARABIC_ARTIST_LATIN_MAP) {
      if (combinedNorm.includes(arKey)) {
        mappedLatinArtist = latName;
        cleanTitle = cleanTitle
          .replace(new RegExp(arKey.split(' ').join('\\s*'), 'gi'), ' ')
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }
    }

    const normTargetTokens = normalizeArabicText(cleanTitle)
      .split(' ')
      .filter((w) => w.length >= 2);

    try {
      const fullSearchTerm = `${cleanArtist} ${cleanTitle}`.trim();
      const [itunesSettled, ovhSugSettled] = await Promise.allSettled([
        fetchWithTimeout(
          `https://itunes.apple.com/search?term=${encodeURIComponent(fullSearchTerm)}&entity=song&limit=5&lang=en_us`,
          4500
        ),
        fetchWithTimeout(
          `https://api.lyrics.ovh/suggest/${encodeURIComponent(fullSearchTerm)}`,
          4500
        ),
      ]);

      const latinCandidates: Array<{ title: string; artist: string }> = [];

      if (/[a-zA-Z]{2,}/.test(cleanTitle)) {
        latinCandidates.push({
          title: cleanTitle.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim(),
          artist: (mappedLatinArtist || cleanArtist)
            .replace(/[^\x20-\x7E]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        });
      }

      if (ovhSugSettled.status === 'fulfilled' && ovhSugSettled.value.ok) {
        const ovhJson = (await ovhSugSettled.value.json()) as {
          data?: Array<{ title?: string; artist?: { name?: string } }>;
        };
        for (const r of ovhJson.data || []) {
          const t = r.title || '';
          const a = r.artist?.name || '';
          if (/[a-zA-Z]{2,}/.test(t) && !/عزف|karaoke|instrumental/i.test(`${t} ${a}`)) {
            latinCandidates.push({
              title: t.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim(),
              artist: a.trim(),
            });
          }
        }
      }

      if (itunesSettled.status === 'fulfilled' && itunesSettled.value.ok) {
        const itJson = (await itunesSettled.value.json()) as {
          results?: Array<{ trackName?: string; artistName?: string }>;
        };
        for (const r of itJson.results || []) {
          if (r.trackName && /[a-zA-Z]{2,}/.test(r.trackName)) {
            latinCandidates.push({
              title: r.trackName.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim(),
              artist: (r.artistName || mappedLatinArtist).trim(),
            });
          }
        }
      }

      interface LrcLibItem {
        trackName?: string;
        artistName?: string;
        syncedLyrics?: string | null;
        plainLyrics?: string | null;
      }

      const queryLrcLib = async (qStr: string): Promise<LrcLibItem[]> => {
        const cleanAscii = qStr.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanAscii.length < 2) return [];
        const r = await fetchWithTimeout(
          `https://lrclib.net/api/search?q=${encodeURIComponent(cleanAscii)}`,
          5000,
          { headers: { 'User-Agent': 'Sma3nyAudioPortal/1.0 (https://sma3ny.app)' } }
        );
        if (!r.ok) return [];
        const arr = (await r.json()) as LrcLibItem[];
        return Array.isArray(arr) ? arr : [];
      };

      const triedQueries = new Set<string>();
      const lrcQueries: string[] = [];

      for (const c of latinCandidates) {
        if (!c.title) continue;
        const q = `${c.artist} ${c.title}`.trim();
        const key = q.toLowerCase();
        if (q.length >= 3 && !triedQueries.has(key)) {
          triedQueries.add(key);
          lrcQueries.push(q);
          if (lrcQueries.length >= 3) break;
        }
      }

      if (mappedLatinArtist && !triedQueries.has(mappedLatinArtist.toLowerCase())) {
        lrcQueries.push(mappedLatinArtist);
      }

      const settledBatches = await Promise.allSettled(
        lrcQueries.map(async (lq) => ({ lq, items: await queryLrcLib(lq) }))
      );

      let globalBest: LrcLibItem | null = null;
      let globalBestScore = -1;

      for (const batch of settledBatches) {
        if (batch.status !== 'fulfilled') continue;
        const { lq, items } = batch.value;
        const withLyrics = items.filter((it) => it.syncedLyrics || it.plainLyrics);

        for (const it of withLyrics) {
          const lyricSnippet = (it.syncedLyrics || it.plainLyrics || '').slice(0, 800);
          const hayNorm = normalizeArabicText(
            `${it.trackName || ''} ${it.artistName || ''} ${lyricSnippet}`
          );
          const matchedTokens = normTargetTokens.filter((tok) => hayNorm.includes(tok));

          if (lq === mappedLatinArtist && matchedTokens.length === 0) {
            continue;
          }

          let score = matchedTokens.length * 25;
          if (lq !== mappedLatinArtist) {
            score += 8;
          }
          if (it.syncedLyrics) score += 10;
          if (/[\u0600-\u06FF]/.test(lyricSnippet)) score += 12;

          if (score > globalBestScore) {
            globalBestScore = score;
            globalBest = it;
          }
        }
      }

      if (globalBest) {
        const foundPayload: LyricsResponsePayload = {
          found: true,
          syncedLyrics: globalBest.syncedLyrics || null,
          plainLyrics: globalBest.plainLyrics || null,
          matchedTitle: globalBest.trackName,
          matchedArtist: globalBest.artistName,
        };
        lyricsCache.set(cacheKey, foundPayload);
        res.json(foundPayload);
        return;
      }

      // Fallback to Lyrics.ovh v1
      const ovhPairs: Array<{ artist: string; title: string }> = [
        ...latinCandidates.slice(0, 2),
        { artist: cleanArtist || mappedLatinArtist, title: cleanTitle },
      ].filter((p) => Boolean(p.artist && p.title));

      for (const pair of ovhPairs.slice(0, 2)) {
        const ovhRes = await fetchWithTimeout(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(pair.artist)}/${encodeURIComponent(pair.title)}`,
          4500
        );
        if (ovhRes.ok) {
          const ovhData = (await ovhRes.json()) as { lyrics?: string };
          const text = (ovhData.lyrics || '').replace(/^Paroles de la chanson.*?\r?\n/i, '').trim();
          if (text.length > 20) {
            const payload: LyricsResponsePayload = {
              found: true,
              syncedLyrics: null,
              plainLyrics: text,
              matchedTitle: pair.title,
              matchedArtist: pair.artist,
            };
            lyricsCache.set(cacheKey, payload);
            res.json(payload);
            return;
          }
        }
      }

      res.json({ found: false, syncedLyrics: null, plainLyrics: null });
    } catch {
      res.json({ found: false, syncedLyrics: null, plainLyrics: null });
    }
  });

  // 11. Live Radio 24/7 Catalog & CORS-Safe Stream Proxy
  const CURATED_LIVE_RADIOS: LiveRadioStation[] = [
    {
      id: 'cairo-quran-live',
      name: 'إذاعة القرآن الكريم من القاهرة',
      subtitle: 'البث الحي المباشر على مدار الساعة · مصر',
      category: 'quran_radio',
      streamUrl: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
      directCors: false,
      featured: true,
    },
    {
      id: 'makkah-quran-live',
      name: 'إذاعة القرآن الكريم من مكة المكرمة',
      subtitle: 'بث مباشر متواصل لتلاوات الحرمين الشريفين',
      category: 'quran_radio',
      streamUrl: 'https://stream.radiojar.com/4wqre23fytzuv',
      directCors: false,
      featured: true,
    },
    {
      id: 'umm-kulthum-247',
      name: 'إذاعة كوكب الشرق أم كلثوم 24/7',
      subtitle: 'روائع وحفلات الطرب الأصيل بدون توقف',
      category: 'music_radio',
      streamUrl: 'https://stream.zeno.fm/zsgrfxg71s8uv',
      directCors: false,
      featured: true,
    },
    {
      id: 'amr-diab-247',
      name: 'إذاعة عمرو دياب 24/7',
      subtitle: 'أجمل أغاني وألبومات الهضبة على مدار الساعة',
      category: 'music_radio',
      streamUrl: 'https://stream.zeno.fm/xa4yhh4k838uv',
      directCors: false,
      featured: true,
    },
    {
      id: 'fairuz-247',
      name: 'إذاعة فيروز والصباحيات 24/7',
      subtitle: 'أغاني فيروز والأخوين رحباني طوال اليوم',
      category: 'music_radio',
      streamUrl: 'https://stream.zeno.fm/xkhnk4vee18uv',
      directCors: false,
      featured: true,
    },
    {
      id: 'abdel-halim-247',
      name: 'إذاعة عبد الحليم حافظ 24/7',
      subtitle: 'أغاني العندليب الأسمر الكاملة بلا انقطاع',
      category: 'music_radio',
      streamUrl: 'https://stream.zeno.fm/8a4eqkd0pnhvv',
      directCors: false,
      featured: true,
    },
    {
      id: 'rotana-tarab-fm',
      name: 'إذاعة روتانا طرب وموسيقى عربية',
      subtitle: 'مختارات غنائية خليجية وعربية مباشرة',
      category: 'music_radio',
      streamUrl: 'http://philae.shoutca.st:8250/stream',
      directCors: false,
    },
    {
      id: 'radio-orient-ar',
      name: 'إذاعة الشرق للطرب والأغاني العربية',
      subtitle: 'بث موسيقي ومنوعات عربية مباشرة',
      category: 'music_radio',
      streamUrl: 'https://stream.rcs.revma.com/7hnrkawf4p8uv.mp3',
      directCors: false,
    },
    {
      id: 'radio-hits-cairo',
      name: 'راديو هيتس القاهرة 88.2',
      subtitle: 'أحدث الأغاني العربية والشبابية المباشرة',
      category: 'music_radio',
      streamUrl: 'https://radiohits882.radioca.st/;',
      directCors: false,
    },
    {
      id: 'afasy-live-radio',
      name: 'إذاعة القارئ مشاري راشد العفاسي',
      subtitle: 'تلاوات مرتلة على مدار الساعة',
      category: 'quran_radio',
      streamUrl: 'https://backup.qurango.net/radio/mishary_alafasi',
      directCors: true,
      featured: true,
    },
    {
      id: 'abdulbasit-mojawwad-radio',
      name: 'إذاعة الشيخ عبد الباسط عبد الصمد (مجود)',
      subtitle: 'روائع التلاوات المجودة الخالدة 24/7',
      category: 'quran_radio',
      streamUrl: 'https://backup.qurango.net/radio/abdulbasit_abdulsamad_mojawwad',
      directCors: true,
      featured: true,
    },
    {
      id: 'minshawi-mojawwad-radio',
      name: 'إذاعة الشيخ محمد صديق المنشاوي (مجود)',
      subtitle: 'تلاوات خاشعة متواصلة على مدار الساعة',
      category: 'quran_radio',
      streamUrl: 'https://backup.qurango.net/radio/mohammed_siddiq_alminshawi_mojawwad',
      directCors: true,
    },
    {
      id: 'maher-live-radio',
      name: 'إذاعة الشيخ ماهر المعيقلي',
      subtitle: 'تلاوات كاملة متواصلة على مدار الساعة',
      category: 'quran_radio',
      streamUrl: 'https://backup.qurango.net/radio/maher',
      directCors: true,
    },
    {
      id: 'ruqyah-live-radio',
      name: 'إذاعة الرقية الشرعية وآيات السكينة',
      subtitle: 'بث مباشر هادئ على مدار الساعة',
      category: 'quran_radio',
      streamUrl: 'https://backup.qurango.net/radio/roqiah',
      directCors: true,
    },
  ];

  let radiosCache: { expiresAt: number; stations: LiveRadioStation[] } | null = null;

  app.get('/api/radios', async (_req, res) => {
    if (radiosCache && Date.now() < radiosCache.expiresAt) {
      res.json({ stations: radiosCache.stations });
      return;
    }

    const stations: LiveRadioStation[] = [...CURATED_LIVE_RADIOS];
    const seenUrls = new Set(stations.map((s) => s.streamUrl));

    try {
      const apiRes = await fetchWithTimeout(
        'https://mp3quran.net/api/v3/radios?language=ar',
        6000
      );
      if (apiRes.ok) {
        const data = (await apiRes.json()) as {
          radios?: Array<{ id?: number; name?: string; url?: string }>;
        };
        for (const item of (data.radios || []).slice(0, 80)) {
          const cleanUrl = (item.url || '').trim().replace(/^http:\/\//i, 'https://');
          if (!cleanUrl || seenUrls.has(cleanUrl) || !isAllowedRadioStreamUrl(cleanUrl)) {
            continue;
          }
          seenUrls.add(cleanUrl);
          const cleanName = (item.name || '').trim();
          if (!cleanName) continue;
          stations.push({
            id: `mp3q-radio-${item.id || stations.length}`,
            name: cleanName.startsWith('إذاعة') ? cleanName : `إذاعة ${cleanName}`,
            subtitle: 'بث قرآني مباشر 24/7',
            category: 'quran_radio',
            streamUrl: cleanUrl,
            directCors: cleanUrl.includes('qurango.net') || cleanUrl.includes('mp3quran.net'),
          });
        }
      }
    } catch {
      // Serve curated stations cleanly even if external catalog is slow
    }

    radiosCache = {
      expiresAt: Date.now() + 30 * 60 * 1000,
      stations,
    };
    res.json({ stations });
  });

  app.get('/api/radio/stream', async (req, res) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!isAllowedRadioStreamUrl(targetUrl)) {
      res.status(400).json({ error: 'رابط البث الإذاعي غير مدعوم.' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Icy-MetaData': '0',
        },
        redirect: 'follow',
        signal: abortController.signal,
      });

      if (!upstream.ok || !upstream.body) {
        res.status(502).end();
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.flushHeaders();

      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).end();
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint not found' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sma3ny real-audio server running on http://localhost:${PORT}`);
  });
}

startServer();
