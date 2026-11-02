export interface QuickSearchSuggestion {
  label: string;
  query: string;
}

/**
 * Quick real-search query shortcuts displayed under the central Abdwap search bar.
 * Zero hardcoded/fake tracks — clicking any item executes a real live search.
 */
export const QUICK_SEARCH_SUGGESTIONS: QuickSearchSuggestion[] = [
  { label: 'عمرو دياب', query: 'عمرو دياب' },
  { label: 'أم كلثوم', query: 'أم كلثوم' },
  { label: 'عبد الحليم حافظ', query: 'عبد الحليم حافظ' },
  { label: 'فيروز', query: 'فيروز' },
  { label: 'محمد عبده', query: 'محمد عبده' },
  { label: 'شيرين عبد الوهاب', query: 'شيرين' },
  { label: 'تامر حسني', query: 'تامر حسني' },
  { label: 'سورة الكهف العفاسي', query: 'سورة الكهف مشاري العفاسي' },
];
