import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Download,
  RotateCcw,
  Loader2,
  Repeat,
  Repeat1,
  Shuffle,
  ListPlus,
  SlidersHorizontal,
  Timer,
  FileText,
  BookOpen,
  X,
} from 'lucide-react';
import {
  EQ_BAND_FREQUENCIES,
  EQ_BAND_LABELS,
  EQ_PRESETS,
  buildBackupQuranUrls,
  buildProxyStreamUrl,
  clampEqGains,
  extractSurahNumberFromTrack,
  formatDuration,
  isDirectCorsAudioUrl,
  isFullResolverRef,
  type EqPresetId,
  type MediaTrack,
  type RepeatMode,
} from '../utils/mediaLogic';
import { MediaArtwork } from './MediaArtwork';
import { LyricsQuranDrawer } from './LyricsQuranDrawer';

const EQ_STORAGE_KEY = 'sma3ny_eq_state_v1';

interface AudioVideoPlayerProps {
  track: MediaTrack | null;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  sleepRemainingSec: number | null;
  sleepEndOfTrack: boolean;
  onPlayStateChange: (playing: boolean) => void;
  onCycleRepeatMode: () => void;
  onToggleShuffle: () => void;
  onSelectSleepTimer: (choice: number | 'track_end' | null) => void;
  onDurationResolved?: (trackId: string, durationSec: number) => void;
  onTrackNaturalEnd: () => void;
  onNext: () => void;
  onPrev: () => void;
  onAddToPlaylist: (track: MediaTrack) => void;
  onClosePlayer: () => void;
  onOpenDownload: (track: MediaTrack) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

interface ResolvedScPayload {
  trackId: number;
  durationSec: number;
  mode: 'hls' | 'direct';
  url: string;
  proxyPlaylistUrl: string;
}

interface WebAudioEqGraph {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
  preamp: GainNode;
}

export function AudioVideoPlayer({
  track,
  isPlaying,
  repeatMode,
  shuffle,
  sleepRemainingSec,
  sleepEndOfTrack,
  onPlayStateChange,
  onCycleRepeatMode,
  onToggleShuffle,
  onSelectSleepTimer,
  onDurationResolved,
  onTrackNaturalEnd,
  onNext,
  onPrev,
  onAddToPlaylist,
  onClosePlayer,
  onOpenDownload,
}: AudioVideoPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const eqGraphRef = useRef<WebAudioEqGraph | null>(null);
  const loadGenRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);
  const sleepEndOfTrackRef = useRef(sleepEndOfTrack);
  const candidateUrlsRef = useRef<string[]>([]);
  const candidateIdxRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Studio Tools Popover ('eq' | 'controls') + Lyrics/Quran Drawer
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<'eq' | 'controls'>('eq');
  const [lyricsDrawerOpen, setLyricsDrawerOpen] = useState(false);

