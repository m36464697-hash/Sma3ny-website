import { useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Shuffle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  FileDown,
  Edit3,
  Check,
  ArrowRight,
  Search,
} from 'lucide-react';
import {
  computePlaylistTotalDuration,
  formatDuration,
  normalizeArabicText,
  sanitizeImportedPlaylists,
  type MediaTrack,
  type UserPlaylist,
} from '../utils/mediaLogic';
import { MediaArtwork } from './MediaArtwork';

interface PlaylistsViewProps {
  playlists: UserPlaylist[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onCreatePlaylist: (name: string, description?: string) => string;
  onRenamePlaylist: (playlistId: string, newName: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onReorderPlaylistTrack: (playlistId: string, fromIdx: number, toIdx: number) => void;
  onImportPlaylists: (imported: UserPlaylist[]) => void;
  onPlayPlaylistQueue: (playlist: UserPlaylist, startIndex: number, shuffle: boolean) => void;
  onOpenDownload: (track: MediaTrack) => void;
  onBackToSearch: () => void;
}

export function PlaylistsView({
  playlists,
  currentTrackId,
  isPlaying,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onReorderPlaylistTrack,
  onImportPlaylists,
  onPlayPlaylistQueue,
  onOpenDownload,
  onBackToSearch,
}: PlaylistsViewProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    () => playlists[0]?.id || ''
  );
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null,
    [playlists, selectedPlaylistId]
  );

  const filteredPlaylistTracks = useMemo(() => {
    if (!activePlaylist) return [];
    const q = normalizeArabicText(trackFilter);
    if (!q) return activePlaylist.tracks.map((track, originalIdx) => ({ track, originalIdx }));
    return activePlaylist.tracks
      .map((track, originalIdx) => ({ track, originalIdx }))
      .filter(({ track }) =>
        normalizeArabicText(`${track.title} ${track.artist}`).includes(q)
      );
  }, [activePlaylist, trackFilter]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const createdId = onCreatePlaylist(trimmed, newDesc.trim());
    setSelectedPlaylistId(createdId);
    setNewName('');
    setNewDesc('');
  };

  const handleExportJson = () => {
    const json = JSON.stringify(playlists, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sma3ny-playlists.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const valid = sanitizeImportedPlaylists(parsed);
      if (valid.length === 0) {
        setImportFeedback('الملف المختار لا يحتوي على قوائم تشغيل صالحة.');
        return;
      }
      onImportPlaylists(valid);
      setSelectedPlaylistId(valid[0].id);
      setImportFeedback(`تم استيراد ${valid.length} قائمة تشغيل بنجاح.`);
    } catch {
      setImportFeedback('تعذر قراءة ملف قوائم التشغيل. تأكد أنه بصيغة JSON صحيحة.');
    }
  };

