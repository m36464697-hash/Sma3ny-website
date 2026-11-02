import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabicText,
  cleanSongMetadataText,
  isAllowedAudioProxyUrl,
  isDirectCorsAudioUrl,
  isFullResolverRef,
  extractSurahNumberFromTrack,
  buildBackupQuranUrls,
  upgradeLegacyPreviewTrack,
  deduplicateTracks,
  filterAndSortTracks,
  buildSurahTracksForReciter,
  buildProxyDownloadUrl,
  createPlaylistObject,
  toggleTrackInPlaylist,
  reorderPlaylistTrack,
  computePlaylistTotalDuration,
  sanitizeImportedPlaylists,
  getNextQueueIndex,
  cycleRepeatMode,
  formatDuration,
  clampTrimRange,
  encodeRealPcmSliceToWav,
  EQ_PRESETS,
  clampEqGains,
  parseLrcSyncedLyrics,
  findActiveSyncedIndex,
  findActiveAyahIndex,
  isAllowedRadioStreamUrl,
  radioStationToMediaTrack,
  type MediaTrack,
  type QuranReciter,
} from './mediaLogic';

test('normalizeArabicText unifies Arabic letter forms, strips diacritics/kashida, and unifies Abd-Al', () => {
  assert.equal(normalizeArabicText('سُورَةُ الْبَقَرَةِ'), 'سوره البقره');
  assert.equal(normalizeArabicText('أم كلثوم - أنت عمرى'), 'ام كلثوم - انت عمري');
  assert.equal(normalizeArabicText('عبد الباسط عبد الصمد'), normalizeArabicText('عبدالباسط عبدالصمد'));
});

test('cleanSongMetadataText strips kashidas and site watermarks cleanly', () => {
  assert.equal(cleanSongMetadataText('عـمرو ديـاب - تملي معاك (128 kbps) MaZiKa2daY.CoM'), 'عمرو دياب - تملي معاك');
});

test('isAllowedAudioProxyUrl permits verified audio CDNs and blocks SSRF/private hosts', () => {
  assert.equal(isAllowedAudioProxyUrl('https://cdn.mp3quran.net/audio/mishary-alafasy/r1/002.mp3'), true);
  assert.equal(isAllowedAudioProxyUrl('https://archive.org/download/item123/song.mp3'), true);
  assert.equal(isAllowedAudioProxyUrl('https://playback.media-streaming.soundcloud.cloud/abc/init.mp4'), true);
  assert.equal(isAllowedAudioProxyUrl('http://localhost:3000/secret'), false);
  assert.equal(isAllowedAudioProxyUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedAudioProxyUrl('javascript:alert(1)'), false);
});

test('isDirectCorsAudioUrl and Quran 3-mirror backup helpers identify Surah tracks accurately', () => {
  assert.equal(isDirectCorsAudioUrl('https://cdn.mp3quran.net/audio/mishary-alafasy/r1/002.mp3'), true);
  assert.equal(isDirectCorsAudioUrl('sc://1281095008'), false);

  const surahTrack: MediaTrack = {
    id: 'quran-1-1-002',
    title: '002. سورة البقرة',
    artist: 'مشاري العفاسي',
    album: 'حفص عن عاصم',
    category: 'quran',
    durationSec: 0,
    audioUrl: 'https://server15.mp3quran.net/custom/002.mp3',
    audioFormat: 'mp3',
    sourceKind: 'full-mp3',
    sourceLabel: 'تلاوة كاملة MP3',
    coverType: 'quran',
  };

  assert.equal(extractSurahNumberFromTrack(surahTrack), 2);
  const backups = buildBackupQuranUrls(2, surahTrack.audioUrl);
  assert.equal(backups.length, 3);
  assert.ok(backups.every((u) => u.endsWith('/002.mp3')));
});

