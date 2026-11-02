import { useState } from 'react';
import { X, Play, Trash2, Download, Bookmark, History, Clock } from 'lucide-react';
import {
  formatDuration,
  formatFileSizeMB,
  type DownloadRecord,
  type MediaTrack,
} from '../utils/mediaLogic';

interface SavedLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedTracks: MediaTrack[];
  recentlyPlayed: MediaTrack[];
  downloadHistory: DownloadRecord[];
  onPlayTrack: (track: MediaTrack) => void;
  onOpenDownload: (track: MediaTrack) => void;
  onRemoveSaved: (trackId: string) => void;
  onClearRecent: () => void;
  onClearHistory: () => void;
}

export function SavedLibraryModal({
  isOpen,
  onClose,
  savedTracks,
  recentlyPlayed,
  downloadHistory,
  onPlayTrack,
  onOpenDownload,
  onRemoveSaved,
  onClearRecent,
  onClearHistory,
}: SavedLibraryModalProps) {
  const [tab, setTab] = useState<'saved' | 'recent' | 'downloads'>('saved');

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-library-title"
      className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="saved-library-title"
            className="font-display text-lg font-bold text-slate-900 dark:text-white"
          >
            مكتبتي وسجل الاستماع والتنزيلات
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المكتبة المحفوظة"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('saved')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'saved'
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                المفضلة (<span className="font-mono-tabular">{savedTracks.length}</span>)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab('recent')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'recent'
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                استمعت مؤخراً (<span className="font-mono-tabular">{recentlyPlayed.length}</span>)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab('downloads')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'downloads'
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                التنزيلات (<span className="font-mono-tabular">{downloadHistory.length}</span>)
              </span>
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'saved' ? (
            savedTracks.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  لا توجد مقاطع محفوظة في مفضلتك حتى الآن
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  اضغط على أيقونة الحفظ بجانب أي أغنية أو سورة للرجوع إليها سريعاً في أي وقت.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {savedTracks.map((track) => (
                  <div
                    key={track.id}
                    className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {track.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {track.artist}
                        {track.durationSec > 0 && (
                          <>
                            {' · '}
                            <span dir="ltr" className="font-mono-tabular inline-block">
                              {formatDuration(track.durationSec)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onPlayTrack(track);
                          onClose();
                        }}
                        aria-label={`تشغيل ${track.title}`}
                        className="px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>استماع</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDownload(track);
                        }}
                        aria-label={`تحميل ${track.title}`}
                        className="px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>تحميل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveSaved(track.id)}
                        aria-label={`إزالة ${track.title} من المفضلة`}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'recent' ? (
            recentlyPlayed.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  سجل الاستماع الأخير فارغ حالياً
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  تُحفظ هنا تلقائياً آخر المقاطع والسور التي استمعت إليها للعودة إليها بنقرة واحدة.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    مسح سجل الاستماع الأخير
                  </button>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {recentlyPlayed.map((track) => (
                    <div
                      key={track.id}
                      className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {track.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {track.artist}
                          {track.durationSec > 0 && (
                            <>
                              {' · '}
                              <span dir="ltr" className="font-mono-tabular inline-block">
                                {formatDuration(track.durationSec)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onPlayTrack(track);
                            onClose();
                          }}
                          className="px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>استماع</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenDownload(track);
                          }}
                          className="px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>تحميل</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : downloadHistory.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                سجل التنزيلات فارغ حالياً
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                عند تنزيل أي أغنية أو سورة سيظهر سجلها هنا مباشرة.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  مسح سجل التنزيلات بالكامل
                </button>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {downloadHistory.map((item) => {
                  const sizeLabel = formatFileSizeMB(item.sizeMB);
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{item.artist}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span dir="ltr" className="font-mono-tabular inline-block">
                            {item.formatLabel}
                          </span>
                          {sizeLabel && (
                            <>
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span dir="ltr" className="font-mono-tabular inline-block">
                                {sizeLabel}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap">
                        مكتمل
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
