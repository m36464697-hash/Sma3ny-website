import { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw, ArrowRight, Play } from 'lucide-react';
import {
  buildSurahTracksForReciter,
  normalizeArabicText,
  type MediaTrack,
  type QuranReciter,
  type QuranSurahMeta,
} from '../utils/mediaLogic';
import { TrackList } from './TrackList';

const QURAN_PREF_KEY = 'sma3ny_quran_reciter_pref_v1';

const QUICK_SURAHS = [
  { label: 'كل السور (114)', filter: '' },
  { label: 'الفاتحة', filter: '001' },
  { label: 'البقرة', filter: '002' },
  { label: 'الكهف', filter: '018' },
  { label: 'يس', filter: '036' },
  { label: 'الرحمن', filter: '055' },
  { label: 'الواقعة', filter: '056' },
  { label: 'الملك', filter: '067' },
];

interface QuranBrowserProps {
  currentTrackId: string | null;
  isPlaying: boolean;
  savedIds: Set<string>;
  resolvedDurations: Record<string, number>;
  onVisibleTracksChange?: (tracks: MediaTrack[]) => void;
  onTogglePlay: (track: MediaTrack) => void;
  onOpenDownload: (track: MediaTrack) => void;
  onToggleSave: (track: MediaTrack) => void;
  onAddToPlaylist: (track: MediaTrack) => void;
  onShareTrack: (track: MediaTrack) => void;
  onBackToSearch: () => void;
}

