import {
  WorkspaceSignal,
  WorkspaceSuggestion,
} from './WorkspaceSuggestionTypes';
import {
  GENERIC_WORKSPACE_NAME,
  WORKSPACE_CATEGORIES,
} from './WorkspaceCategories';

type CategoryMatch = {
  category: string;
  name: string;
  matchedKeywords: string[];
};

/** 纯分类规则：输入数据库摘要，输出建议，不执行查询或改名。 */
export default class WorkspaceSuggestionRules {
  public static build(rows: WorkspaceSignal[]): WorkspaceSuggestion {
    const target = rows.find((row) => GENERIC_WORKSPACE_NAME.test(row.name));
    if (rows.length > 0 && !target) return this.noSuggestion();

    const category = this.findCategory((target?.content || '').toLowerCase());
    if (category) {
      return {
        shouldSuggest: true,
        category: category.category,
        name: category.name,
        reason: `根据近期内容中的“${category.matchedKeywords.slice(0, 2).join('、')}”等关键词生成。`,
        targetWorkspaceId: target?.id || null,
      };
    }

    return this.buildFallback(target);
  }

  private static findCategory(content: string): CategoryMatch | null {
    const matches = WORKSPACE_CATEGORIES.map((rule) => ({
      category: rule.category,
      name: rule.name,
      matchedKeywords: rule.keywords.filter((keyword) =>
        content.includes(keyword),
      ),
    })).sort(
      (left, right) =>
        right.matchedKeywords.length - left.matchedKeywords.length,
    );
    return matches[0]?.matchedKeywords.length ? matches[0] : null;
  }

  private static buildFallback(
    target: WorkspaceSignal | undefined,
  ): WorkspaceSuggestion {
    const month = new Intl.DateTimeFormat('zh-CN', { month: 'long' }).format(
      new Date(),
    );
    return {
      shouldSuggest: true,
      category: target?.note_count ? '待整理' : '工作记录',
      name: target?.note_count ? '近期内容整理' : `${month}工作记录`,
      reason: target
        ? '检测到使用通用名称的工作空间，建议改成更容易查找的名称。'
        : '尚未建立工作空间，先按当前月份建立一个通用入口。',
      targetWorkspaceId: target?.id || null,
    };
  }

  private static noSuggestion(): WorkspaceSuggestion {
    return {
      shouldSuggest: false,
      category: '',
      name: '',
      reason: '现有工作空间已经具有明确名称。',
      targetWorkspaceId: null,
    };
  }
}
