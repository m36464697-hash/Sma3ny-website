export type MediaCategory = 'all' | 'quran' | 'music' | 'archive' | 'nasheed';

export type SortOption = 'relevance' | 'full_first' | 'shortest' | 'longest';

export type CoverType = 'quran' | 'music' | 'nasheed' | 'khaleeji' | 'ringtones' | 'podcast';

export type AudioSourceKind = 'full-mp3' | 'official-stream';

export type RepeatMode = 'off' | 'all' | 'one';

export type EqPresetId =
  | 'flat'
  | 'bass_boost'
  | 'vocal_quran'
  | 'warm_tarab'
  | 'live_concert'
  | 'treble_clear'
  | 'custom';

export interface EqPreset {
  id: EqPresetId;
  label: string;
  gains: [number, number, number, number, number];
}

export const EQ_BAND_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;

export const EQ_BAND_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'] as const;

export const EQ_PRESETS: Record<Exclude<EqPresetId, 'custom'>, EqPreset> = {
  flat: {
    id: 'flat',
    label: 'قياسي متوازن',
    gains: [0, 0, 0, 0, 0],
  },
  bass_boost: {
    id: 'bass_boost',
    label: 'تضخيم الباس (Bass Boost)',
    gains: [8, 6, 0, 1, 2],
  },
  vocal_quran: {
    id: 'vocal_quran',
    label: 'نقاء التلاوة والصوت البشري',
    gains: [-2, -1, 4, 5, 2],
  },
  warm_tarab: {
    id: 'warm_tarab',
    label: 'طرب دافئ وعود',
    gains: [4, 3, 2, 1, -1],
  },
  live_concert: {
    id: 'live_concert',
    label: 'حفلة حية ومحيطي',
    gains: [5, 3, -1, 3, 5],
  },
  treble_clear: {
    id: 'treble_clear',
    label: 'صفاء عالٍ وسماعات',
    gains: [2, 0, 1, 4, 7],
  },
};

export function clampEqGains(
  raw: unknown
): [number, number, number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 5) {
    return [0, 0, 0, 0, 0];
  }
  const clamped = raw.map((v) => {
    const num = Number(v);
    if (!Number.isFinite(num)) return 0;
    return Math.max(-12, Math.min(12, Math.round(num)));
  });
  return clamped as [number, number, number, number, number];
}

export interface SyncedLyricLine {
  timeSec: number;
  text: string;
}

export interface QuranAyahItem {
  numberInSurah: number;
  text: string;
  startRatio: number;
  endRatio: number;
}

export interface LiveRadioStation {
  id: string;
  name: string;
  subtitle: string;
  category: 'quran_radio' | 'music_radio';
  streamUrl: string;
  directCors: boolean;
  featured?: boolean;
}

export interface MediaTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  category: Exclude<MediaCategory, 'all'>;
  durationSec: number;
  sizeMB?: number;
  audioUrl: string;
  audioFormat: 'mp3' | 'm4a';
  sourceKind: AudioSourceKind;
  sourceLabel: string;
  coverType: CoverType;
  externalCoverUrl?: string;
  isLiveStream?: boolean;
}

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  createdAtIso: string;
  updatedAtIso: string;
  tracks: MediaTrack[];
}

export interface QuranSurahMeta {
  id: number;
  name: string;
  makkia: number;
}

export interface QuranMoshaf {
  id: number;
  name: string;
  server: string;
  surahTotal: number;
  surahList: number[];
}

export interface QuranReciter {
  id: number;
  name: string;
  moshafs: QuranMoshaf[];
}

export interface DownloadRecord {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  formatLabel: string;
  sizeMB?: number;
  audioUrl: string;
  timestampIso: string;
}

export const CATEGORY_LABELS: Record<MediaCategory, string> = {
  all: 'كل الصوتيات',
  music: 'الأغاني الكاملة',
  archive: 'أرشيف MP3 المفتوح',
  quran: 'القرآن الكريم (114 سورة)',
  nasheed: 'أناشيد وابتهالات',
};

