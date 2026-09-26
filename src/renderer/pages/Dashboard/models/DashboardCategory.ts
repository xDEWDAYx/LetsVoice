/**
 * 笔记类型分类以语言无关的 key 存在于界面逻辑中，显示文案交给 i18n，
 * 避免筛选行为随界面语言（简体 / 繁体 / 英文）漂移。
 *
 * key 与主模型侧 NoteCategoryPrompt 里的分类集合必须保持一致：
 * 分类结果是由模型产出、以 key 落库的，两边对不上就会全部掉进 uncategorized。
 */
export type DashboardCategoryKey =
  | 'meeting'
  | 'personal'
  | 'idea'
  | 'learning'
  | 'general'
  | 'uncategorized';

export const DASHBOARD_CATEGORY_FILTERS: Array<DashboardCategoryKey | 'all'> = [
  'all',
  'meeting',
  'personal',
  'idea',
  'learning',
  'general',
  'uncategorized',
];

const CATEGORY_KEYS = new Set<string>([
  'meeting',
  'personal',
  'idea',
  'learning',
  'general',
  'uncategorized',
]);

/**
 * 旧数据里分类是中文字面量（还分简繁），且旧分类集合更偏会议场景。
 * 这里把它们并到新 key 上，历史笔记不必重新分类也能正常筛选。
 */
const RAW_CATEGORY_TO_KEY: Record<string, DashboardCategoryKey> = {
  需求评审: 'meeting',
  需求評審: 'meeting',
  项目讨论: 'meeting',
  項目討論: 'meeting',
  会议记录: 'meeting',
  會議記錄: 'meeting',
  头脑风暴: 'idea',
  頭腦風暴: 'idea',
  一般笔记: 'general',
  一般筆記: 'general',
  未分类: 'uncategorized',
  未分類: 'uncategorized',
};

export class DashboardCategory {
  public static resolveKey(rawCategory: string): DashboardCategoryKey {
    const raw = (rawCategory ?? '').trim();
    if (CATEGORY_KEYS.has(raw)) return raw as DashboardCategoryKey;
    return RAW_CATEGORY_TO_KEY[raw] ?? 'uncategorized';
  }

  public static translationKey(category: DashboardCategoryKey | 'all'): string {
    return `dashboard.category.${category}`;
  }
}