  return (
    <section aria-labelledby="playlists-heading" className="space-y-6">
      {/* Header & Creation Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="playlists-heading"
              className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            >
              قوائم التشغيل الخاصة بك (<span className="font-mono-tabular">{playlists.length}</span>)
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              رتّب أغانيك الكاملة وسورك المفضلة في قوائم متواصلة مع دعم التشغيل التلقائي والعشوائي والنسخ الاحتياطي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playlists.length > 0 && (
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <FileDown className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <span>تصدير قوائمي</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>استيراد قوائم</span>
            </button>

            <button
              type="button"
              onClick={onBackToSearch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
              <span>العودة للبحث</span>
            </button>
          </div>
        </div>

        {importFeedback && (
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
            {importFeedback}
          </p>
        )}

        {/* Create New Playlist Form */}
        <form
          onSubmit={handleCreate}
          className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="playlist-name-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              اسم القائمة الجديدة
            </label>
            <input
              id="playlist-name-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="مثال: روائع الطرب، سور السكينة..."
              className="w-full px-3.5 py-2.5 min-h-10 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="sm:col-span-5">
            <label
              htmlFor="playlist-desc-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              وصف مختصر (اختياري)
            </label>
            <input
              id="playlist-desc-input"
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="مثال: أغانٍ مختارة للقيادة أو المذاكرة"
              className="w-full px-3.5 py-2.5 min-h-10 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!newName.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-10 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>إنشاء قائمة</span>
            </button>
          </div>
        </form>
      </div>

      {/* Main 2-Column Workspace */}
      {playlists.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            لا توجد قوائم تشغيل محفوظة حالياً
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            أنشئ قائمة جديدة من النموذج بالأعلى، أو اضغط على زر «قائمة» بجانب أي أغنية أو سورة لإضافتها فوراً.
          </p>
          <button
            type="button"
            onClick={onBackToSearch}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 min-h-11 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <span>ابحث عن أغانٍ وسور لإضافتها</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sidebar: Playlist Selector */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
            {playlists.map((pl) => {
              const isSelected = activePlaylist?.id === pl.id;
              const totalDur = computePlaylistTotalDuration(pl);
              return (
                <div
                  key={pl.id}
                  className={`p-4 flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-teal-50/70 dark:bg-teal-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className="min-w-0 flex-1 text-right cursor-pointer"
                  >
                    <p
                      className={`font-display text-sm sm:text-base font-bold truncate ${
                        isSelected
                          ? 'text-teal-800 dark:text-teal-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {pl.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono-tabular">{pl.tracks.length}</span> مقطع
                      {totalDur > 0 && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span dir="ltr" className="font-mono-tabular inline-block">
                            {formatDuration(totalDur)}
                          </span>
                        </>
                      )}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeletePlaylist(pl.id)}
                    aria-label={`حذف القائمة ${pl.name}`}
                    title="حذف القائمة"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Active Playlist Detail & Tracks */}
          {activePlaylist && (
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {editingId === activePlaylist.id ? (
                      <div className="flex items-center gap-2 max-w-sm">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-sm font-bold bg-slate-50 dark:bg-slate-950 border border-teal-600 rounded-lg text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editingTitle.trim()) {
                              onRenamePlaylist(activePlaylist.id, editingTitle.trim());
                            }
                            setEditingId(null);
                          }}
                          aria-label="حفظ اسم القائمة"
                          className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center cursor-pointer"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                          {activePlaylist.name}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(activePlaylist.id);
                            setEditingTitle(activePlaylist.name);
                          }}
                          aria-label="تعديل اسم القائمة"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    {activePlaylist.description && (
                      <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        {activePlaylist.description}
                      </p>
                    )}
                  </div>

                  {/* Play All & Shuffle Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={activePlaylist.tracks.length === 0}
                      onClick={() => onPlayPlaylistQueue(activePlaylist, 0, false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-10 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>تشغيل القائمة بالكامل</span>
                    </button>

                    <button
                      type="button"
                      disabled={activePlaylist.tracks.length < 2}
                      onClick={() => onPlayPlaylistQueue(activePlaylist, 0, true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4" aria-hidden="true" />
                      <span>تشغيل عشوائي</span>
                    </button>
                  </div>
                </div>

                {activePlaylist.tracks.length > 3 && (
                  <div className="relative flex items-center max-w-xs">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={trackFilter}
                      onChange={(e) => setTrackFilter(e.target.value)}
                      placeholder="تصفية المقاطع داخل القائمة..."
                      className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
                    />
                  </div>
                )}
              </div>

              {activePlaylist.tracks.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    هذه القائمة فارغة حالياً
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    اذهب للبحث أو القرآن الكريم واضغط على زر «قائمة» بجانب أي مقطع لإضافته هنا.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredPlaylistTracks.map(({ track, originalIdx }) => {
                    const isCurrent = currentTrackId === track.id;
                    const isTrackPlaying = isCurrent && isPlaying;
                    return (
                      <div
                        key={`${track.id}-${originalIdx}`}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isCurrent
                            ? 'bg-teal-50/60 dark:bg-teal-950/25'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono-tabular text-xs text-slate-400 w-5 text-center shrink-0">
                            {originalIdx + 1}
                          </span>

                          <MediaArtwork
                            coverType={track.coverType}
                            externalCoverUrl={track.externalCoverUrl}
                            alt={track.title}
                            className="w-11 h-11 rounded-lg"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                              {track.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {track.artist}
                              {track.durationSec > 0 && (
                                <>
                                  <span className="mx-1.5" aria-hidden="true">·</span>
                                  <span dir="ltr" className="font-mono-tabular inline-block">
                                    {formatDuration(track.durationSec)}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onPlayPlaylistQueue(activePlaylist, originalIdx, false)
                            }
                            aria-label={`تشغيل ${track.title}`}
                            className={`px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer ${
                              isTrackPlaying
                                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {isTrackPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>يعمل</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>تشغيل</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenDownload(track)}
                            aria-label={`تحميل ${track.title}`}
                            className="w-9 h-9 rounded-lg flex items-center justify-center bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {!trackFilter && (
                            <>
                              <button
                                type="button"
                                disabled={originalIdx === 0}
                                onClick={() =>
                                  onReorderPlaylistTrack(
                                    activePlaylist.id,
                                    originalIdx,
                                    originalIdx - 1
                                  )
                                }
                                aria-label="تحريك لأعلى"
                                className="w-8 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={originalIdx === activePlaylist.tracks.length - 1}
                                onClick={() =>
                                  onReorderPlaylistTrack(
                                    activePlaylist.id,
                                    originalIdx,
                                    originalIdx + 1
                                  )
                                }
                                aria-label="تحريك لأسفل"
                                className="w-8 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              onRemoveTrackFromPlaylist(activePlaylist.id, track.id)
                            }
                            aria-label={`إزالة ${track.title} من القائمة`}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
