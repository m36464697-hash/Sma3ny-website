import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createPlaylistObject,
  cycleRepeatMode,
  filterAndSortTracks,
  getNextQueueIndex,
  reorderPlaylistTrack,
  sanitizeImportedPlaylists,
  toggleTrackInPlaylist,
  upgradeLegacyPreviewTrack,
  type DownloadRecord,
  type MediaCategory,
  type MediaTrack,
  type RepeatMode,
  type SortOption,
  type UserPlaylist,
} from './utils/mediaLogic';
import { Header, type ActiveAppView } from './components/Header';
import { SearchHero } from './components/SearchHero';
import { FilterToolbar } from './components/FilterToolbar';
import { TrackList } from './components/TrackList';
import { QuranBrowser } from './components/QuranBrowser';
import { LiveRadioView } from './components/LiveRadioView';
import { PlaylistsView } from './components/PlaylistsView';
import { AudioVideoPlayer } from './components/AudioVideoPlayer';
import { DownloadModal } from './components/DownloadModal';
import { SavedLibraryModal } from './components/SavedLibraryModal';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';

const STORAGE_KEYS = {
  SAVED_TRACKS: 'sma3ny_saved_tracks_v1',
  LEGACY_SAVED_TRACKS: 'abdwap_real_saved_tracks_v2',
  RECENT_TRACKS: 'sma3ny_recent_tracks_v1',
  PLAYLISTS: 'sma3ny_playlists_v1',
  DOWNLOADS: 'sma3ny_downloads_v1',
  LEGACY_DOWNLOADS: 'abdwap_real_downloads_v2',
  REPEAT_MODE: 'sma3ny_repeat_mode_v1',
  SHUFFLE: 'sma3ny_shuffle_v1',
  THEME: 'sma3ny_dark_mode_v1',
  LEGACY_THEME: 'abdwap_dark_mode_v1',
};

