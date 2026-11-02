import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  BookOpen,
  FileText,
  Copy,
  Check,
  Loader2,
  RotateCcw,
  Radio,
} from 'lucide-react';
import {
  extractSurahNumberFromTrack,
  findActiveAyahIndex,
  findActiveSyncedIndex,
  formatDuration,
  parseLrcSyncedLyrics,
  type MediaTrack,
  type QuranAyahItem,
} from '../utils/mediaLogic';

interface LyricsQuranDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  track: MediaTrack | null;
  currentTimeSec: number;
  durationSec: number;
  onSeekTo: (targetSec: number) => void;
}

const FONT_SIZE_CLASSES = ['text-base', 'text-lg', 'text-xl', 'text-2xl'] as const;

export function LyricsQuranDrawer({
  isOpen,
  onClose,
  track,
  currentTimeSec,
  durationSec,
  onSeekTo,
}: LyricsQuranDrawerProps) {
  const [fontScaleIdx, setFontScaleIdx] = useState(1);
  const [autoFollow, setAutoFollow] = useState(true);
  const [copied, setCopied] = useState(false);

  // Quran Text State
  const [ayahs, setAyahs] = useState<QuranAyahItem[]>([]);
  const [quranLoading, setQuranLoading] = useState(false);
  const [quranError, setQuranError] = useState<string | null>(null);

  // Song Lyrics State
  const [syncedRaw, setSyncedRaw] = useState<string | null>(null);
  const [plainRaw, setPlainRaw] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsNotFound, setLyricsNotFound] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const activeItemRef = useRef<HTMLElement | null>(null);

  const surahNum = useMemo(
    () => (track ? extractSurahNumberFromTrack(track) : null),
    [track]
  );

  // Fetch Quran Surah Uthmani text or Song Lyrics whenever drawer opens or track changes
  useEffect(() => {
    if (!isOpen || !track) return;

    if (track.isLiveStream) {
      return;
    }

    const controller = new AbortController();

    if (surahNum !== null) {
      setQuranLoading(true);
      setQuranError(null);
      setAyahs([]);

      void (async () => {
        try {
          const res = await fetch(`/api/quran/text/${surahNum}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error('Failed');
          const data = (await res.json()) as { ayahs?: QuranAyahItem[] };
          if (!controller.signal.aborted) {
            setAyahs(Array.isArray(data.ayahs) ? data.ayahs : []);
          }
        } catch {
          if (!controller.signal.aborted) {
            setQuranError('تعذر تحميل آيات السورة حالياً، يرجى المحاولة مرة أخرى.');
          }
        } finally {
          if (!controller.signal.aborted) {
            setQuranLoading(false);
          }
        }
      })();
    } else {
      setLyricsLoading(true);
      setLyricsNotFound(false);
      setSyncedRaw(null);
      setPlainRaw(null);

      void (async () => {
        try {
          const res = await fetch(
            `/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`,
            { signal: controller.signal }
          );
          if (!res.ok) throw new Error('Failed');
          const data = (await res.json()) as {
            found?: boolean;
            syncedLyrics?: string | null;
            plainLyrics?: string | null;
          };
          if (!controller.signal.aborted) {
            if (data.found && (data.syncedLyrics || data.plainLyrics)) {
              setSyncedRaw(data.syncedLyrics || null);
              setPlainRaw(data.plainLyrics || null);
            } else {
              setLyricsNotFound(true);
            }
          }
        } catch {
          if (!controller.signal.aborted) {
            setLyricsNotFound(true);
          }
        } finally {
          if (!controller.signal.aborted) {
            setLyricsLoading(false);
          }
        }
      })();
    }

    return () => {
      controller.abort();
    };
  }, [isOpen, track?.id, surahNum, retryNonce]);

  const syncedLines = useMemo(
    () => (syncedRaw ? parseLrcSyncedLyrics(syncedRaw) : []),
    [syncedRaw]
  );

  const activeLyricIdx = useMemo(
    () => findActiveSyncedIndex(syncedLines, currentTimeSec),
    [syncedLines, currentTimeSec]
  );

  const activeAyahIdx = useMemo(
    () =>
      surahNum !== null ? findActiveAyahIndex(ayahs, currentTimeSec, durationSec) : -1,
    [surahNum, ayahs, currentTimeSec, durationSec]
  );

  // Smooth auto-scroll when active line / active Ayah advances
  useEffect(() => {
    if (!isOpen || !autoFollow || !activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [isOpen, autoFollow, activeLyricIdx, activeAyahIdx]);

  if (!isOpen || !track) return null;

  const fontClass = FONT_SIZE_CLASSES[fontScaleIdx];

  const handleCopyText = async () => {
    let textToCopy = '';
    if (surahNum !== null && ayahs.length > 0) {
      textToCopy = ayahs.map((a) => `${a.text} ﴿${a.numberInSurah}﴾`).join(' ');
    } else if (syncedLines.length > 0) {
      textToCopy = syncedLines.map((l) => l.text).join('\n');
    } else if (plainRaw) {
      textToCopy = plainRaw;
    }
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="lyrics-quran-drawer-title"
      className="fixed inset-x-0 top-0 bottom-[4.1rem] z-40 bg-slate-950/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[76vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {surahNum !== null ? (
              <BookOpen className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            ) : track.isLiveStream ? (
              <Radio className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            ) : (
              <FileText className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h2
                id="lyrics-quran-drawer-title"
                className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate"
              >
                {surahNum !== null
                  ? `نص المصحف العثماني المتزامن — ${track.title}`
                  : track.isLiveStream
                    ? `بث إذاعي مباشر — ${track.title}`
                    : `كلمات الأغنية — ${track.title}`}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {track.artist}
                {syncedLines.length > 0 && ' · متزامنة لحظياً مع الغناء'}
                {surahNum !== null && ayahs.length > 0 && ` · ${ayahs.length} آية كريمة`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!track.isLiveStream && (
              <>
                <button
                  type="button"
                  onClick={() => setAutoFollow((f) => !f)}
                  className={`hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    autoFollow
                      ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-600/40 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  متابعة تلقائية
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFontScaleIdx((i) => (i + 1) % FONT_SIZE_CLASSES.length)
                  }
                  aria-label="تكبير أو تصغير حجم الخط"
                  title="حجم الخط"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  خط+
                </button>

                {(ayahs.length > 0 || syncedLines.length > 0 || Boolean(plainRaw)) && (
                  <button
                    type="button"
                    onClick={() => void handleCopyText()}
                    aria-label="نسخ النص بالكامل"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">نسخ</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة الكلمات والآيات"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {track.isLiveStream ? (
            <div className="py-10 text-center space-y-3">
              <Radio className="w-10 h-10 text-teal-700 dark:text-teal-400 mx-auto" aria-hidden="true" />
              <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                أنت تستمع الآن إلى بث إذاعي مباشر على مدار الساعة
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                البث الإذاعي الحي يعمل بشكل مستمر على مدار 24 ساعة. لعرض نص السور القرآنية المتزامنة أو كلمات الأغاني، اختر أي سورة أو أغنية من محرك البحث أو قسم القرآن الكريم.
              </p>
            </div>
          ) : surahNum !== null ? (
            /* Quran Surah Synchronized Uthmani View */
            quranLoading ? (
              <div className="py-14 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <span className="text-sm font-medium">جاري تحميل آيات السورة بالرسم العثماني...</span>
              </div>
            ) : quranError ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">{quranError}</p>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {surahNum !== 1 && surahNum !== 9 && (
                  <p className="text-center font-display text-lg sm:text-xl font-bold text-teal-800 dark:text-teal-300 pb-3 border-b border-slate-100 dark:border-slate-800">
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                  </p>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  اضغط على أي آية للانتقال إليها مباشرة في التلاوة الصوتية
                </p>

                <div className="space-y-2.5">
                  {ayahs.map((ayah, idx) => {
                    const isActive = idx === activeAyahIdx && durationSec > 0;
                    return (
                      <button
                        key={ayah.numberInSurah}
                        ref={isActive ? (el) => { activeItemRef.current = el; } : undefined}
                        type="button"
                        onClick={() => {
                          if (durationSec > 0) {
                            onSeekTo(Math.floor(ayah.startRatio * durationSec));
                          }
                        }}
                        className={`w-full text-right p-3.5 rounded-xl border transition-colors leading-loose cursor-pointer ${fontClass} ${
                          isActive
                            ? 'bg-teal-50/90 dark:bg-teal-950/45 border-teal-600/40 text-slate-950 dark:text-white font-semibold'
                            : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <span>{ayah.text}</span>{' '}
                        <span className="inline-block font-mono-tabular text-sm text-teal-700 dark:text-teal-400 font-bold ms-1">
                          ﴿{ayah.numberInSurah}﴾
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : lyricsLoading ? (
            /* Song Lyrics Loading */
            <div className="py-14 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span className="text-sm font-medium">جاري البحث عن كلمات الأغنية المتزامنة...</span>
            </div>
          ) : syncedLines.length > 0 ? (
            /* Synchronized LRC Song Lyrics */
            <div className="space-y-2 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 pb-2">
                كلمات متزامنة تلقائياً — اضغط على أي سطر للانتقال إلى ثانيته فوراً
              </p>
              {syncedLines.map((line, idx) => {
                const isActive = idx === activeLyricIdx;
                return (
                  <button
                    key={`${line.timeSec}-${idx}`}
                    ref={isActive ? (el) => { activeItemRef.current = el; } : undefined}
                    type="button"
                    onClick={() => onSeekTo(line.timeSec)}
                    className={`w-full px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${fontClass} ${
                      isActive
                        ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 font-bold scale-[1.01]'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span dir="auto" className="flex-1 text-center leading-relaxed">{line.text}</span>
                    <span
                      dir="ltr"
                      className="font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500 shrink-0"
                    >
                      {formatDuration(line.timeSec)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : plainRaw ? (
            /* Plain Song Lyrics */
            <div
              dir="auto"
              className={`whitespace-pre-line text-center leading-loose text-slate-800 dark:text-slate-200 ${fontClass}`}
            >
              {plainRaw}
            </div>
          ) : lyricsNotFound ? (
            <div className="py-12 text-center space-y-3">
              <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                لم تتوفر كلمات مسجلة لهذا المقطع بعد
              </p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                بعض التسجيلات الحية أو الألبومات المجمعة قد لا تتوفر لها كلمات نصية مفهرسة في قواعد الكلمات المفتوحة.
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إعادة البحث عن الكلمات</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
