import { useState } from 'react';
import { ListMusic, Menu, X } from 'lucide-react';

export type ActiveAppView = 'search' | 'quran' | 'radio' | 'playlists';

interface HeaderProps {
  activeView: ActiveAppView;
  onNavigateSearch: () => void;
  onNavigateQuran: () => void;
  onNavigateRadio: () => void;
  onNavigatePlaylists: () => void;
  onResetCleanHome: () => void;
  playlistsCount: number;
  savedCount: number;
  onOpenLibrary: () => void;
}

export function Header({
  activeView,
  onNavigateSearch,
  onNavigateQuran,
  onNavigateRadio,
  onNavigatePlaylists,
  onResetCleanHome,
  playlistsCount,
  savedCount,
  onOpenLibrary,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    {
      id: 'home',
      label: 'البحث والأغاني',
      isActive: activeView === 'search',
      onClick: onNavigateSearch,
    },
    {
      id: 'quran',
      label: 'القرآن الكريم',
      isActive: activeView === 'quran',
      onClick: onNavigateQuran,
    },
    {
      id: 'radio',
      label: 'الإذاعات المباشرة',
      isActive: activeView === 'radio',
      onClick: onNavigateRadio,
    },
    {
      id: 'playlists',
      label: playlistsCount > 0 ? `قوائم التشغيل (${playlistsCount})` : 'قوائم التشغيل',
      isActive: activeView === 'playlists',
      onClick: onNavigatePlaylists,
    },
    {
      id: 'library',
      label: savedCount > 0 ? `مكتبتي وسجلي (${savedCount})` : 'مكتبتي وسجلي',
      isActive: false,
      onClick: onOpenLibrary,
    },
  ];

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onResetCleanHome();
          }}
          className="font-display text-xl sm:text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600 rounded"
        >
          سمعني · Sma3ny
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          {navLinks.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                item.onClick();
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600 ${
                item.isActive
                  ? 'text-teal-700 dark:text-teal-400 border-teal-600 dark:border-teal-400'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: 1 primary action (+ mobile menu trigger on small screens) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onNavigatePlaylists}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-10 text-xs sm:text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <ListMusic className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>قوائم التشغيل</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'إغلاق القائمة' : 'فتح قائمة الأقسام'}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          aria-label="قائمة الأقسام للجوال"
          className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 flex flex-wrap gap-2"
        >
          {navLinks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                item.onClick();
                setMobileMenuOpen(false);
              }}
              className={`px-3.5 py-2 min-h-11 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                item.isActive
                  ? 'bg-teal-700 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