const ALLOWED_AUDIO_HOST_SUFFIXES = [
  'mp3quran.net',
  'archive.org',
  'soundcloud.cloud',
  'sndcdn.com',
  'soundcloud.com',
  'quranicaudio.com',
  'everyayah.com',
];

const ALLOWED_RADIO_HOST_SUFFIXES = [
  'qurango.net',
  'mp3quran.net',
  'radiojar.com',
  'zeno.fm',
  'zenomedia.com',
  'shoutca.st',
  'radioca.st',
  'revma.com',
  'itworkscdn.net',
  'shoutcast.com',
];

/**
 * Validates that an upstream audio URL uses HTTPS/HTTP on an approved public media CDN.
 * Protects server proxy routes against SSRF.
 */
export function isAllowedAudioProxyUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_AUDIO_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

/**
 * Validates live radio stream URLs against approved broadcast hosts (SSRF protection).
 */
export function isAllowedRadioStreamUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_RADIO_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function buildRadioStreamProxyUrl(streamUrl: string): string {
  return `/api/radio/stream?url=${encodeURIComponent(streamUrl)}`;
}

export function radioStationToMediaTrack(station: LiveRadioStation): MediaTrack {
  const isQuran = station.category === 'quran_radio';
  const playableUrl = station.directCors
    ? station.streamUrl
    : buildRadioStreamProxyUrl(station.streamUrl);

  return {
    id: `radio-${station.id}`,
    title: station.name,
    artist: station.subtitle,
    album: 'بث إذاعي مباشر 24/7',
    category: isQuran ? 'quran' : 'music',
    durationSec: 0,
    audioUrl: playableUrl,
    audioFormat: 'mp3',
    sourceKind: 'official-stream',
    sourceLabel: 'بث مباشر 24/7',
    coverType: isQuran ? 'quran' : 'podcast',
    isLiveStream: true,
  };
}

/**
 * Parses standard LRC synchronized lyrics (`[mm:ss.xx] text`) into sorted timestamped lines.
 */
export function parseLrcSyncedLyrics(lrcText: string): SyncedLyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const parsed: SyncedLyricLine[] = [];

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (matches.length === 0) continue;

    const cleanLyric = rawLine
      .replace(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g, '')
      .trim();
    if (!cleanLyric) continue;

    for (const m of matches) {
      const mins = Number(m[1]);
      const secs = Number(m[2]);
      const fracRaw = m[3] || '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      const timeSec = mins * 60 + secs + frac;
      if (Number.isFinite(timeSec) && timeSec >= 0) {
        parsed.push({ timeSec, text: cleanLyric });
      }
    }
  }

  parsed.sort((a, b) => a.timeSec - b.timeSec);
  return parsed;
}

/**
 * Binary/linear search for the currently active synced lyric line at `currentTimeSec`.
 */
export function findActiveSyncedIndex(
  lines: ReadonlyArray<{ timeSec: number }>,
  currentTimeSec: number
): number {
  if (lines.length === 0 || currentTimeSec < 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTimeSec + 0.25 >= lines[i].timeSec) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

/**
 * Finds the currently recited Quran Ayah index based on playback progress ratio (0..1).
 */
export function findActiveAyahIndex(
  ayahs: ReadonlyArray<QuranAyahItem>,
  currentTimeSec: number,
  durationSec: number
): number {
  if (ayahs.length === 0 || durationSec <= 0 || currentTimeSec <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, currentTimeSec / durationSec));
  for (let i = 0; i < ayahs.length; i++) {
    if (ratio >= ayahs[i].startRatio && ratio <= ayahs[i].endRatio) {
      return i;
    }
  }
  return Math.min(ayahs.length - 1, Math.floor(ratio * ayahs.length));
}

/**
 * Checks whether a track uses our dynamic full-length song stream resolver
 * (`sc://<trackId>` or `scq://<query>?dur=<sec>`).
 */