test('Playlist creation, track toggle, reordering, duration sum, and JSON import sanitization work properly', () => {
  const pl = createPlaylistObject('أغاني الطرب', 'مختارات مسائية');
  assert.equal(pl.name, 'أغاني الطرب');
  assert.equal(pl.tracks.length, 0);

  const t1: MediaTrack = {
    id: 'sc-1',
    title: 'تملي معاك',
    artist: 'عمرو دياب',
    album: 'تملي معاك',
    category: 'music',
    durationSec: 272,
    audioUrl: 'sc://1',
    audioFormat: 'mp3',
    sourceKind: 'full-mp3',
    sourceLabel: 'أغنية كاملة الأصل',
    coverType: 'music',
  };
  const t2: MediaTrack = {
    id: 'sc-2',
    title: 'قمرين',
    artist: 'عمرو دياب',
    album: 'قمرين',
    category: 'music',
    durationSec: 240,
    audioUrl: 'sc://2',
    audioFormat: 'mp3',
    sourceKind: 'full-mp3',
    sourceLabel: 'أغنية كاملة الأصل',
    coverType: 'music',
  };

  const step1 = toggleTrackInPlaylist(pl, t1);
  assert.equal(step1.added, true);
  const step2 = toggleTrackInPlaylist(step1.updated, t2);
  assert.equal(step2.updated.tracks.length, 2);
  assert.equal(computePlaylistTotalDuration(step2.updated), 512);

  const reordered = reorderPlaylistTrack(step2.updated, 0, 1);
  assert.equal(reordered.tracks[0].id, 'sc-2');
  assert.equal(reordered.tracks[1].id, 'sc-1');

  const removed = toggleTrackInPlaylist(reordered, t2);
  assert.equal(removed.added, false);
  assert.equal(removed.updated.tracks.length, 1);

  const imported = sanitizeImportedPlaylists([removed.updated, { invalid: true }]);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].tracks.length, 1);
});

test('getNextQueueIndex and cycleRepeatMode handle repeat-one, repeat-all, repeat-off, and shuffle', () => {
  assert.equal(cycleRepeatMode('all'), 'one');
  assert.equal(cycleRepeatMode('one'), 'off');
  assert.equal(cycleRepeatMode('off'), 'all');

  // Repeat one on natural end stays on same index
  assert.equal(
    getNextQueueIndex({
      queueLength: 5,
      currentIndex: 2,
      repeatMode: 'one',
      shuffle: false,
      isAutoEnded: true,
    }),
    2
  );

  // Repeat off at end of queue stops (null) on auto-end, but wraps on manual Next click
  assert.equal(
    getNextQueueIndex({
      queueLength: 3,
      currentIndex: 2,
      repeatMode: 'off',
      shuffle: false,
      isAutoEnded: true,
    }),
    null
  );
  assert.equal(
    getNextQueueIndex({
      queueLength: 3,
      currentIndex: 2,
      repeatMode: 'off',
      shuffle: false,
      isAutoEnded: false,
    }),
    0
  );

  // Repeat all at end of queue wraps around to 0
  assert.equal(
    getNextQueueIndex({
      queueLength: 3,
      currentIndex: 2,
      repeatMode: 'all',
      shuffle: false,
      isAutoEnded: true,
    }),
    0
  );

  // Shuffle picks a different track when queueLength > 1
  const shuffledIdx = getNextQueueIndex({
    queueLength: 4,
    currentIndex: 1,
    repeatMode: 'all',
    shuffle: true,
    isAutoEnded: true,
    randomFn: () => 0.5,
  });
  assert.notEqual(shuffledIdx, 1);
});