  // A-B Section Loop
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  // 5-Band Equalizer State (persisted in localStorage)
  const [eqState, setEqState] = useState<{
    preset: EqPresetId;
    gains: [number, number, number, number, number];
  }>(() => {
    try {
      const raw = localStorage.getItem(EQ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          preset?: EqPresetId;
          gains?: unknown;
        };
        const gains = clampEqGains(parsed.gains);
        const preset = parsed.preset || 'flat';
        return { preset, gains };
      }
    } catch {
      // ignore
    }
    return { preset: 'flat', gains: [0, 0, 0, 0, 0] };
  });

  useEffect(() => {
    try {
      localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(eqState));
    } catch {
      // ignore
    }
  }, [eqState]);

  const playbackRate = SPEEDS[speedIndex];
  isPlayingRef.current = isPlaying;
  repeatModeRef.current = repeatMode;
  sleepEndOfTrackRef.current = sleepEndOfTrack;

  // Ensure Web Audio 5-Band Equalizer Graph is connected & resumed on user playback
  const ensureEqGraphConnected = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!eqGraphRef.current) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const preamp = ctx.createGain();

        const filters = EQ_BAND_FREQUENCIES.map((freq, idx) => {
          const filter = ctx.createBiquadFilter();
          if (idx === 0) {
            filter.type = 'lowshelf';
          } else if (idx === EQ_BAND_FREQUENCIES.length - 1) {
            filter.type = 'highshelf';
          } else {
            filter.type = 'peaking';
            filter.Q.value = 1.1;
          }
          filter.frequency.value = freq;
          filter.gain.value = eqState.gains[idx] || 0;
          return filter;
        });

        // Connect chain: source -> filters[0..4] -> preamp -> destination
        source.connect(filters[0]);
        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(preamp);
        preamp.connect(ctx.destination);

        const maxPositiveBoost = Math.max(0, ...eqState.gains);
        preamp.gain.value = maxPositiveBoost > 4 ? Math.pow(10, -(maxPositiveBoost - 4) / 40) : 1;

        eqGraphRef.current = { ctx, filters, preamp };
      } catch {
        // Ignore if browser restricts Web Audio creation
      }
    }

    if (eqGraphRef.current && eqGraphRef.current.ctx.state === 'suspended') {
      void eqGraphRef.current.ctx.resume().catch(() => {});
    }
  }, [eqState.gains]);

  // Sync EQ gains to live BiquadFilterNodes whenever sliders or presets change
  useEffect(() => {
    const graph = eqGraphRef.current;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.filters.forEach((f, idx) => {
      f.gain.setTargetAtTime(eqState.gains[idx] || 0, now, 0.02);
    });
    const maxBoost = Math.max(0, ...eqState.gains);
    const safePreamp = maxBoost > 4 ? Math.pow(10, -(maxBoost - 4) / 40) : 1;
    graph.preamp.gain.setTargetAtTime(safePreamp, now, 0.02);
  }, [eqState.gains]);

  const destroyHlsInstance = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const safeAttemptPlay = useCallback(
    async (gen: number) => {
      const audio = audioRef.current;
      if (!audio || gen !== loadGenRef.current || !isPlayingRef.current) return;
      ensureEqGraphConnected();
      try {
        await audio.play();
      } catch (err) {
        if (gen !== loadGenRef.current) return;
        const errName = (err as { name?: string })?.name || '';
        if (errName === 'AbortError') return;
        if (errName === 'NotAllowedError') {
          onPlayStateChange(false);
        }
      }
    },
    [onPlayStateChange, ensureEqGraphConnected]
  );

  const seekToSecond = useCallback(
    (targetSec: number) => {
      const audio = audioRef.current;
      if (!audio || track?.isLiveStream) return;
      const maxDur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : duration || track?.durationSec || 0;
      const clamped = Math.max(0, maxDur > 0 ? Math.min(maxDur, targetSec) : targetSec);
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration, track?.durationSec, track?.isLiveStream]
  );

  const seekByOffset = useCallback(
    (deltaSec: number) => {
      const audio = audioRef.current;
      if (!audio || track?.isLiveStream) return;
      seekToSecond(audio.currentTime + deltaSec);
    },
    [seekToSecond, track?.isLiveStream]
  );

  // Reset A-B loop when switching tracks
  useEffect(() => {
    setLoopA(null);
    setLoopB(null);
  }, [track?.id]);

  // Primary track-loading lifecycle (self-healing full HLS VOD songs + Quran Surahs + 24/7 Live Radio)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    const gen = ++loadGenRef.current;
    destroyHlsInstance();

    setCurrentTime(0);
    setDuration(track.durationSec || 0);
    setStreamError(false);
    setIsBuffering(true);
    candidateUrlsRef.current = [];
    candidateIdxRef.current = 0;

    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    audio.playbackRate = track.isLiveStream ? 1 : playbackRate;
    audio.volume = volume;
    audio.muted = muted;

    if (track.isLiveStream) {
      candidateUrlsRef.current = [track.audioUrl];
      candidateIdxRef.current = 0;
      audio.src = track.audioUrl;
      audio.load();
      if (isPlayingRef.current) {
        void safeAttemptPlay(gen);
      }
      return () => {
        destroyHlsInstance();
      };
    }

    const hintParam = encodeURIComponent(`${track.artist} ${track.title}`.trim());

    if (isFullResolverRef(track.audioUrl)) {
      void (async () => {
        try {
          const fetchResolved = async (): Promise<ResolvedScPayload | null> => {
            const res = await fetch(
              `/api/sc/resolve?ref=${encodeURIComponent(track.audioUrl)}&hint=${hintParam}`
            );
            if (!res.ok) return null;
            return (await res.json()) as ResolvedScPayload;
          };

          const payload = await fetchResolved();
          if (gen !== loadGenRef.current) return;
          if (!payload) {
            setIsBuffering(false);
            setStreamError(true);
            onPlayStateChange(false);
            return;
          }

          if (payload.durationSec > 0) {
            setDuration(payload.durationSec);
            onDurationResolved?.(track.id, payload.durationSec);
          }

          const streamM4aFallback = `/api/sc/download?ref=${encodeURIComponent(track.audioUrl)}&hint=${hintParam}&format=m4a`;

          if (payload.mode === 'direct') {
            // Route non-CORS archive URLs through same-origin /api/stream so crossOrigin="anonymous" + Web Audio EQ never taints
            const candidates = isDirectCorsAudioUrl(payload.url)
              ? [payload.url, buildProxyStreamUrl(payload.url)]
              : [buildProxyStreamUrl(payload.url)];
            candidateUrlsRef.current = candidates;
            candidateIdxRef.current = 0;
            audio.src = candidates[0];
            audio.load();
            setIsBuffering(false);
            if (isPlayingRef.current) {
              void safeAttemptPlay(gen);
            }
            return;
          }

          if (Hls.isSupported()) {
            let triedProxyPlaylist = false;
            let triedReResolve = false;
            let mediaRecoveryCount = 0;

            const mountHls = (playlistUrl: string, resumeAtSec = 0) => {
              if (gen !== loadGenRef.current) return;
              destroyHlsInstance();

              const hls = new Hls({
                enableWorker: true,
                maxBufferLength: 30,
                backBufferLength: 30,
                manifestLoadingMaxRetry: 3,
                levelLoadingMaxRetry: 3,
                fragLoadingMaxRetry: 4,
              });
              hlsRef.current = hls;

              hls.loadSource(playlistUrl);
              hls.attachMedia(audio);

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (gen !== loadGenRef.current) return;
                setIsBuffering(false);
                if (resumeAtSec > 1) {
                  audio.currentTime = resumeAtSec;
                }
                if (isPlayingRef.current) {
                  void safeAttemptPlay(gen);
                }
              });

              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (gen !== loadGenRef.current || !data.fatal) return;

                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryCount < 2) {
                  mediaRecoveryCount += 1;
                  hls.recoverMediaError();
                  return;
                }

                const savedPos = audio.currentTime || 0;

                if (!triedProxyPlaylist && payload.proxyPlaylistUrl) {
                  triedProxyPlaylist = true;
                  mountHls(payload.proxyPlaylistUrl, savedPos);
                  return;
                }

                if (!triedReResolve) {
                  triedReResolve = true;
                  void (async () => {
                    const refreshed = await fetchResolved();
                    if (gen !== loadGenRef.current) return;
                    if (refreshed && refreshed.url) {
                      mountHls(refreshed.proxyPlaylistUrl || refreshed.url, savedPos);
                      return;
                    }
                    destroyHlsInstance();
                    candidateUrlsRef.current = [streamM4aFallback];
                    candidateIdxRef.current = 0;
                    audio.src = streamM4aFallback;
                    audio.load();
                    if (isPlayingRef.current) {
                      void safeAttemptPlay(gen);
                    }
                  })();
                  return;
                }

                destroyHlsInstance();
                candidateUrlsRef.current = [streamM4aFallback];
                candidateIdxRef.current = 0;
                audio.src = streamM4aFallback;
                audio.load();
                if (isPlayingRef.current) {
                  void safeAttemptPlay(gen);
                }
              });
            };

            mountHls(payload.url, 0);
          } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
            candidateUrlsRef.current = [
              payload.url,
              payload.proxyPlaylistUrl,
              streamM4aFallback,
            ].filter(Boolean);
            candidateIdxRef.current = 0;
            audio.src = candidateUrlsRef.current[0];
            audio.load();
            setIsBuffering(false);
            if (isPlayingRef.current) {
              void safeAttemptPlay(gen);
            }
          } else {
            candidateUrlsRef.current = [streamM4aFallback];
            candidateIdxRef.current = 0;
            audio.src = streamM4aFallback;
            audio.load();
            setIsBuffering(false);
            if (isPlayingRef.current) {
              void safeAttemptPlay(gen);
            }
          }
        } catch {
          if (gen !== loadGenRef.current) return;
          setIsBuffering(false);
          setStreamError(true);
          onPlayStateChange(false);
        }
      })();
    } else {
      const candidates: string[] = [];
      if (isDirectCorsAudioUrl(track.audioUrl)) {
        candidates.push(track.audioUrl);
      }
      candidates.push(buildProxyStreamUrl(track.audioUrl));

      const surahNum = extractSurahNumberFromTrack(track);
      if (surahNum !== null) {
        const backups = buildBackupQuranUrls(surahNum, track.audioUrl);
        for (const bUrl of backups) {
          candidates.push(bUrl);
          candidates.push(buildProxyStreamUrl(bUrl));
        }
      }

      candidateUrlsRef.current = candidates;
      candidateIdxRef.current = 0;

      audio.src = candidates[0];
      audio.load();
      if (isPlayingRef.current) {
        void safeAttemptPlay(gen);
      }
    }

    return () => {
      destroyHlsInstance();
    };
  }, [track?.id, reloadNonce, destroyHlsInstance, safeAttemptPlay]);

  // Sync play/pause toggle without re-creating the stream
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || streamError) return;

    if (isPlaying) {
      if (audio.src || hlsRef.current) {
        void safeAttemptPlay(loadGenRef.current);
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, track, streamError, safeAttemptPlay]);

  // Sync playback rate, volume & mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = track?.isLiveStream ? 1 : playbackRate;
    audio.volume = volume;
    audio.muted = muted;
  }, [playbackRate, volume, muted, track?.isLiveStream]);

  // Lock-screen & OS MediaSession integration
  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Sma3ny - سمعني',
        artwork: track.externalCoverUrl
          ? [{ src: track.externalCoverUrl, sizes: '500x500', type: 'image/jpeg' }]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => onPlayStateChange(true));
      navigator.mediaSession.setActionHandler('pause', () => onPlayStateChange(false));
      navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
      navigator.mediaSession.setActionHandler('seekbackward', () => seekByOffset(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => seekByOffset(10));
    } catch {
      // Ignore unsupported mediaSession handlers
    }
  }, [track, onPlayStateChange, onPrev, onNext, seekByOffset]);

  if (!track) return null;

  const isLive = Boolean(track.isLiveStream);
  const isQuranSurah = extractSurahNumberFromTrack(track) !== null;
  const effectiveDuration = isLive ? 0 : duration > 0 ? duration : track.durationSec;
  const progressPercent = isLive
    ? 100
    : effectiveDuration > 0
      ? Math.min(100, (currentTime / effectiveDuration) * 100)
      : 0;

  const hasActiveAbLoop = loopA !== null && loopB !== null && loopB > loopA;
  const hasActiveSleep = sleepRemainingSec !== null || sleepEndOfTrack;
  const hasActiveEq = eqState.preset !== 'flat' || eqState.gains.some((g) => g !== 0);

  const repeatLabel =
    repeatMode === 'one'
      ? 'تكرار المقطع الحالي مفعّل (اضغط لإيقاف التكرار)'
      : repeatMode === 'all'
        ? 'تكرار القائمة مفعّل (اضغط لتكرار المقطع الحالي فقط)'
        : 'التكرار متوقف (اضغط لتفعيل تكرار القائمة)';

  const handleRetryStream = () => {
    setStreamError(false);
    onPlayStateChange(true);
    setReloadNonce((n) => n + 1);
  };

  const handleSelectEqPreset = (presetId: Exclude<EqPresetId, 'custom'>) => {
    ensureEqGraphConnected();
    setEqState({
      preset: presetId,
      gains: [...EQ_PRESETS[presetId].gains] as [number, number, number, number, number],
    });
  };

  const handleBandGainChange = (bandIdx: number, dbValue: number) => {
    ensureEqGraphConnected();
    setEqState((prev) => {
      const nextGains = [...prev.gains] as [number, number, number, number, number];
      nextGains[bandIdx] = Math.max(-12, Math.min(12, Math.round(dbValue)));
      return { preset: 'custom', gains: nextGains };
    });
  };

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onCanPlay={() => {
          setIsBuffering(false);
        }}
        onPlaying={() => {
          setIsBuffering(false);
          setStreamError(false);
        }}
        onWaiting={() => {
          setIsBuffering(true);
        }}
        onTimeUpdate={(e) => {
          if (isLive) return;
          const nowSec = e.currentTarget.currentTime;
          if (loopA !== null && loopB !== null && loopB > loopA && nowSec >= loopB) {
            e.currentTarget.currentTime = loopA;
            setCurrentTime(loopA);
            return;
          }
          setCurrentTime(nowSec);
        }}
        onLoadedMetadata={(e) => {
          setIsBuffering(false);
          if (isLive) return;
          const loadedDur = e.currentTarget.duration;
          if (Number.isFinite(loadedDur) && loadedDur > 0) {
            const rounded = Math.round(loadedDur);
            setDuration(rounded);
            onDurationResolved?.(track.id, rounded);
          }
        }}
        onEnded={() => {
          if (isLive) return;
          const audio = audioRef.current;
          if (sleepEndOfTrackRef.current) {
            onSelectSleepTimer(null);
            onPlayStateChange(false);
            setCurrentTime(0);
            return;
          }
          if (repeatModeRef.current === 'one' && audio) {
            audio.currentTime = 0;
            setCurrentTime(0);
            void audio.play().catch(() => {
              onPlayStateChange(false);
            });
            return;
          }
          onTrackNaturalEnd();
        }}
        onError={() => {
          const audio = audioRef.current;
          if (hlsRef.current || !audio) return;

          const resumeTime = isLive ? 0 : audio.currentTime || 0;
          const nextIdx = candidateIdxRef.current + 1;
          if (nextIdx < candidateUrlsRef.current.length) {
            candidateIdxRef.current = nextIdx;
            audio.src = candidateUrlsRef.current[nextIdx];
            audio.load();
            if (resumeTime > 2) {
              audio.addEventListener(
                'loadedmetadata',
                () => {
                  if (audio.duration > resumeTime) {
                    audio.currentTime = resumeTime;
                  }
                },
                { once: true }
              );
            }
            if (isPlayingRef.current) {
              void safeAttemptPlay(loadGenRef.current);
            }
            return;
          }

          setIsBuffering(false);
          setStreamError(true);
          onPlayStateChange(false);
        }}
      />

      {/* Synchronized Song Lyrics & Uthmani Quran Text Drawer */}
      <LyricsQuranDrawer
        isOpen={lyricsDrawerOpen}
        onClose={() => setLyricsDrawerOpen(false)}
        track={track}
        currentTimeSec={currentTime}
        durationSec={effectiveDuration}
        onSeekTo={seekToSecond}
      />

      {/* Expandable Studio Equalizer & Tools Popover */}
      {toolsOpen && (
        <div
          role="dialog"
          aria-label="موازن الصوت وأدوات التحكم المتقدمة"
          className="fixed bottom-20 left-3 right-3 sm:left-6 sm:right-auto sm:w-[26rem] z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setToolsTab('eq')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  toolsTab === 'eq'
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                موازن الصوت (EQ)
              </button>
              <button
                type="button"
                onClick={() => setToolsTab('controls')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  toolsTab === 'controls'
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                المؤقت والسرعة و A-B
              </button>
            </div>

            <button
              type="button"
              onClick={() => setToolsOpen(false)}
              aria-label="إغلاق أدوات المشغل"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {toolsTab === 'eq' ? (
            /* 5-Band Web Audio Equalizer & Bass Boost */
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    أوضاع الصوت الاحترافية
                  </span>
                  {hasActiveEq && (
                    <button
                      type="button"
                      onClick={() => handleSelectEqPreset('flat')}
                      className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      إعادة للوضع القياسي
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>
                  ).map((presetKey) => {
                    const preset = EQ_PRESETS[presetKey];
                    const selected = eqState.preset === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectEqPreset(presetKey)}
                        className={`px-2.5 py-2 rounded-lg text-xs font-semibold text-right border transition-colors truncate cursor-pointer ${
                          selected
                            ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                            : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">ضبط الترددات اليدوي</span>
                  <span dir="ltr" className="font-mono-tabular">-12 dB .. +12 dB</span>
                </div>

                <div className="space-y-2">
                  {EQ_BAND_LABELS.map((bandLabel, idx) => {
                    const val = eqState.gains[idx];
                    return (
                      <div key={bandLabel} dir="ltr" className="flex items-center gap-2.5 text-xs">
                        <span className="font-mono-tabular w-12 text-slate-600 dark:text-slate-400 font-semibold">
                          {bandLabel}
                        </span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={1}
                          value={val}
                          aria-label={`تردد ${bandLabel}`}
                          onChange={(e) => handleBandGainChange(idx, Number(e.target.value))}
                          className="flex-1 accent-teal-700 dark:accent-teal-400 cursor-pointer"
                        />
                        <span className="font-mono-tabular w-12 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {val > 0 ? `+${val}dB` : `${val}dB`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Speed, ±10s, A-B Section Loop, Sleep Timer & Volume */
            <div className="space-y-3.5">
              {!isLive && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>تقديم وتأخير وسرعة التشغيل</span>
                    <span dir="ltr" className="font-mono-tabular text-teal-700 dark:text-teal-400">
                      {playbackRate}x
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => seekByOffset(-10)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span dir="ltr">-10s</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => seekByOffset(10)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span dir="ltr">+10s</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
                    {SPEEDS.map((spd, idx) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSpeedIndex(idx)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                          speedIndex === idx
                            ? 'bg-teal-700 text-white dark:bg-teal-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span dir="ltr">{spd}x</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isLive && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      تكرار مقطع محدد (<span dir="ltr">A-B</span> للحفظ والإعادة)
                    </span>
                    {hasActiveAbLoop && (
                      <span dir="ltr" className="font-mono-tabular text-teal-700 dark:text-teal-400 font-semibold">
                        {formatDuration(loopA)} → {formatDuration(loopB)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const now = Math.floor(currentTime);
                        setLoopA(now);
                        if (loopB !== null && loopB <= now) {
                          setLoopB(null);
                        }
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        loopA !== null
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {loopA !== null ? `بداية A (${formatDuration(loopA)})` : 'تحديد بداية A'}
                    </button>
                    <button
                      type="button"
                      disabled={loopA === null}
                      onClick={() => {
                        if (loopA === null) return;
                        const targetB = Math.max(loopA + 2, Math.floor(currentTime));
                        setLoopB(targetB);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-45 ${
                        loopB !== null
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {loopB !== null ? `نهاية B (${formatDuration(loopB)})` : 'تحديد نهاية B'}
                    </button>
                    <button
                      type="button"
                      disabled={loopA === null && loopB === null}
                      onClick={() => {
                        setLoopA(null);
                        setLoopB(null);
                      }}
                      className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 cursor-pointer"
                    >
                      إلغاء A-B
                    </button>
                  </div>
                </div>
              )}

              {/* Sleep Timer */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <Timer className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    <span>مؤقت النوم التلقائي</span>
                  </span>
                  {sleepRemainingSec !== null ? (
                    <span dir="ltr" className="font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                      {formatDuration(sleepRemainingSec)}
                    </span>
                  ) : sleepEndOfTrack ? (
                    <span className="text-teal-700 dark:text-teal-400 font-semibold">
                      يتوقف بنهاية المقطع
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'إيقاف', val: null as number | 'track_end' | null },
                    { label: '15 د', val: 15 },
                    { label: '30 د', val: 30 },
                    { label: '45 د', val: 45 },
                    { label: '60 د', val: 60 },
                    ...(!isLive ? [{ label: 'نهاية المقطع', val: 'track_end' as const }] : []),
                  ].map((opt) => {
                    const isSelected =
                      (opt.val === null && !hasActiveSleep) ||
                      (opt.val === 'track_end' && sleepEndOfTrack) ||
                      (typeof opt.val === 'number' &&
                        sleepRemainingSec !== null &&
                        Math.abs(sleepRemainingSec - opt.val * 60) < 60);
                    return (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => onSelectSleepTimer(opt.val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-teal-700 text-white dark:bg-teal-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Volume Control */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">مستوى الصوت</span>
                  <span dir="ltr" className="font-mono-tabular">
                    {muted ? '0%' : `${Math.round(volume * 100)}%`}
                  </span>
                </div>
                <div dir="ltr" className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : Math.round(volume * 100)}
                    aria-label="مستوى الصوت"
                    onChange={(e) => {
                      const nextVol = Number(e.target.value) / 100;
                      setVolume(nextVol);
                      if (nextVol > 0 && muted) setMuted(false);
                    }}
                    className="w-full accent-teal-700 dark:accent-teal-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact Sticky Bottom Audio Bar (<= 72px on mobile to strictly honor 15% sticky cap) */}
      <aside
        aria-label="مشغل الصوت المباشر"
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 shadow-lg"
      >
        {/* Interactive Top Scrub Progress Bar */}
        <div dir="ltr" className="relative w-full h-1.5 bg-slate-200 dark:bg-slate-800 group">
          <div
            className="h-full bg-teal-600 dark:bg-teal-400 transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
          {!isLive && effectiveDuration > 0 && (
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(effectiveDuration))}
              value={Math.min(
                Math.floor(currentTime),
                Math.max(1, Math.floor(effectiveDuration))
              )}
              aria-label="التقديم والتأخير السريع في المقطع"
              onChange={(e) => seekToSecond(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          )}
        </div>

        <div className="max-w-6xl mx-auto px-2.5 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Track info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:max-w-xs">
            <MediaArtwork
              coverType={track.coverType}
              externalCoverUrl={track.externalCoverUrl}
              alt={track.title}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg hidden sm:block"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                {track.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {streamError ? (
                  <span className="text-red-600 dark:text-red-400 font-semibold">
                    تعذر الاتصال بالمصدر الصوتي
                  </span>
                ) : isBuffering && isPlaying ? (
                  <span className="text-teal-700 dark:text-teal-400 font-medium">
                    جاري تحضير البث...
                  </span>
                ) : isLive ? (
                  <span className="text-teal-700 dark:text-teal-400 font-semibold">
                    بث إذاعي مباشر 24/7
                  </span>
                ) : (
                  <span>
                    {track.artist}
                    {effectiveDuration > 0 && (
                      <span
                        dir="ltr"
                        className="sm:hidden font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500 ms-1.5 inline-block"
                      >
                        {formatDuration(currentTime || 0)} / {formatDuration(effectiveDuration)}
                      </span>
                    )}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Core Playback Controls */}
          <div className="flex items-center gap-1 sm:gap-2 flex-initial sm:flex-1 justify-center max-w-xl">
            <button
              type="button"
              onClick={onPrev}
              aria-label="المقطع السابق"
              className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
            </button>

            {streamError ? (
              <button
                type="button"
                onClick={handleRetryStream}
                aria-label="إعادة محاولة تشغيل المقطع"
                className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إعادة</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPlayStateChange(!isPlaying)}
                aria-label={isPlaying ? 'إيقاف التشغيل مؤقتاً' : 'تشغيل المقطع الحالي'}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors shrink-0 cursor-pointer"
              >
                {isBuffering && isPlaying ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onNext}
              aria-label="المقطع التالي"
              className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4" aria-hidden="true" />
            </button>

            {!isLive && (
              <>
                <button
                  type="button"
                  onClick={onCycleRepeatMode}
                  title={repeatLabel}
                  aria-label={repeatLabel}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
                    repeatMode === 'one'
                      ? 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 ring-1 ring-teal-600/30'
                      : repeatMode === 'all'
                        ? 'text-teal-700 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Repeat className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleShuffle}
                  aria-label={shuffle ? 'إيقاف التشغيل العشوائي' : 'تفعيل التشغيل العشوائي'}
                  aria-pressed={shuffle}
                  className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
                    shuffle
                      ? 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Shuffle className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            )}

            {/* Desktop Explicit Time Scrubber */}
            {!isLive && (
              <div dir="ltr" className="hidden lg:flex items-center gap-2 flex-1 min-w-40">
                <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-400 w-12 text-center">
                  {currentTime > 0 ? formatDuration(currentTime) : '00:00'}
                </span>
                <label htmlFor="player-seek-range" className="sr-only">
                  شريط التقدم في المقطع
                </label>
                <input
                  id="player-seek-range"
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(effectiveDuration))}
                  value={Math.min(
                    Math.floor(currentTime),
                    Math.max(1, Math.floor(effectiveDuration))
                  )}
                  disabled={effectiveDuration <= 0}
                  onChange={(e) => seekToSecond(Number(e.target.value))}
                  className="w-full accent-teal-700 dark:accent-teal-400 cursor-pointer"
                />
                <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400 w-12 text-center">
                  {formatDuration(effectiveDuration)}
                </span>
              </div>
            )}
          </div>

          {/* Right Utility Actions (Lyrics/Quran Text + Equalizer + Playlist + Download + Close) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {!isLive && (
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setLyricsDrawerOpen((o) => !o);
                }}
                aria-label={isQuranSurah ? 'عرض آيات السورة المتزامنة' : 'عرض كلمات الأغنية المتزامنة'}
                title={isQuranSurah ? 'آيات السورة' : 'كلمات الأغنية'}
                className={`inline-flex items-center gap-1 px-2 sm:px-2.5 h-9 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  lyricsDrawerOpen
                    ? 'bg-teal-100 dark:bg-teal-950/70 border-teal-600/40 text-teal-800 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isQuranSurah ? (
                  <BookOpen className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                )}
                <span className="hidden md:inline">
                  {isQuranSurah ? 'الآيات' : 'الكلمات'}
                </span>
              </button>
            )}

            {!isLive && (
              <button
                type="button"
                onClick={() => onAddToPlaylist(track)}
                aria-label={`إضافة ${track.title} إلى قائمة تشغيل`}
                title="إضافة لقائمة تشغيل"
                className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ListPlus className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setLyricsDrawerOpen(false);
                setToolsOpen((o) => !o);
              }}
              aria-label="موازن الصوت وأدوات المشغل"
              aria-expanded={toolsOpen}
              title="موازن الصوت (Equalizer) والمؤقت"
              className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
                toolsOpen || hasActiveEq || hasActiveAbLoop || hasActiveSleep || speedIndex !== 1
                  ? 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>

            {!isLive && (
              <button
                type="button"
                onClick={() => onOpenDownload(track)}
                aria-label={`تنزيل ${track.title}`}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 h-9 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">تحميل</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setToolsOpen(false);
                setLyricsDrawerOpen(false);
                onClosePlayer();
              }}
              aria-label="إغلاق مشغل الصوت"
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