export default function App() {
  // Theme state synced with <html class="dark">
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const val =
        localStorage.getItem(STORAGE_KEYS.THEME) ??
        localStorage.getItem(STORAGE_KEYS.LEGACY_THEME);
      return val === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, darkMode ? '1' : '0');
    } catch {
      // ignore storage quota errors
    }
  }, [darkMode]);

  // Primary navigation view: 'search' | 'quran' | 'radio' | 'playlists'
  const [activeView, setActiveView] = useState<ActiveAppView>('search');

  // Search state (clean search-first home until user searches)
  const [searchInput, setSearchInput] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Category & sort filters for search results
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');

  // Live resolved durations
  const [resolvedDurations, setResolvedDurations] = useState<Record<string, number>>({});
  const [quranVisibleTracks, setQuranVisibleTracks] = useState<MediaTrack[]>([]);

  // Custom playback queue (when playing from PlaylistsView or LiveRadioView)
  const [customQueue, setCustomQueue] = useState<MediaTrack[] | null>(null);

  // Repeat & Shuffle modes
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REPEAT_MODE);
      if (saved === 'one' || saved === 'all' || saved === 'off') return saved;
    } catch {
      // ignore
    }
    return 'all';
  });

  const [shuffle, setShuffle] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SHUFFLE) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.REPEAT_MODE, repeatMode);
    } catch {
      // ignore
    }
  }, [repeatMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SHUFFLE, shuffle ? '1' : '0');
    } catch {
      // ignore
    }
  }, [shuffle]);

  // Persisted Playlists
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      if (raw) {
        return sanitizeImportedPlaylists(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    } catch {
      // ignore
    }
  }, [playlists]);

  // Persisted Saved Tracks
  const [savedTracks, setSavedTracks] = useState<MediaTrack[]>(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEYS.SAVED_TRACKS) ??
        localStorage.getItem(STORAGE_KEYS.LEGACY_SAVED_TRACKS);
      if (raw) {
        const parsed = JSON.parse(raw) as MediaTrack[];
        if (Array.isArray(parsed)) {
          return parsed
            .filter((t) => Boolean(t && t.audioUrl))
            .map((t) => upgradeLegacyPreviewTrack(t));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Persisted Recently Played Tracks (max 30)
  const [recentlyPlayed, setRecentlyPlayed] = useState<MediaTrack[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RECENT_TRACKS);
      if (raw) {
        const parsed = JSON.parse(raw) as MediaTrack[];
        if (Array.isArray(parsed)) {
          return parsed
            .filter((t) => Boolean(t && t.audioUrl))
            .map((t) => upgradeLegacyPreviewTrack(t))
            .slice(0, 30);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEYS.DOWNLOADS) ??
        localStorage.getItem(STORAGE_KEYS.LEGACY_DOWNLOADS);
      if (raw) {
        const parsed = JSON.parse(raw) as DownloadRecord[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_TRACKS, JSON.stringify(savedTracks));
    } catch {
      // ignore
    }
  }, [savedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT_TRACKS, JSON.stringify(recentlyPlayed));
    } catch {
      // ignore
    }
  }, [recentlyPlayed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(downloadHistory));
    } catch {
      // ignore
    }
  }, [downloadHistory]);

  const savedIds = useMemo(() => new Set(savedTracks.map((t) => t.id)), [savedTracks]);

  // Active audio player state
  const [currentTrack, setCurrentTrack] = useState<MediaTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sleep Timer state
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [sleepEndOfTrack, setSleepEndOfTrack] = useState<boolean>(false);

  // Modals & Toast Feedback state
  const [downloadTargetTrack, setDownloadTargetTrack] = useState<MediaTrack | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<MediaTrack | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Record recently played whenever a new track starts playing
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((t) => t.id !== currentTrack.id);
      return [currentTrack, ...filtered].slice(0, 30);
    });
  }, [currentTrack?.id, isPlaying]);

  // Sleep Timer 1-second countdown
  useEffect(() => {
    if (sleepRemainingSec === null) return;
    if (sleepRemainingSec <= 0) {
      setSleepRemainingSec(null);
      setIsPlaying(false);
      showToast('انتهى مؤقت النوم وتم إيقاف التشغيل تلقائياً');
      return;
    }
    const id = window.setInterval(() => {
      setSleepRemainingSec((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearInterval(id);
  }, [sleepRemainingSec, showToast]);

  const handleSelectSleepTimer = useCallback(
    (choice: number | 'track_end' | null) => {
      if (choice === null) {
        setSleepRemainingSec(null);
        setSleepEndOfTrack(false);
        return;
      }
      if (choice === 'track_end') {
        setSleepRemainingSec(null);
        setSleepEndOfTrack(true);
        showToast('سيتوقف التشغيل تلقائياً فور انتهاء المقطع الحالي');
        return;
      }
      setSleepEndOfTrack(false);
      setSleepRemainingSec(choice * 60);
      showToast(`تم ضبط مؤقت النوم على ${choice} دقيقة`);
    },
    [showToast]
  );

  const searchAbortRef = useRef<AbortController | null>(null);

  const executeRealSearch = useCallback(async (queryToRun: string) => {
    const trimmed = queryToRun.trim();
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    if (trimmed.length < 2) {
      setHasSearched(false);
      setCommittedQuery('');
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setActiveView('search');
    setHasSearched(true);
    setCommittedQuery(trimmed);
    setIsSearching(true);
    setSearchError(null);

    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error('Search request failed');
      }
      const data = (await res.json()) as { items?: MediaTrack[] };
      if (!controller.signal.aborted) {
        setSearchResults(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      if (!controller.signal.aborted) {
        setSearchError('تعذر الاتصال بمحرك البحث الصوتي حالياً، يرجى إعادة المحاولة.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  // Initialize from URL query parameters (?q=... or ?view=quran|radio|playlists)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const initialQ = params.get('q');
      const initialView = params.get('view');
      if (initialQ && initialQ.trim().length >= 2) {
        setSearchInput(initialQ.trim());
        void executeRealSearch(initialQ.trim());
      } else if (initialView === 'quran') {
        setActiveView('quran');
      } else if (initialView === 'radio') {
        setActiveView('radio');
      } else if (initialView === 'playlists') {
        setActiveView('playlists');
      }
    } catch {
      // ignore URL parsing errors
    }
  }, [executeRealSearch]);

  const handleResetCleanHome = useCallback(() => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    setActiveView('search');
    setSearchInput('');
    setCommittedQuery('');
    setHasSearched(false);
    setSearchResults([]);
    setSearchError(null);
    setIsSearching(false);
    setActiveCategory('all');
    setSortBy('relevance');
  }, []);

  const handleDurationResolved = useCallback((trackId: string, durationSec: number) => {
    if (!durationSec || durationSec <= 0) return;
    setResolvedDurations((prev) => {
      if (prev[trackId] === durationSec) return prev;
      return { ...prev, [trackId]: durationSec };
    });
    setCurrentTrack((prev) =>
      prev && prev.id === trackId && prev.durationSec !== durationSec
        ? { ...prev, durationSec }
        : prev
    );
    setPlaylists((prev) =>
      prev.map((pl) => {
        const needsUpdate = pl.tracks.some((t) => t.id === trackId && t.durationSec !== durationSec);
        if (!needsUpdate) return pl;
        return {
          ...pl,
          tracks: pl.tracks.map((t) => (t.id === trackId ? { ...t, durationSec } : t)),
        };
      })
    );
  }, []);

  // Compute category counts for current real search results
  const categoryCounts = useMemo(() => {
    const counts: Record<MediaCategory, number> = {
      all: searchResults.length,
      music: 0,
      archive: 0,
      quran: 0,
      nasheed: 0,
    };
    for (const item of searchResults) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [searchResults]);

  const enrichedSearchResults = useMemo(
    () =>
      searchResults.map((t) =>
        resolvedDurations[t.id] ? { ...t, durationSec: resolvedDurations[t.id] } : t
      ),
    [searchResults, resolvedDurations]
  );

  const visibleSearchTracks = useMemo(
    () =>
      filterAndSortTracks(enrichedSearchResults, {
        category: activeCategory,
        sortBy,
      }),
    [enrichedSearchResults, activeCategory, sortBy]
  );

  // Active playback queue
  const activeQueue = useMemo(() => {
    if (customQueue && customQueue.length > 0) return customQueue;
    if (activeView === 'quran') return quranVisibleTracks;
    return visibleSearchTracks;
  }, [customQueue, activeView, quranVisibleTracks, visibleSearchTracks]);

  const handleTogglePlay = useCallback(
    (track: MediaTrack) => {
      setCustomQueue(null);
      if (currentTrack?.id === track.id) {
        setIsPlaying((prev) => !prev);
        return;
      }
      setCurrentTrack(track);
      setIsPlaying(true);
    },
    [currentTrack?.id]
  );

  const handlePlayRadioStation = useCallback(
    (stationTrack: MediaTrack, stationQueue: MediaTrack[]) => {
      if (currentTrack?.id === stationTrack.id) {
        setIsPlaying((prev) => !prev);
        return;
      }
      setCustomQueue(stationQueue);
      setCurrentTrack(stationTrack);
      setIsPlaying(true);
    },
    [currentTrack?.id]
  );

  const advanceInQueue = useCallback(
    (isAutoEnded: boolean) => {
      if (!currentTrack || activeQueue.length === 0) {
        if (isAutoEnded) setIsPlaying(false);
        return;
      }
      const currentIdx = activeQueue.findIndex((t) => t.id === currentTrack.id);
      const nextIdx = getNextQueueIndex({
        queueLength: activeQueue.length,
        currentIndex: currentIdx >= 0 ? currentIdx : 0,
        repeatMode,
        shuffle,
        isAutoEnded,
      });

      if (nextIdx === null) {
        setIsPlaying(false);
        return;
      }
      const nextTrack = activeQueue[nextIdx];
      if (nextTrack) {
        setCurrentTrack(nextTrack);
        setIsPlaying(true);
      }
    },
    [currentTrack, activeQueue, repeatMode, shuffle]
  );

  const handleNextTrack = useCallback(() => {
    advanceInQueue(false);
  }, [advanceInQueue]);

  const handleTrackNaturalEnd = useCallback(() => {
    advanceInQueue(true);
  }, [advanceInQueue]);

  const handlePrevTrack = useCallback(() => {
    if (!currentTrack || activeQueue.length === 0) return;
    const idx = activeQueue.findIndex((t) => t.id === currentTrack.id);
    const prevIdx = idx <= 0 ? activeQueue.length - 1 : idx - 1;
    if (activeQueue[prevIdx]) {
      setCurrentTrack(activeQueue[prevIdx]);
      setIsPlaying(true);
    }
  }, [currentTrack, activeQueue]);

  const handleCycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const next = cycleRepeatMode(prev);
      if (next === 'one') showToast('تم تفعيل تكرار المقطع الحالي تلقائياً');
      else if (next === 'all') showToast('تم تفعيل تكرار قائمة التشغيل');
      else showToast('تم إيقاف التكرار التلقائي');
      return next;
    });
  }, [showToast]);

  // Global keyboard shortcuts (Space = Play/Pause, R = Cycle Repeat)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase() || '';
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.code === 'Space' && currentTrack) {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (
        (e.key === 'r' || e.key === 'R') &&
        !e.metaKey &&
        !e.ctrlKey &&
        currentTrack &&
        !currentTrack.isLiveStream
      ) {
        e.preventDefault();
        handleCycleRepeatMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTrack, handleCycleRepeatMode]);

  // Playlist CRUD Handlers
  const handleCreatePlaylist = useCallback(
    (name: string, description?: string): string => {
      const created = createPlaylistObject(name, description);
      setPlaylists((prev) => [created, ...prev]);
      showToast(`تم إنشاء قائمة "${created.name}"`);
      return created.id;
    },
    [showToast]
  );

  const handleCreatePlaylistWithTrack = useCallback(
    (name: string, track: MediaTrack) => {
      const base = createPlaylistObject(name);
      const { updated } = toggleTrackInPlaylist(base, track);
      setPlaylists((prev) => [updated, ...prev]);
      showToast(`تم إنشاء قائمة "${updated.name}" وإضافة المقطع إليها`);
    },
    [showToast]
  );

  const handleToggleTrackInPlaylist = useCallback(
    (playlistId: string, track: MediaTrack) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          const { updated, added } = toggleTrackInPlaylist(pl, track);
          showToast(
            added
              ? `تمت الإضافة إلى قائمة "${pl.name}"`
              : `تمت الإزالة من قائمة "${pl.name}"`
          );
          return updated;
        })
      );
    },
    [showToast]
  );

  const handleRenamePlaylist = useCallback((playlistId: string, newName: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, name: newName.trim() || pl.name, updatedAtIso: new Date().toISOString() }
          : pl
      )
    );
  }, []);

  const handleDeletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
      showToast('تم حذف قائمة التشغيل');
    },
    [showToast]
  );

  const handleRemoveTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              updatedAtIso: new Date().toISOString(),
              tracks: pl.tracks.filter((t) => t.id !== trackId),
            }
          : pl
      )
    );
  }, []);

  const handleReorderPlaylistTrack = useCallback(
    (playlistId: string, fromIdx: number, toIdx: number) => {
      setPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? reorderPlaylistTrack(pl, fromIdx, toIdx) : pl))
      );
    },
    []
  );

  const handleImportPlaylists = useCallback(
    (imported: UserPlaylist[]) => {
      if (imported.length === 0) return;
      setPlaylists((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const deduplicated = imported.map((p) =>
          existingIds.has(p.id)
            ? { ...p, id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
            : p
        );
        return [...deduplicated, ...prev];
      });
      showToast(`تم استيراد ${imported.length} قائمة تشغيل بنجاح`);
    },
    [showToast]
  );

  const handlePlayPlaylistQueue = useCallback(
    (playlist: UserPlaylist, startIndex: number, useShuffle: boolean) => {
      if (playlist.tracks.length === 0) return;
      const safeIdx = Math.max(0, Math.min(startIndex, playlist.tracks.length - 1));
      const chosenIdx =
        useShuffle && playlist.tracks.length > 1
          ? Math.floor(Math.random() * playlist.tracks.length)
          : safeIdx;
      const targetTrack = playlist.tracks[chosenIdx];

      if (
        !useShuffle &&
        currentTrack?.id === targetTrack.id &&
        customQueue &&
        customQueue.length === playlist.tracks.length
      ) {
        setIsPlaying((p) => !p);
        return;
      }

      setShuffle(useShuffle);
      setCustomQueue(playlist.tracks);
      setCurrentTrack(targetTrack);
      setIsPlaying(true);
    },
    [currentTrack?.id, customQueue]
  );

  // Share Track deep-link
  const handleShareTrack = useCallback(
    async (track: MediaTrack) => {
      const shareQuery =
        track.category === 'quran'
          ? `${track.title} ${track.artist}`
          : `${track.artist} ${track.title}`;
      const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(shareQuery.trim())}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: `${track.title} - Sma3ny سمعني`,
            text: `استمع إلى ${track.title} - ${track.artist} عبر موقع سمعني Sma3ny`,
            url: shareUrl,
          });
          return;
        } catch {
          // fallback to clipboard
        }
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('تم نسخ رابط مشاركة المقطع إلى الحافظة');
      } catch {
        showToast('رابط المشاركة جاهز في شريط العنوان');
      }
    },
    [showToast]
  );

  const handleToggleSaveTrack = (track: MediaTrack) => {
    setSavedTracks((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      if (exists) {
        showToast('تمت الإزالة من المفضلة');
        return prev.filter((t) => t.id !== track.id);
      }
      showToast('تم حفظ المقطع في مفضلتك');
      return [track, ...prev];
    });
  };

  const handleRemoveSavedById = (trackId: string) => {
    setSavedTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleRecordDownload = (track: MediaTrack, formatLabel: string, sizeMB?: number) => {
    const record: DownloadRecord = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      formatLabel,
      sizeMB,
      audioUrl: track.audioUrl,
      timestampIso: new Date().toISOString(),
    };
    setDownloadHistory((prev) => [record, ...prev.slice(0, 49)]);
  };

  const isCleanIdleHome = activeView === 'search' && !hasSearched;
  const libraryBadgeCount = savedTracks.length + downloadHistory.length;

  return (
    <div id="top" className={`min-h-screen flex flex-col ${currentTrack ? 'pb-24' : ''}`}>
      <Header
        activeView={activeView}
        onNavigateSearch={() => setActiveView('search')}
        onNavigateQuran={() => setActiveView('quran')}
        onNavigateRadio={() => setActiveView('radio')}
        onNavigatePlaylists={() => setActiveView('playlists')}
        onResetCleanHome={handleResetCleanHome}
        playlistsCount={playlists.length}
        savedCount={libraryBadgeCount}
        onOpenLibrary={() => setLibraryOpen(true)}
      />

      {/* Non-intrusive Status Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold shadow-lg border border-slate-700 dark:border-slate-300 whitespace-nowrap"
        >
          {toastMessage}
        </div>
      )}

      {/* Search Hero is always ready at the top in search view */}
      {activeView === 'search' && (
        <SearchHero
          searchInput={searchInput}
          onSearchInputChange={(val) => {
            setSearchInput(val);
            if (!val.trim()) {
              handleResetCleanHome();
            }
          }}
          onSubmitSearch={(override) => {
            const q = typeof override === 'string' ? override : searchInput;
            void executeRealSearch(q);
          }}
          onClearSearch={handleResetCleanHome}
          isSearching={isSearching}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOpenQuranBrowser={() => setActiveView('quran')}
          onOpenLiveRadio={() => setActiveView('radio')}
          onOpenPlaylists={() => setActiveView('playlists')}
          playlistsCount={playlists.length}
          isCleanIdleHome={isCleanIdleHome}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {activeView === 'playlists' ? (
          <PlaylistsView
            playlists={playlists}
            currentTrackId={currentTrack?.id ?? null}
            isPlaying={isPlaying}
            onCreatePlaylist={handleCreatePlaylist}
            onRenamePlaylist={handleRenamePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            onReorderPlaylistTrack={handleReorderPlaylistTrack}
            onImportPlaylists={handleImportPlaylists}
            onPlayPlaylistQueue={handlePlayPlaylistQueue}
            onOpenDownload={(track) => setDownloadTargetTrack(track)}
            onBackToSearch={() => setActiveView('search')}
          />
        ) : activeView === 'radio' ? (
          <LiveRadioView
            currentTrackId={currentTrack?.id ?? null}
            isPlaying={isPlaying}
            onPlayStation={handlePlayRadioStation}
            onBackToSearch={() => setActiveView('search')}
          />
        ) : activeView === 'quran' ? (
          <QuranBrowser
            currentTrackId={currentTrack?.id ?? null}
            isPlaying={isPlaying}
            savedIds={savedIds}
            resolvedDurations={resolvedDurations}
            onVisibleTracksChange={setQuranVisibleTracks}
            onTogglePlay={handleTogglePlay}
            onOpenDownload={(track) => setDownloadTargetTrack(track)}
            onToggleSave={handleToggleSaveTrack}
            onAddToPlaylist={(track) => setPlaylistModalTrack(track)}
            onShareTrack={(track) => void handleShareTrack(track)}
            onBackToSearch={() => setActiveView('search')}
          />
        ) : hasSearched ? (
          <div className="space-y-5">
            <FilterToolbar
              activeCategory={activeCategory}
              onSelectCategory={(cat) => setActiveCategory(cat)}
              sortBy={sortBy}
              onChangeSort={(s) => setSortBy(s)}
              categoryCounts={categoryCounts}
              resultCount={visibleSearchTracks.length}
              activeQuery={committedQuery}
            />

            <TrackList
              tracks={visibleSearchTracks}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={isPlaying}
              savedIds={savedIds}
              isLoading={isSearching}
              errorMessage={searchError}
              onRetry={() => void executeRealSearch(committedQuery)}
              onTogglePlay={handleTogglePlay}
              onOpenDownload={(track) => setDownloadTargetTrack(track)}
              onToggleSave={handleToggleSaveTrack}
              onAddToPlaylist={(track) => setPlaylistModalTrack(track)}
              onShareTrack={(track) => void handleShareTrack(track)}
              onResetFilters={() => {
                if (activeCategory !== 'all') {
                  setActiveCategory('all');
                } else {
                  handleResetCleanHome();
                }
              }}
            />
          </div>
        ) : (
          /* Clean Search-First Idle Guidance */
          <section
            aria-labelledby="clean-home-guide"
            className="max-w-4xl mx-auto pt-2 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2
                id="clean-home-guide"
                className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white"
              >
                01. الأغاني الكاملة وكلماتها المتزامنة
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                استمع لجميع الأغاني بمدتها الأصلية الكاملة مع عرض الكلمات المتزامنة لحظياً، وموازن صوت احترافي بتضخيم الباس (Bass Boost).
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                02. المصحف المرتل ونص الآيات العثماني
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                جميع السور الـ 114 بأصوات كبار القراء مع عرض نص المصحف العثماني المتزامن والضغط على أي آية للانتقال إليها مباشرة.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                03. إذاعات البث المباشر 24/7 والتنزيل
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                استمع على مدار الساعة لإذاعة القرآن الكريم من القاهرة ومكة وإذاعات أم كلثوم وفيروز وعمرو دياب، أو نزّل المقاطع بصيغة MP3.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-slate-800 dark:text-slate-200">
              سمعني · Sma3ny
            </span>
            <span aria-hidden="true">·</span>
            <span>بوابة البحث والاستماع والإذاعات المباشرة والتحميل الصوتي الكامل</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href="#search"
              onClick={(e) => {
                e.preventDefault();
                handleResetCleanHome();
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              البحث الرئيسي
            </a>
            <a
              href="#radio"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('radio');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              الإذاعات المباشرة 24/7
            </a>
            <a
              href="#quran"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('quran');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              القرآن الكريم (114 سورة)
            </a>
            <a
              href="#playlists"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('playlists');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              قوائم التشغيل
            </a>
            <a
              href="#library"
              onClick={(e) => {
                e.preventDefault();
                setLibraryOpen(true);
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              مكتبتي وسجلي
            </a>
          </div>
        </div>
      </footer>

      {/* Real-Stream Sticky Audio Player */}
      <AudioVideoPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        repeatMode={repeatMode}
        shuffle={shuffle}
        sleepRemainingSec={sleepRemainingSec}
        sleepEndOfTrack={sleepEndOfTrack}
        onPlayStateChange={setIsPlaying}
        onCycleRepeatMode={handleCycleRepeatMode}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onSelectSleepTimer={handleSelectSleepTimer}
        onDurationResolved={handleDurationResolved}
        onTrackNaturalEnd={handleTrackNaturalEnd}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onAddToPlaylist={(track) => setPlaylistModalTrack(track)}
        onClosePlayer={() => {
          setIsPlaying(false);
          setCurrentTrack(null);
        }}
        onOpenDownload={(track) => setDownloadTargetTrack(track)}
      />

      {/* Add Track to Playlist Modal */}
      <AddToPlaylistModal
        track={playlistModalTrack}
        playlists={playlists}
        onClose={() => setPlaylistModalTrack(null)}
        onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
        onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
      />

      {/* Genuine File Download & Real Audio Ringtone Cutter Modal */}
      <DownloadModal
        track={downloadTargetTrack}
        onClose={() => setDownloadTargetTrack(null)}
        onRecordDownload={handleRecordDownload}
      />

      {/* Persisted Favorites, Recently Played & Download History Modal */}
      <SavedLibraryModal
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        savedTracks={savedTracks}
        recentlyPlayed={recentlyPlayed}
        downloadHistory={downloadHistory}
        onPlayTrack={(track) => {
          setCustomQueue(null);
          setCurrentTrack(track);
          setIsPlaying(true);
        }}
        onOpenDownload={(track) => setDownloadTargetTrack(track)}
        onRemoveSaved={handleRemoveSavedById}
        onClearRecent={() => setRecentlyPlayed([])}
        onClearHistory={() => setDownloadHistory([])}
      />
    </div>
  );
}