test('upgradeLegacyPreviewTrack, deduplicateTracks, buildSurahTracksForReciter, and buildProxyDownloadUrl work accurately', () => {
  const legacy: MediaTrack = {
    id: 'dz-100',
    title: 'تملي معاك',
    artist: 'عمرو دياب',
    album: 'تملي معاك',
    category: 'music',
    durationSec: 30,
    sizeMB: 0.5,
    audioUrl: 'https://cdns-preview-1.dzcdn.net/stream/c-123.mp3',
    audioFormat: 'mp3',
    sourceKind: 'official-stream',
    sourceLabel: 'مقطع رسمي',
    coverType: 'music',
  };
  const upgraded = upgradeLegacyPreviewTrack(legacy);
  assert.ok(isFullResolverRef(upgraded.audioUrl));
  assert.equal(upgraded.sourceKind, 'full-mp3');

  const reciter: QuranReciter = {
    id: 123,
    name: 'مشاري راشد العفاسي',
    moshafs: [
      {
        id: 1,
        name: 'حفص عن عاصم',
        server: 'http://server8.mp3quran.net/afs///',
        surahTotal: 2,
        surahList: [1, 114],
      },
    ],
  };
  const built = buildSurahTracksForReciter(reciter, reciter.moshafs[0], [
    { id: 1, name: 'الفاتحة', makkia: 1 },
    { id: 114, name: 'الناس', makkia: 1 },
  ]);
  assert.equal(built[0].audioUrl, 'https://server8.mp3quran.net/afs/001.mp3');

  const scHref = buildProxyDownloadUrl('sc://1281095008', 'تملي معاك', 'عمرو دياب', 'mp3');
  assert.ok(scHref.startsWith('/api/sc/download?'));
  assert.ok(scHref.includes('hint='));

  const deduped = deduplicateTracks([upgraded]);
  assert.equal(deduped.length, 1);
  assert.equal(filterAndSortTracks(deduped, { category: 'all', sortBy: 'relevance' }).length, 1);
  assert.equal(formatDuration(3665), '01:01:05');
  assert.equal(clampTrimRange(10, 35, 240).clipDurationSec, 25);
  assert.equal(encodeRealPcmSliceToWav(new Float32Array([0, 0.5, -0.5]), 44100).length, 50);
});

test('Equalizer presets, LRC synced lyrics parser, Quran Ayah finder, and Live Radio helpers work accurately', () => {
  assert.deepEqual(EQ_PRESETS.bass_boost.gains, [8, 6, 0, 1, 2]);
  assert.deepEqual(clampEqGains([20, -18, 3.4, 0, 5]), [12, -12, 3, 0, 5]);
  assert.deepEqual(clampEqGains('invalid'), [0, 0, 0, 0, 0]);

  const sampleLrc = `[00:12.50]تملي معاك\n[00:18.00]ولو حتى بعيد عني\n[00:24.25]في قلبي هواك`;
  const parsedLrc = parseLrcSyncedLyrics(sampleLrc);
  assert.equal(parsedLrc.length, 3);
  assert.equal(parsedLrc[0].timeSec, 12.5);
  assert.equal(parsedLrc[1].text, 'ولو حتى بعيد عني');
  assert.equal(findActiveSyncedIndex(parsedLrc, 5), -1);
  assert.equal(findActiveSyncedIndex(parsedLrc, 19), 1);

  const ayahs = [
    { numberInSurah: 1, text: 'بسم الله', startRatio: 0, endRatio: 0.4 },
    { numberInSurah: 2, text: 'الحمد لله', startRatio: 0.4, endRatio: 1 },
  ];
  assert.equal(findActiveAyahIndex(ayahs, 25, 100), 0);
  assert.equal(findActiveAyahIndex(ayahs, 75, 100), 1);

  assert.equal(isAllowedRadioStreamUrl('https://stream.radiojar.com/8s5u5tpdtwzuv'), true);
  assert.equal(isAllowedRadioStreamUrl('https://stream.zeno.fm/zsgrfxg71s8uv'), true);
  assert.equal(isAllowedRadioStreamUrl('http://127.0.0.1:8080/stream'), false);

  const radioTrack = radioStationToMediaTrack({
    id: 'cairo-quran',
    name: 'إذاعة القرآن الكريم من القاهرة',
    subtitle: 'بث حي مباشر',
    category: 'quran_radio',
    streamUrl: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
    directCors: false,
  });
  assert.equal(radioTrack.isLiveStream, true);
  assert.ok(radioTrack.audioUrl.startsWith('/api/radio/stream?url='));
});