export function isFullResolverRef(audioUrl: string): boolean {
  if (!audioUrl) return false;
  return audioUrl.startsWith('sc://') || audioUrl.startsWith('scq://');
}

/**
 * Checks whether an HTTPS audio URL supports direct CORS (`Access-Control-Allow-Origin: *`)
 * and native byte-range streaming from its official CDN so huge files (e.g. 200 MB Surahs)
 * stream directly without hitting Cloud Run's 32 MB single-response proxy limit.
 */
export function isDirectCorsAudioUrl(audioUrl: string): boolean {
  if (!audioUrl || isFullResolverRef(audioUrl)) return false;
  if (audioUrl.startsWith('/api/')) return true;
  try {
    const parsed = new URL(audioUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'mp3quran.net' ||
      host.endsWith('.mp3quran.net') ||
      host === 'qurango.net' ||
      host.endsWith('.qurango.net') ||
      host === 'quranicaudio.com' ||
      host.endsWith('.quranicaudio.com')
    );
  } catch {
    return false;
  }
}

/**
 * Extracts the 1..114 Surah number from a Quran MediaTrack if applicable.
 */
export function extractSurahNumberFromTrack(track: MediaTrack): number | null {
  if (track.category !== 'quran' || track.isLiveStream) return null;
  const idMatch = track.id.match(/-(\d{3})$/);
  if (idMatch) {
    const num = Number(idMatch[1]);
    if (num >= 1 && num <= 114) return num;
  }
  const urlMatch = track.audioUrl.match(/\/(\d{3})\.mp3(?:\?|$)/i);
  if (urlMatch) {
    const num = Number(urlMatch[1]);
    if (num >= 1 && num <= 114) return num;
  }
  const titleMatch = track.title.match(/^0*(\d{1,3})\./);
  if (titleMatch) {
    const num = Number(titleMatch[1]);
    if (num >= 1 && num <= 114) return num;
  }
  return null;
}

/**
 * Provides 3 independent verified Hafs Quran CDN URLs for a given Surah (1..114)
 * as automatic fallbacks if an upstream reciter server is ever temporarily unreachable.
 */
export function buildBackupQuranUrls(surahNumber: number, primaryUrl: string): string[] {
  if (!Number.isFinite(surahNumber) || surahNumber < 1 || surahNumber > 114) return [];
  const padded = String(Math.floor(surahNumber)).padStart(3, '0');
  const candidates = [
    `https://cdn.mp3quran.net/audio/mishary-alafasy/r1/${padded}.mp3`,
    `https://cdn.mp3quran.net/audio/maher-muaiqly/r1/${padded}.mp3`,
    `https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/${padded}.mp3`,
  ];
  return candidates.filter((u) => u !== primaryUrl);
}

/**
 * Normalizes Arabic and Latin text for forgiving, fast search matching.
 */
export function normalizeArabicText(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/عبد\s+ال/g, 'عبدال')
    .replace(/\s+/g, ' ');
}

/**
 * Cleans decorative tatweel/kashida and ripper/site watermarks from external track metadata.
 */
