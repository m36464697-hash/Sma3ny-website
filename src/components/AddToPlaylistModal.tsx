import { useState } from 'react';
import { X, Plus, Check, ListMusic } from 'lucide-react';
import type { MediaTrack, UserPlaylist } from '../utils/mediaLogic';

interface AddToPlaylistModalProps {
  track: MediaTrack | null;
  playlists: UserPlaylist[];
  onClose: () => void;
  onToggleTrackInPlaylist: (playlistId: string, track: MediaTrack) => void;
  onCreatePlaylistWithTrack: (name: string, track: MediaTrack) => void;
}

export function AddToPlaylistModal({
  track,
  playlists,
  onClose,
  onToggleTrackInPlaylist,
  onCreatePlaylistWithTrack,
}: AddToPlaylistModalProps) {
  const [newPlaylistName, setNewPlaylistName] = useState('');

  if (!track) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newPlaylistName.trim();
    if (!cleaned) return;
    onCreatePlaylistWithTrack(cleaned, track);
    setNewPlaylistName('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-playlist-title"
      className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="add-to-playlist-title"
              className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white"
            >
              إضافة إلى قائمة تشغيل
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              {track.title} · {track.artist}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة قوائم التشغيل"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Quick Create New Playlist + Add Track */}
          <form onSubmit={handleCreateSubmit} className="space-y-2">
            <label
              htmlFor="quick-new-playlist-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              إنشاء قائمة تشغيل جديدة وإضافة المقطع فوراً
            </label>
            <div className="flex items-center gap-2">
              <input
                id="quick-new-playlist-input"
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="مثال: أغاني السفر، تلاوات هادئة..."
                className="flex-1 px-3 py-2 min-h-10 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-10 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>إنشاء وإضافة</span>
              </button>
            </div>
          </form>

          {/* Existing Playlists List */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              قوائم التشغيل الحالية (<span className="font-mono-tabular">{playlists.length}</span>)
            </p>

            {playlists.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                لا توجد قوائم تشغيل بعد — اكتب اسماً بالأعلى لإنشاء أول قائمة لك.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {playlists.map((pl) => {
                  const hasTrack = pl.tracks.some((t) => t.id === track.id);
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => onToggleTrackInPlaylist(pl.id, track)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ListMusic
                          className={`w-4 h-4 shrink-0 ${
                            hasTrack
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {pl.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono-tabular">{pl.tracks.length}</span> مقطع
                          </p>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                          hasTrack
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {hasTrack ? (
                          <>
                            <Check className="w-4 h-4" aria-hidden="true" />
                            <span>مضاف</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            <span>إضافة</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
