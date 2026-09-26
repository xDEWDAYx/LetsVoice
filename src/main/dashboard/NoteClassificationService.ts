import { NoteRepository } from '../database/repositories/NoteRepository';
import LocalChatService from '../llm/LocalChatService';
import {
  buildCategoryPrompt,
  NoteCategoryKey,
  parseCategory,
  UNCATEGORIZED,
} from './NoteCategoryPrompt';

type ChatLike = Pick<LocalChatService, 'chat'>;

type Dependencies = {
  noteRepository?: NoteRepository;
  chatService?: ChatLike;
};

/**
 * 给笔记打类型。
 *
 * 走的是和待办提取同一个本地模型，但刻意分成独立的一次调用：
 * 让小模型在一次回答里既抽日期又判类型，两边的准确率都会掉。
 * 分类失败不算错误——列表退回「未分类」照常显示，下次还能补。
 */
export class NoteClassificationService {
  private readonly noteRepository: NoteRepository;

  private readonly chatService: ChatLike;

  public constructor(dependencies: Dependencies = {}) {
    this.noteRepository = dependencies.noteRepository ?? new NoteRepository();
    this.chatService = dependencies.chatService ?? new LocalChatService();
  }

  /** 识别单条笔记并落库，返回最终写入的分类；失败返回 null 且不写库。 */
  public async classifyNote(noteId: number): Promise<NoteCategoryKey | null> {
    const note = this.noteRepository.findById(noteId);
    if (!note) return null;

    const transcript = note.getTranscript();
    if (!transcript || transcript.trim().length === 0) return null;

    const category = await this.classifyTranscript(transcript);
    if (!category) {
      console.warn(`Could not classify note ${noteId}; left uncategorized.`);
      return null;
    }

    this.noteRepository.updateTypeCategory(noteId, category);
    return category;
  }

  /** 纯识别，不碰数据库；评测脚本和单元测试用同一条路径。 */
  public async classifyTranscript(
    transcript: string,
  ): Promise<NoteCategoryKey | null> {
    try {
      const response = await this.chatService.chat(
        [{ role: 'user', content: buildCategoryPrompt(transcript) }],
        // 分类要的是稳定复现，同一段话每次都该给同一个答案。
        { temperature: 0 },
      );
      return parseCategory(response.content);
    } catch (error) {
      // 模型没起来时不该把调用方带垮：分类只是列表上的一个标签。
      const kind = error instanceof Error ? error.name : typeof error;
      console.warn(`Note classification failed (${kind}).`);
      return null;
    }
  }

  /**
   * 给历史笔记补分类。
   *
   * 逐条串行跑：本地模型同时并发几十条只会互相抢显存，反而更慢，
   * 而且这是后台任务，慢一点没人等它。返回实际写进去的条数。
   */
  public async classifyPendingNotes(limit: number = 200): Promise<number> {
    const ids = this.noteRepository.findIdsWithoutCategory(limit);
    let done = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const category = await this.classifyNote(id);
      if (category) done += 1;
    }

    return done;
  }
}

export { UNCATEGORIZED };
export default NoteClassificationService;
