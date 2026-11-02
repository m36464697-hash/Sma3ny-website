import { useEffect, useMemo, useState } from 'react';
import {
  Radio,
  Play,
  Pause,
  Search,
  ArrowRight,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import {
  normalizeArabicText,
  radioStationToMediaTrack,
  type LiveRadioStation,
  type MediaTrack,
} from '../utils/mediaLogic';

interface LiveRadioViewProps {
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlayStation: (stationTrack: MediaTrack, stationQueue: MediaTrack[]) => void;
  onBackToSearch: () => void;
}

type RadioCategoryFilter = 'all' | 'quran_radio' | 'music_radio';

export function LiveRadioView({
  currentTrackId,
  isPlaying,
  onPlayStation,
  onBackToSearch,
}: LiveRadioViewProps) {
  const [stations, setStations] = useState<LiveRadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<RadioCategoryFilter>('all');
  const [query, setQuery] = useState('');

  const loadStations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/radios');
      if (!res.ok) throw new Error('Failed');
      const data = (await res.json()) as { stations?: LiveRadioStation[] };
      setStations(Array.isArray(data.stations) ? data.stations : []);
    } catch {
      setError('تعذر تحميل قائمة المحطات الإذاعية حالياً، يرجى إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStations();
  }, []);

  const filteredStations = useMemo(() => {
    const normQ = normalizeArabicText(query);
    return stations.filter((st) => {
      if (catFilter !== 'all' && st.category !== catFilter) return false;
      if (!normQ) return true;
      const hay = normalizeArabicText(`${st.name} ${st.subtitle}`);
      return hay.includes(normQ);
    });
  }, [stations, catFilter, query]);

  const counts = useMemo(() => {
    let quran = 0;
    let music = 0;
    for (const s of stations) {
      if (s.category === 'quran_radio') quran += 1;
      else music += 1;
    }
    return { all: stations.length, quran, music };
  }, [stations]);

  const stationQueueTracks = useMemo(
    () => filteredStations.map((s) => radioStationToMediaTrack(s)),
    [filteredStations]
  );

  return (
    <section aria-labelledby="live-radio-heading" className="space-y-6">
      {/* Header Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1
              id="live-radio-heading"
              className="font-display text-lg sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5"
            >
              <Radio className="w-6 h-6 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <span>إذاعات البث المباشر على مدار الساعة (24/7)</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              استمع مباشرة لإذاعة القرآن الكريم (القاهرة ومكة وكبار القراء) ومحطات الطرب العربي الأصيل والحديث بدون توقف، مع دعم موازن الصوت (Equalizer).
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToSearch}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap self-start cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span>العودة لمحرك البحث</span>
          </button>
        </div>

        {/* Category Tabs + Search Input */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all' as const, label: 'كل المحطات', count: counts.all },
              { id: 'quran_radio' as const, label: 'إذاعات القرآن الكريم', count: counts.quran },
              { id: 'music_radio' as const, label: 'إذاعات الطرب والأغاني', count: counts.music },
            ].map((tab) => {
              const active = catFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCatFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg text-xs sm:text-sm font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono-tabular text-xs ${
                      active ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن إذاعة القاهرة، أم كلثوم، فيروز..."
              aria-label="البحث في المحطات الإذاعية المباشرة"
              className="w-full pr-9 pl-3 py-2 min-h-10 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
            />
          </div>
        </div>
      </div>

      {/* Stations Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span className="text-sm font-medium">جاري الاتصال بمحطات البث المباشر...</span>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void loadStations()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : filteredStations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            لا توجد إذاعات مطابقة لبحثك
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCatFilter('all');
            }}
            className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
          >
            عرض جميع الإذاعات المتاحة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStations.map((station, idx) => {
            const mediaTrack = stationQueueTracks[idx];
            const isActiveStation = currentTrackId === mediaTrack.id;
            const isActivelyStreaming = isActiveStation && isPlaying;

            return (
              <article
                key={station.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-4 flex items-center justify-between gap-4 transition-colors ${
                  isActiveStation
                    ? 'border-teal-600 dark:border-teal-500 bg-teal-50/30 dark:bg-teal-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      station.category === 'quran_radio'
                        ? 'bg-teal-700/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400'
                        : 'bg-amber-600/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                    }`}
                  >
                    <Radio
                      className={`w-5 h-5 ${isActivelyStreaming ? 'animate-pulse' : ''}`}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      {station.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {isActivelyStreaming ? (
                        <span className="text-teal-700 dark:text-teal-400 font-semibold">
                          يبث الآن مباشرة · 24/7
                        </span>
                      ) : (
                        station.subtitle
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onPlayStation(mediaTrack, stationQueueTracks)}
                  aria-label={
                    isActivelyStreaming
                      ? `إيقاف بث ${station.name}`
                      : `تشغيل بث ${station.name}`
                  }
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-10 rounded-lg text-xs sm:text-sm font-semibold transition-colors shrink-0 cursor-pointer ${
                    isActivelyStreaming
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white'
                  }`}
                >
                  {isActivelyStreaming ? (
                    <>
                      <Pause className="w-4 h-4" aria-hidden="true" />
                      <span>إيقاف</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>بث مباشر</span>
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
