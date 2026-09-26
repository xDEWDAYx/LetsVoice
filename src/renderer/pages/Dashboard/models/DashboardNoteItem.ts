import { Note } from '@shared/entities/Note';
import { DashboardCategory, DashboardCategoryKey } from './DashboardCategory';
import { matchesAllTerms, splitSearchTerms } from './NoteSearch';
import { DashboardTimeUtil, RelativeUpdatedTime } from './DashboardTimeUtil';

export class DashboardNoteItem extends Note {
  private typeCategory: string;

  private durationSeconds: number;

  public constructor(
    id: number,
    workspaceId: number | null,
    name: string | null,
    audioRelativePath: string | null,
    transcript: string,
    pinned: boolean,
    pinnedAt: Date | null,
    createdAt: Date,
    updatedAt: Date,
    typeCategory: string = '',
    durationSeconds: number = 3600,
  ) {
    super(
      id,
      workspaceId,
      name,
      audioRelativePath,
      transcript,
      pinned,
      pinnedAt,
      createdAt,
      updatedAt,
    );
    this.typeCategory = typeCategory;
    this.durationSeconds = durationSeconds;
  }

  public getTypeCategory(): string {
    return this.typeCategory;
  }

  /** 语言无关的分类 key，用于筛选与文案渲染。 */
  public getCategoryKey(): DashboardCategoryKey {
    return DashboardCategory.resolveKey(this.typeCategory);
  }

  public getDurationSeconds(): number {
    return this.durationSeconds;
  }

  public getFormattedDuration(): string {
    return DashboardTimeUtil.formatDuration(this.durationSeconds);
  }

  public getFormattedCreatedDate(): string {
    return DashboardTimeUtil.formatDateTime(this.getCreatedAt());
  }

  public getUpdatedTimeDescriptor(): RelativeUpdatedTime {
    return DashboardTimeUtil.describeRelativeUpdatedTime(this.getUpdatedAt());
  }

  /**
   * categoryLabel 传入当前界面语言下的分类文案，让搜索匹配用户实际看到的文字。
   */
  public matchesSearch(
    query: string,
    categoryLabel: string = this.typeCategory,
  ): boolean {
    const terms = splitSearchTerms(query);
    if (terms.length === 0) return true;

    // 每个词都要命中，但可以分别落在标题、正文或类型上：
    // 「银行 执照」这种查法，两个词往往一个在标题一个在正文。
    const haystack = [
      this.getName() ?? '',
      this.getTranscript() ?? '',
      categoryLabel,
    ].join(' ');
    return matchesAllTerms(haystack, terms);
  }
}
