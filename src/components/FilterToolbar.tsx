import {
  CATEGORY_LABELS,
  type MediaCategory,
  type SortOption,
} from '../utils/mediaLogic';

interface FilterToolbarProps {
  activeCategory: MediaCategory;
  onSelectCategory: (category: MediaCategory) => void;
  sortBy: SortOption;
  onChangeSort: (sort: SortOption) => void;
  categoryCounts: Record<MediaCategory, number>;
  resultCount: number;
  activeQuery: string;
}

const CATEGORIES_ORDER: MediaCategory[] = [
  'all',
  'music',
  'archive',
  'quran',
  'nasheed',
];

export function FilterToolbar({
  activeCategory,
  onSelectCategory,
  sortBy,
  onChangeSort,
  categoryCounts,
  resultCount,
  activeQuery,
}: FilterToolbarProps) {
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="تصفية نتائج البحث حسب القسم"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {CATEGORIES_ORDER.map((cat) => {
          const isActive = activeCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-10 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                isActive
                  ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{CATEGORY_LABELS[cat]}</span>
              <span
                className={`font-mono-tabular text-xs ${
                  isActive ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-sm text-slate-700 dark:text-slate-300">
          <span>
            نتائج البحث عن{' '}
            <strong className="text-slate-900 dark:text-white">"{activeQuery}"</strong>
            <span className="mx-1.5 text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular font-semibold">{resultCount}</span> مقطع صوتي حقيقي
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="sma3ny-sort-select"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap"
          >
            ترتيب النتائج:
          </label>
          <select
            id="sma3ny-sort-select"
            value={sortBy}
            onChange={(e) => onChangeSort(e.target.value as SortOption)}
            className="pr-3.5 pl-8 py-2 min-h-10 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-teal-600 dark:focus:border-teal-400 cursor-pointer"
          >
            <option value="relevance">الأدق تطابقاً مع البحث</option>
            <option value="full_first">المقاطع الكاملة (MP3) أولاً</option>
            <option value="longest">الأطول مدة</option>
            <option value="shortest">الأقصر مدة</option>
          </select>
        </div>
      </div>
    </div>
  );
}
