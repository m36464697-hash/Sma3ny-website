import { Play, Pause, Download, Bookmark, ListPlus, Share2, RotateCcw } from 'lucide-react';
import {
  CATEGORY_LABELS,
  formatDuration,
  formatFileSizeMB,
  type MediaTrack,
} from '../utils/mediaLogic';
import { MediaArtwork } from './MediaArtwork';

interface TrackListProps {
  tracks: MediaTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  savedIds: Set<string>;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
  onTogglePlay: (track: MediaTrack) => void;
  onOpenDownload: (track: MediaTrack) => void;
  onToggleSave: (track: MediaTrack) => void;
  onAddToPlaylist: (track: MediaTrack) => void;
  onShareTrack?: (track: MediaTrack) => void;
  onResetFilters: () => void;
}

export function TrackList({
  tracks,
  currentTrackId,
  isPlaying,
  savedIds,
  isLoading,
  errorMessage,
  onRetry,
  onTogglePlay,
  onOpenDownload,
  onToggleSave,
  onAddToPlaylist,
  onShareTrack,
  onResetFilters,
}: TrackListProps) {
  if (errorMessage) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-xl p-8 text-center">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          تعذر إتمام البحث في الوقت الحالي
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {errorMessage}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 min-h-11 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>إعادة المحاولة</span>
          </button>
        )}
      </div>
    );
  }

  if (tracks.length === 0 && !isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          لم يتم العثور على مقاطع مطابقة لبحثك
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          جرب كتابة اسم الأغنية أو اسم المطرب بشكل مختلف، أو اختر قسم «كل الصوتيات» لعرض جميع النتائج المتوفرة.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 min-h-11 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>مسح التصفية والعودة للبحث</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
      {isLoading && tracks.length === 0 && (
        <div
          aria-live="polite"
          aria-busy="true"
          className="divide-y divide-slate-200 dark:divide-slate-800"
        >
          {[1, 2, 3, 4, 5].map((skeletonIdx) => (
            <div
              key={skeletonIdx}
              className="p-4 sm:px-5 sm:py-4 flex items-center justify-between gap-4 animate-pulse"
            >
              <div className="flex items-center gap-3.5 flex-1">
                <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="space-y-2 flex-1 max-w-md">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                <div className="h-10 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {tracks.map((track) => {
        const isCurrent = currentTrackId === track.id;
        const isTrackPlaying = isCurrent && isPlaying;
        const isSaved = savedIds.has(track.id);
        const formattedSize = formatFileSizeMB(track.sizeMB);

        return (
          <article
            key={track.id}
            className={`p-4 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
              isCurrent
                ? 'bg-teal-50/60 dark:bg-teal-950/25'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            {/* Right side (RTL): Artwork + Title + Unboxed Metadata */}
            <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
              <MediaArtwork
                coverType={track.coverType}
                externalCoverUrl={track.externalCoverUrl}
                alt={`غلاف ${track.title}`}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg"
              />

              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {track.title}
                </h3>

                <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {track.artist}
                  <span className="mx-1.5 text-slate-400 font-normal" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {track.album}
                  </span>
                </p>

                {/* Clean Unboxed Metadata Line (Zero static pills, tabular numerals, explicit LTR units) */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{CATEGORY_LABELS[track.category]}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      track.sourceKind === 'full-mp3'
                        ? 'text-teal-700 dark:text-teal-400 font-semibold'
                        : ''
                    }
                  >
                    {track.sourceLabel}
                  </span>
                  {track.durationSec > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr" className="font-mono-tabular inline-block">
                        {formatDuration(track.durationSec)}
                      </span>
                    </>
                  )}
                  {formattedSize && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr" className="font-mono-tabular inline-block">
                        {formattedSize}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Left side (RTL): Listen, Download, Add to Playlist, Save & Share Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onTogglePlay(track)}
                aria-label={
                  isTrackPlaying
                    ? `إيقاف مؤقت للمقطع ${track.title}`
                    : `استماع مباشر للمقطع ${track.title}`
                }
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-10 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  isTrackPlaying
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isTrackPlaying ? (
                  <>
                    <Pause className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>إيقاف مؤقت</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>استماع</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenDownload(track)}
                aria-label={`تحميل الملف الصوتي ${track.title}`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-10 text-xs sm:text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  تحميل <span dir="ltr" className="inline-block uppercase">{track.audioFormat}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onAddToPlaylist(track)}
                aria-label={`إضافة ${track.title} إلى قائمة تشغيل`}
                title="إضافة إلى قائمة تشغيل"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                <ListPlus className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">قائمة</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleSave(track)}
                aria-pressed={isSaved}
                title={isSaved ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
                aria-label={
                  isSaved
                    ? `إزالة ${track.title} من المفضلة`
                    : `حفظ ${track.title} في المفضلة`
                }
                className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  isSaved
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark
                  className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {onShareTrack && (
                <button
                  type="button"
                  onClick={() => onShareTrack(track)}
                  title="مشاركة الرابط المباشر"
                  aria-label={`مشاركة رابط ${track.title}`}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
