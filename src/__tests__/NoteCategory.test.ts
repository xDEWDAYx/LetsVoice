import {
  buildCategoryPrompt,
  CATEGORY_INPUT_LIMIT,
  parseCategory,
} from '../main/dashboard/NoteCategoryPrompt';
import { DashboardCategory } from '../renderer/pages/Dashboard/models/DashboardCategory';

describe('parseCategory', () => {
  it('接受模型只吐一个词的理想输出', () => {
    expect(parseCategory('personal')).toBe('personal');
    expect(parseCategory('MEETING\n')).toBe('meeting');
  });

  it('容忍模型加的前后缀', () => {
    expect(parseCategory('Category: meeting.')).toBe('meeting');
    expect(parseCategory('"idea"')).toBe('idea');
  });

  it('输出里出现多个分类词时不猜，交回未分类', () => {
    expect(parseCategory('meeting | personal | idea')).toBeNull();
    expect(parseCategory('could be meeting or personal')).toBeNull();
  });

  it('完全不着边的输出返回 null', () => {
    expect(parseCategory('我不知道')).toBeNull();
    expect(parseCategory('')).toBeNull();
  });
});

describe('buildCategoryPrompt', () => {
  it('长转录只送开头一段，避免拖慢一次纯分类的调用', () => {
    const prompt = buildCategoryPrompt('甲'.repeat(CATEGORY_INPUT_LIMIT + 500));
    expect(prompt).toContain('甲'.repeat(CATEGORY_INPUT_LIMIT));
    expect(prompt).not.toContain('甲'.repeat(CATEGORY_INPUT_LIMIT + 1));
  });
});

describe('DashboardCategory.resolveKey', () => {
  it('直接认模型落库的 key', () => {
    expect(DashboardCategory.resolveKey('meeting')).toBe('meeting');
    expect(DashboardCategory.resolveKey(' learning ')).toBe('learning');
  });

  it('旧数据里的中文分类并到新 key，简繁都认', () => {
    expect(DashboardCategory.resolveKey('需求评审')).toBe('meeting');
    expect(DashboardCategory.resolveKey('項目討論')).toBe('meeting');
    expect(DashboardCategory.resolveKey('头脑风暴')).toBe('idea');
  });

  it('空值和不认识的值都退回未分类', () => {
    expect(DashboardCategory.resolveKey('')).toBe('uncategorized');
    expect(DashboardCategory.resolveKey('随便什么')).toBe('uncategorized');
  });
});