export function cleanSongMetadataText(raw: string): string {
  if (!raw) return '';
  if (/[À-ÿ]{3,}/.test(raw) && !/[\u0600-\u06FF]/.test(raw)) {
    return '';
  }
  return raw
    .replace(/\u0640+/g, '')
    .replace(
      /\b(y\s*2\s*meta\.app|y2mate\.com|savefrom\.net|yt1s\.com|mazika2day\.com|sm3na\.com|dndnha\.com|matb3aa\.com|melody4arab\.com)\b/gi,
      ''
    )
    .replace(/(موقع\s+دندنها|دندنها|موقع\s+البوماتي|موقع\s+مطبعه|موقع\s+سمعنا)/g, '')
    .replace(/\(\s*\d+\s*kbps\s*\)/gi, '')
    .replace(
      /\b(official\s+music\s+video|hd\s+version|official\s+audio|official\s+lyric\s+video)\b/gi,
      ''
    )
    .replace(/[|_]+/g, ' - ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '')
    .trim();
}

/**
 * Automatically upgrades any legacy 30-second preview tracks previously stored in localStorage
 * into full-duration resolver tracks so no saved song is stuck at 30 seconds.
 */
export function upgradeLegacyPreviewTrack(track: MediaTrack): MediaTrack {
  if (track.isLiveStream) return track;
  const url = track.audioUrl || '';
  const isLegacyPreview =
    url.includes('dzcdn.net') ||
    url.includes('itunes.apple.com') ||
    url.includes('mzstatic.com') ||
    (track.category !== 'quran' &&
      track.sourceKind === 'official-stream' &&
      track.durationSec <= 31);

  if (!isLegacyPreview) return track;

  const query = `${track.artist} ${track.title}`.trim();
  return {
    ...track,
    durationSec: track.durationSec <= 31 ? 0 : track.durationSec,
    sizeMB: track.sizeMB && track.sizeMB <= 0.8 ? undefined : track.sizeMB,
    audioUrl: `scq://${encodeURIComponent(query)}`,
    audioFormat: 'mp3',
    sourceKind: 'full-mp3',
    sourceLabel: 'أغنية كاملة الأصل',
  };
}

export function deduplicateTracks(tracks: MediaTrack[]): MediaTrack[] {
  const seen = new Map<string, MediaTrack>();

  for (const track of tracks) {
    if (!track.audioUrl) continue;
    const key = `${normalizeArabicText(track.title)}::${normalizeArabicText(track.artist)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, track);
      continue;
    }

    const existingIsLazy = existing.audioUrl.startsWith('scq://');
    const incomingIsDirect = !track.audioUrl.startsWith('scq://');

    if (existingIsLazy && incomingIsDirect) {
      seen.set(key, {
        ...track,
        externalCoverUrl: existing.externalCoverUrl || track.externalCoverUrl,
        album:
          existing.album && existing.album !== 'ألبوم غنائي' ? existing.album : track.album,
      });
    } else if (!existing.externalCoverUrl && track.externalCoverUrl) {
      seen.set(key, {
        ...existing,
        externalCoverUrl: track.externalCoverUrl,
      });
    }
  }

  return Array.from(seen.values());
}

export function filterAndSortTracks(
  tracks: MediaTrack[],
  options: { category: MediaCategory; sortBy: SortOption; localFilter?: string }
): MediaTrack[] {
  const normFilter = normalizeArabicText(options.localFilter || '');
  const tokens = normFilter ? normFilter.split(' ').filter(Boolean) : [];

  const filtered = tracks.filter((track) => {
    if (options.category !== 'all' && track.category !== options.category) {
      return false;
    }
    if (tokens.length === 0) return true;
    const haystack = normalizeArabicText(`${track.title} ${track.artist} ${track.album}`);
    return tokens.every((tok) => haystack.includes(tok));
  });

  const sorted = [...filtered];
  switch (options.sortBy) {
    case 'full_first':
      sorted.sort((a, b) => {
        if (a.sourceKind !== b.sourceKind) {
          return a.sourceKind === 'full-mp3' ? -1 : 1;
        }
        return (b.durationSec || 0) - (a.durationSec || 0);
      });
      break;
    case 'shortest':
      sorted.sort((a, b) => (a.durationSec || 999999) - (b.durationSec || 999999));
      break;
    case 'longest':
      sorted.sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
      break;
    case 'relevance':
    default:
      break;
  }

  return sorted;
}

/**
 * Sanitizes a Quran reciter server base URL (ensures HTTPS and single trailing slash).
 */
export function sanitizeQuranServerBaseUrl(rawServer: string): string {
  const trimmed = (rawServer || '').trim().replace(/^http:\/\//i, 'https://');
  if (!trimmed) return '';
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  return `${withoutTrailing}/`;
}

/**
 * Builds playable & downloadable full-Surah tracks for a selected MP3Quran reciter & moshaf.
 */
export function buildSurahTracksForReciter(
  reciter: QuranReciter,
  moshaf: QuranMoshaf,
  suwar: QuranSurahMeta[]
): MediaTrack[] {
  const surahMap = new Map<number, QuranSurahMeta>();
  for (const s of suwar) {
    surahMap.set(s.id, s);
  }

  const baseServer = sanitizeQuranServerBaseUrl(moshaf.server);

  return moshaf.surahList.map((surahNum) => {
    const padded = String(surahNum).padStart(3, '0');
    const meta = surahMap.get(surahNum);
    const surahName = meta ? meta.name.trim() : `سورة رقم ${surahNum}`;
    const titleHasSurahWord = normalizeArabicText(surahName).startsWith('سوره ');
    const fullTitle = titleHasSurahWord ? surahName : `سورة ${surahName}`;
    const revelationPlace = meta ? (meta.makkia === 1 ? 'مكية' : 'مدنية') : '';

    return {
      id: `quran-${reciter.id}-${moshaf.id}-${padded}`,
      title: `${padded}. ${fullTitle}`,
      artist: reciter.name,
      album: revelationPlace ? `${moshaf.name} · ${revelationPlace}` : moshaf.name,
      category: 'quran',
      durationSec: 0,
      audioUrl: `${baseServer}${padded}.mp3`,
      audioFormat: 'mp3',
      sourceKind: 'full-mp3',
      sourceLabel: 'تلاوة كاملة MP3',
      coverType: 'quran',
    };
  });
}

// ============================================================================
// Playlist & Queue Pure Operations
// ============================================================================

export function createPlaylistObject(name: string, description = ''): UserPlaylist {
  const nowIso = new Date().toISOString();
  return {
    id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'قائمة تشغيل جديدة',
    description: description.trim() || undefined,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    tracks: [],
  };
}

export function toggleTrackInPlaylist(
  playlist: UserPlaylist,
  track: MediaTrack
): { updated: UserPlaylist; added: boolean } {
  const exists = playlist.tracks.some((t) => t.id === track.id);
  const nowIso = new Date().toISOString();
  if (exists) {
    return {
      added: false,
      updated: {
        ...playlist,
        updatedAtIso: nowIso,
        tracks: playlist.tracks.filter((t) => t.id !== track.id),
      },
    };
  }
  return {
    added: true,
    updated: {
      ...playlist,
      updatedAtIso: nowIso,
      tracks: [...playlist.tracks, upgradeLegacyPreviewTrack(track)],
    },
  };
}

export function reorderPlaylistTrack(
  playlist: UserPlaylist,
  fromIndex: number,
  toIndex: number
): UserPlaylist {
  const len = playlist.tracks.length;
  if (
    fromIndex < 0 ||
    fromIndex >= len ||
    toIndex < 0 ||
    toIndex >= len ||
    fromIndex === toIndex
  ) {
    return playlist;
  }
  const nextTracks = [...playlist.tracks];
  const [moved] = nextTracks.splice(fromIndex, 1);
  nextTracks.splice(toIndex, 0, moved);
  return {
    ...playlist,
    updatedAtIso: new Date().toISOString(),
    tracks: nextTracks,
  };
}

export function computePlaylistTotalDuration(playlist: UserPlaylist): number {
  return playlist.tracks.reduce((acc, t) => acc + (t.durationSec > 0 ? t.durationSec : 0), 0);
}

export function sanitizeImportedPlaylists(raw: unknown): UserPlaylist[] {
  if (!Array.isArray(raw)) return [];
  const valid: UserPlaylist[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<UserPlaylist>;
    if (typeof obj.name !== 'string' || !obj.name.trim()) continue;
    const rawTracks = Array.isArray(obj.tracks) ? obj.tracks : [];
    const cleanTracks = rawTracks
      .filter((t): t is MediaTrack => Boolean(t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.audioUrl === 'string'))
      .map((t) => upgradeLegacyPreviewTrack(t));

    const nowIso = new Date().toISOString();
    valid.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: obj.name.trim(),
      description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
      createdAtIso: typeof obj.createdAtIso === 'string' ? obj.createdAtIso : nowIso,
      updatedAtIso: nowIso,
      tracks: cleanTracks,
    });
  }
  return valid;
}

/**
 * Computes the next track index in a queue when a track finishes (`onEnded`)
 * or when the user presses Next, honoring RepeatMode ('off' | 'all' | 'one') and Shuffle.
 */
export function getNextQueueIndex(params: {
  queueLength: number;
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  isAutoEnded: boolean;
  randomFn?: () => number;
}): number | null {
  const {
    queueLength,
    currentIndex,
    repeatMode,
    shuffle,
    isAutoEnded,
    randomFn = Math.random,
  } = params;

  if (queueLength <= 0) return null;

  if (isAutoEnded && repeatMode === 'one') {
    return currentIndex >= 0 && currentIndex < queueLength ? currentIndex : 0;
  }

  if (shuffle && queueLength > 1) {
    const candidates: number[] = [];
    for (let i = 0; i < queueLength; i++) {
      if (i !== currentIndex) candidates.push(i);
    }
    const pick = Math.floor(randomFn() * candidates.length);
    return candidates[Math.min(pick, candidates.length - 1)];
  }

  const nextSequential = currentIndex + 1;
  if (nextSequential < queueLength) {
    return nextSequential;
  }

  if (!isAutoEnded || repeatMode === 'all') {
    return 0;
  }

  return null;
}

export function cycleRepeatMode(current: RepeatMode): RepeatMode {
  if (current === 'all') return 'one';
  if (current === 'one') return 'off';
  return 'all';
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  if (safeSeconds === 0) return '--:--';
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatFileSizeMB(mb?: number): string {
  if (!mb || !Number.isFinite(mb) || mb <= 0) return '';
  return `${mb.toFixed(1)} MB`;
}

export function clampTrimRange(
  startSec: number,
  endSec: number,
  maxDurationSec: number
): { startSec: number; endSec: number; clipDurationSec: number } {
  const maxDur = Math.max(4, Math.floor(maxDurationSec));
  const clampedStart = Math.max(0, Math.min(Math.floor(startSec), maxDur - 2));
  const clampedEnd = Math.max(clampedStart + 2, Math.min(Math.floor(endSec), maxDur));
  return {
    startSec: clampedStart,
    endSec: clampedEnd,
    clipDurationSec: clampedEnd - clampedStart,
  };
}

export function buildProxyStreamUrl(audioUrl: string, maxBytes?: number): string {
  const base = `/api/stream?url=${encodeURIComponent(audioUrl)}`;
  if (maxBytes && Number.isFinite(maxBytes) && maxBytes > 0) {
    return `${base}&maxBytes=${Math.floor(maxBytes)}`;
  }
  return base;
}

export function buildProxyDownloadUrl(
  audioUrl: string,
  title: string,
  artist: string,
  ext: 'mp3' | 'm4a'
): string {
  const cleanName = `${title} - ${artist}`
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const filename = `${cleanName || 'sma3ny-audio'}.${ext}`;

  if (isFullResolverRef(audioUrl)) {
    const hint = encodeURIComponent(`${artist} ${title}`.trim());
    return `/api/sc/download?ref=${encodeURIComponent(audioUrl)}&hint=${hint}&format=${ext}&filename=${encodeURIComponent(filename)}`;
  }

  return `/api/download?url=${encodeURIComponent(audioUrl)}&filename=${encodeURIComponent(filename)}`;
}

/**
 * Encodes real decoded Float32Array PCM samples (sliced from an actual decoded audio track)
 * into a standard 16-bit RIFF WAVE file so users can export real trimmed ringtones.
 */
export function encodeRealPcmSliceToWav(
  samples: Float32Array,
  sampleRate: number
): Uint8Array {
  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}
