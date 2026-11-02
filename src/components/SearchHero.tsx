import { Search, X, BookOpen, ListMusic, Radio, Moon, Sun } from 'lucide-react';
import { QUICK_SEARCH_SUGGESTIONS } from '../data/catalog';

interface SearchHeroProps {
  searchInput: string;
  onSearchInputChange: (val: string) => void;
  onSubmitSearch: (queryOverride?: string) => void;
  onClearSearch: () => void;
  isSearching: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenQuranBrowser: () => void;
  onOpenLiveRadio: () => void;
  onOpenPlaylists: () => void;
  playlistsCount: number;
  isCleanIdleHome: boolean;
}

export function SearchHero({
  searchInput,
  onSearchInputChange,
  onSubmitSearch,
  onClearSearch,
  isSearching,
  darkMode,
  onToggleDarkMode,
  onOpenQuranBrowser,
  onOpenLiveRadio,
  onOpenPlaylists,
  playlistsCount,
  isCleanIdleHome,
}: SearchHeroProps) {
  return (
    <section
      aria-labelledby="hero-heading"
      className={`bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors ${
        isCleanIdleHome ? 'py-10 sm:py-16' : 'py-5 sm:py-9'
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h1
          id="hero-heading"
          className="font-display text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight [text-wrap:balance] max-w-2xl mx-auto leading-snug"
        >
          سمعني Sma3ny — محرك البحث والاستماع والتحميل الصوتي الكامل
        </h1>

        <p className="mt-2.5 text-xs sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
          استمع وحمّل الأغاني الكاملة مع كلماتها المتزامنة، تصفح المصحف المرتل (114 سورة)، واستمع للإذاعات المباشرة مع موازن الصوت الاحترافي.
        </p>

        {/* Central Sma3ny Search Box */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitSearch();
          }}
          className="mt-5 sm:mt-7 max-w-2xl mx-auto"
        >
          <label htmlFor="sma3ny-search-input" className="sr-only">
            ابحث عن اسم الأغنية، المطرب، أو السورة
          </label>
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-700 focus-within:border-teal-600 dark:focus-within:border-teal-400 rounded-xl p-1.5 transition-colors">
            <div className="pr-3 pl-2 text-slate-400 dark:text-slate-500 shrink-0">
              <Search className="w-5 h-5" aria-hidden="true" />
            </div>

            <input
              id="sma3ny-search-input"
              type="search"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder="اكتب اسم الأغنية، المطرب، الألبوم، أو السورة..."
              className="w-full bg-transparent py-2.5 px-2 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />

            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={onClearSearch}
                aria-label="مسح نص البحث"
                className="p-2 min-w-10 min-h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 min-h-11 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-70 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              {isSearching ? 'جاري البحث...' : 'بحث الآن'}
            </button>
          </div>
        </form>

        {/* Quick Real-Search Shortcuts */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">بحث سريع:</span>
          {QUICK_SEARCH_SUGGESTIONS.map((item) => {
            const isSelected = searchInput.trim() === item.query;
            return (
              <button
                key={item.query}
                type="button"
                onClick={() => {
                  onSearchInputChange(item.query);
                  onSubmitSearch(item.query);
                }}
                className={`px-3 py-1.5 min-h-9 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  isSelected
                    ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Workspace Secondary Bar */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-center sm:justify-between gap-2.5 max-w-2xl mx-auto text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onOpenQuranBrowser}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>
                المصحف الكامل (<span className="font-mono-tabular">114</span> سورة)
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenLiveRadio}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Radio className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>الإذاعات المباشرة 24/7</span>
            </button>

            <button
              type="button"
              onClick={onOpenPlaylists}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ListMusic className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>
                قوائمي (<span className="font-mono-tabular">{playlistsCount}</span>)
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {darkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>الوضع النهاري</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span>الوضع الليلي</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