export function QuranBrowser({
  currentTrackId,
  isPlaying,
  savedIds,
  resolvedDurations,
  onVisibleTracksChange,
  onTogglePlay,
  onOpenDownload,
  onToggleSave,
  onAddToPlaylist,
  onShareTrack,
  onBackToSearch,
}: QuranBrowserProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suwar, setSuwar] = useState<QuranSurahMeta[]>([]);
  const [reciters, setReciters] = useState<QuranReciter[]>([]);

  const [selectedReciterId, setSelectedReciterId] = useState<number>(0);
  const [selectedMoshafId, setSelectedMoshafId] = useState<number>(0);
  const [reciterSearch, setReciterSearch] = useState('');
  const [surahFilter, setSurahFilter] = useState('');

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quran/catalog');
      if (!res.ok) {
        throw new Error('فشل جلب بيانات القراء والسور');
      }
      const data = (await res.json()) as {
        suwar: QuranSurahMeta[];
        reciters: QuranReciter[];
      };
      const loadedReciters = data.reciters || [];
      setSuwar(data.suwar || []);
      setReciters(loadedReciters);

      if (loadedReciters.length > 0) {
        let initialReciter = loadedReciters[0];
        let initialMoshafId = initialReciter.moshafs[0]?.id ?? 0;

        try {
          const rawPref = localStorage.getItem(QURAN_PREF_KEY);
          if (rawPref) {
            const parsed = JSON.parse(rawPref) as { reciterId?: number; moshafId?: number };
            const found = loadedReciters.find((r) => r.id === parsed.reciterId);
            if (found) {
              initialReciter = found;
              const mFound = found.moshafs.find((m) => m.id === parsed.moshafId);
              initialMoshafId = mFound ? mFound.id : found.moshafs[0]?.id ?? 0;
            }
          }
        } catch {
          // ignore storage errors
        }

        setSelectedReciterId(initialReciter.id);
        setSelectedMoshafId(initialMoshafId);
      }
    } catch {
      setError('تعذر الاتصال بخادم المصحف الصوتي حالياً. يرجى التحقق من الاتصال وإعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!selectedReciterId) return;
    try {
      localStorage.setItem(
        QURAN_PREF_KEY,
        JSON.stringify({ reciterId: selectedReciterId, moshafId: selectedMoshafId })
      );
    } catch {
      // ignore
    }
  }, [selectedReciterId, selectedMoshafId]);

  const filteredReciters = useMemo(() => {
    const q = normalizeArabicText(reciterSearch);
    if (!q) return reciters;
    return reciters.filter((r) => normalizeArabicText(r.name).includes(q));
  }, [reciters, reciterSearch]);

  const activeReciter = useMemo(
    () =>
      filteredReciters.find((r) => r.id === selectedReciterId) ||
      filteredReciters[0] ||
      reciters.find((r) => r.id === selectedReciterId) ||
      reciters[0] ||
      null,
    [reciters, filteredReciters, selectedReciterId]
  );

  const activeMoshaf = useMemo(() => {
    if (!activeReciter) return null;
    return (
      activeReciter.moshafs.find((m) => m.id === selectedMoshafId) ||
      activeReciter.moshafs[0] ||
      null
    );
  }, [activeReciter, selectedMoshafId]);

  const allSurahTracks = useMemo(() => {
    if (!activeReciter || !activeMoshaf || suwar.length === 0) return [];
    return buildSurahTracksForReciter(activeReciter, activeMoshaf, suwar).map((t) =>
      resolvedDurations[t.id] ? { ...t, durationSec: resolvedDurations[t.id] } : t
    );
  }, [activeReciter, activeMoshaf, suwar, resolvedDurations]);

  const visibleSurahTracks = useMemo(() => {
    const q = normalizeArabicText(surahFilter);
    if (!q) return allSurahTracks;
    return allSurahTracks.filter((t) => normalizeArabicText(t.title).includes(q));
  }, [allSurahTracks, surahFilter]);

  useEffect(() => {
    onVisibleTracksChange?.(visibleSurahTracks);
  }, [visibleSurahTracks, onVisibleTracksChange]);

  return (
    <section aria-labelledby="quran-browser-heading" className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="quran-browser-heading"
              className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            >
              المصحف المرتل الكامل (<span className="font-mono-tabular">114</span> سورة بصوت القراء الحقيقيين)
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              اختر القارئ والرواية للاستماع المباشر المتواصل أو إضافة السور لقوائم تشغيلك وتحميلها بصيغة MP3.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visibleSurahTracks.length > 0 && (
              <button
                type="button"
                onClick={() => onTogglePlay(visibleSurahTracks[0])}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-10 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>تشغيل متواصل من البداية</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBackToSearch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
              <span>العودة لمحرك البحث</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="p-6 text-center border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 rounded-xl">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 min-h-10 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              {/* 1. Search Reciter Name */}
              <div>
                <label
                  htmlFor="quran-reciter-search"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  ابحث عن اسم القارئ
                </label>
                <input
                  id="quran-reciter-search"
                  type="search"
                  value={reciterSearch}
                  onChange={(e) => setReciterSearch(e.target.value)}
                  placeholder="مثال: العفاسي، عبد الباسط..."
                  className="w-full px-3 py-2.5 min-h-10 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
                />
              </div>

              {/* 2. Select Reciter */}
              <div>
                <label
                  htmlFor="quran-reciter-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  القارئ (<span className="font-mono-tabular">{filteredReciters.length}</span> متاح)
                </label>
                <select
                  id="quran-reciter-select"
                  value={activeReciter?.id ?? ''}
                  disabled={loading || filteredReciters.length === 0}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setSelectedReciterId(nextId);
                    const found = reciters.find((r) => r.id === nextId);
                    if (found && found.moshafs[0]) {
                      setSelectedMoshafId(found.moshafs[0].id);
                    }
                  }}
                  className="w-full pr-3.5 pl-8 py-2.5 min-h-10 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600 cursor-pointer"
                >
                  {filteredReciters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.moshafs[0]?.surahTotal ?? 0} سورة)
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Select Riwayah / Moshaf */}
              <div>
                <label
                  htmlFor="quran-moshaf-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الرواية أو نوع المصحف
                </label>
                <select
                  id="quran-moshaf-select"
                  value={activeMoshaf?.id ?? ''}
                  disabled={loading || !activeReciter}
                  onChange={(e) => setSelectedMoshafId(Number(e.target.value))}
                  className="w-full pr-3.5 pl-8 py-2.5 min-h-10 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600 cursor-pointer"
                >
                  {(activeReciter?.moshafs || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.surahTotal} سورة)
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Filter Surahs by Name or Number */}
              <div>
                <label
                  htmlFor="quran-surah-filter"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  تصفية السور بالاسم أو الرقم
                </label>
                <div className="relative flex items-center">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="quran-surah-filter"
                    type="search"
                    value={surahFilter}
                    onChange={(e) => setSurahFilter(e.target.value)}
                    placeholder="مثال: البقرة، الكهف، 002..."
                    className="w-full pr-9 pl-3 py-2.5 min-h-10 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
                  />
                </div>
              </div>
            </div>

            {/* Quick Surah Shortcuts */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">انتقال سريع:</span>
              {QUICK_SURAHS.map((qs) => {
                const active = surahFilter === qs.filter;
                return (
                  <button
                    key={qs.label}
                    type="button"
                    onClick={() => setSurahFilter(qs.filter)}
                    className={`px-3 py-1.5 min-h-8 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {qs.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!error && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600 dark:text-slate-400 px-1">
            <span>
              القارئ الحالي:{' '}
              <strong className="text-slate-900 dark:text-white">
                {activeReciter ? activeReciter.name : 'جاري التحميل...'}
              </strong>
            </span>
            <span>
              السور المعروضة:{' '}
              <strong className="font-mono-tabular text-slate-900 dark:text-white">
                {visibleSurahTracks.length}
              </strong>{' '}
              سورة
            </span>
          </div>

          <TrackList
            tracks={visibleSurahTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            savedIds={savedIds}
            isLoading={loading}
            errorMessage={null}
            onTogglePlay={onTogglePlay}
            onOpenDownload={onOpenDownload}
            onToggleSave={onToggleSave}
            onAddToPlaylist={onAddToPlaylist}
            onShareTrack={onShareTrack}
            onResetFilters={() => setSurahFilter('')}
          />
        </div>
      )}
    </section>
  );
}
