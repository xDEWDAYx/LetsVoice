import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { NoteRepository } from '../database/repositories/NoteRepository';
import { TodoRepository } from '../database/repositories/TodoRepository';
import LocalChatService from '../llm/LocalChatService';
import OllamaEmbeddingService from '../semantic/OllamaEmbeddingService';
import { rankBySimilarity } from '../semantic/EmbeddingMath';
import {
  buildDateReference,
  normalizeDueDate,
  toLocalDateString,
} from './DateContext';
import {
  rewriteRelativeDates,
  soleAnnotatedDate,
} from './RelativeDateRewriter';
import {
  annotateCompletedClauses,
  isEntirelyCompleted,
} from './CompletionDetector';
import { expandOccurrences, normalizeRepeat } from './RecurrenceExpander';
import {
  allowsOwnershipDrops,
  buildOwnershipPrompt,
  isSuspiciousVerdictSet,
  parseOwnershipVerdicts,
} from './TodoOwnershipFilter';
import { buildExtractionPrompt } from './TodoExtractionPrompt';
import { NoteClassificationService } from './NoteClassificationService';

export class TodoExtractionService {
  private noteRepository: NoteRepository;

  private todoRepository: TodoRepository;

  private chatService: LocalChatService;

  private embeddingService: OllamaEmbeddingService;

  private classificationService: NoteClassificationService;

  constructor() {
    this.noteRepository = new NoteRepository();
    this.todoRepository = new TodoRepository();
    this.chatService = new LocalChatService();
    this.embeddingService = new OllamaEmbeddingService();
    this.classificationService = new NoteClassificationService();
  }

  private static chunkText(text: string, size = 500, overlap = 100): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + size));
      i += size - overlap;
    }
    return chunks;
  }

  /** debug 日志里单条敏感内容的最大长度，避免整段转录被写进磁盘。 */
  private static readonly SENSITIVE_PREVIEW_LIMIT = 2000;

  private static isDebugMode(): boolean {
    return process.env.SPEAKSPACE_DEBUG_AI_LOGS === 'true';
  }

  /**
   * 日志落点。默认写 userData，可用 SPEAKSPACE_LOG_DIR 改到别处 ——
   * 排查问题时方便把日志导到指定目录，测试里也不必依赖 Electron。
   */
  private static logFilePath(): string {
    const dir = process.env.SPEAKSPACE_LOG_DIR || app.getPath('userData');
    return path.join(dir, 'speakspace_extraction.log');
  }

  /**
   * 提取流程的统一日志出口。
   *
   * 默认只写非敏感元信息（note id、长度、失败原因分类）；
   * 笔记原文、模型输出这类私人内容必须传 debugOnly=true，
   * 只有显式打开 SPEAKSPACE_DEBUG_AI_LOGS 时才会落盘。
   */
  private static log(msg: string, debugOnly: boolean = false): void {
    if (debugOnly && !TodoExtractionService.isDebugMode()) return;
    try {
      fs.appendFileSync(TodoExtractionService.logFilePath(), msg);
    } catch {
      // 日志写不进去不该影响提取本身
    }
  }

  /**
   * 把可能含私人信息的文本包装成带截断和显式提示的 debug 片段。
   * 只应传给 log(..., true)，不得进 console。
   */
  private static sensitivePreview(text: string): string {
    const limit = TodoExtractionService.SENSITIVE_PREVIEW_LIMIT;
    const clipped = text.slice(0, limit);
    const omitted = text.length > limit ? text.length - limit : 0;
    const suffix = omitted > 0 ? `\n...[truncated ${omitted} chars]` : '';
    return `[SENSITIVE — debug only]\n${clipped}${suffix}`;
  }

  /**
   * 异常对象的可公开摘要。
   *
   * JSON.parse 的报错信息会带上出错位置附近的原始片段，
   * 所以默认只暴露错误类型名，完整 message 留给 debug 日志。
   */
  private static errorKind(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }

  private static errorDetail(error: unknown): string {
    return error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  }

  /**
   * 复核候选：只保留「需要我做、且还没做完」的。
   *
   * 三条保险，方向都偏向「宁可多留」：
   *  - 复核本身报错 → 原样返回，不能因为多跑一步反而丢事情
   *  - 判定解析不出来 → 该条保留
   *  - 整批都被判丢 → 视为模型塌缩，整批保留并记日志
   * 少一条用户自己划掉就行，多删一条是真丢东西。
   */
  private async filterByOwnership<T extends { title: string }>(
    transcript: string,
    items: T[],
    log: (msg: string, debugOnly?: boolean) => void,
  ): Promise<T[]> {
    if (items.length === 0) return items;

    // 没有「这块我不管」这类明确甩手的说法就不复核：模型单独判归属
    // 误删率太高（实测一半），而且这样绝大多数笔记省掉一次模型调用。
    if (!allowsOwnershipDrops(transcript)) return items;

    const titles = items.map((item) => item.title.trim());
    try {
      const prompt = buildOwnershipPrompt(transcript, titles);
      const response = await this.chatService.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0 },
      );
      const raw = response.content.trim();
      log(`Ownership verdicts:\n${raw}\n`, true);

      const verdicts = parseOwnershipVerdicts(raw, items.length);
      if (isSuspiciousVerdictSet(verdicts)) {
        log(
          `Ownership pass called all ${items.length} candidates OTHER_PERSON; ` +
            `treating as model collapse and keeping all.\n`,
        );
        return items;
      }

      // 只有被采信的分类才真删；其余分类照样记下来，方便日后评估。
      verdicts.forEach((verdict) => {
        if (verdict.drop) {
          log(`Dropped "${titles[verdict.index]}" as ${verdict.reason}.\n`);
        } else if (verdict.reason !== 'MINE' && verdict.reason !== 'UNPARSED') {
          log(
            `Kept "${titles[verdict.index]}" despite ${verdict.reason} ` +
              `(该分类误判率高，暂不据此删除).\n`,
          );
        }
      });
      return items.filter((_, index) => !verdicts[index].drop);
    } catch (error) {
      // 复核只是加分项，挂了就退回抽取结果，不能让它把整条链路带垮。
      log(
        `Ownership pass failed (${TodoExtractionService.errorKind(error)}); ` +
          `keeping all ${items.length} candidates.\n`,
      );
      return items;
    }
  }

  public async extractTodosForNote(noteId: number): Promise<boolean> {
    try {
      const note = this.noteRepository.findById(noteId);
      if (!note) {
        console.error(`Note ${noteId} not found for extraction.`);
        return false;
      }

      const rawTranscript = note.getTranscript();
      if (!rawTranscript || rawTranscript.trim().length === 0) {
        console.warn(`Note ${noteId} has no transcript.`);
        return false;
      }

      // 顺手把笔记类型也认出来。放在提取之前是因为下面有好几个提前
      // return（整段已完成、模型没吐出 JSON），放后面这些笔记就永远没分类。
      // 分类失败只是留空，不影响待办提取。
      await this.classificationService.classifyNote(noteId);

      // 整次提取共用同一个「现在」，避免跨零点时 prompt 和落库的日期不一致。
      const now = new Date();
      const today = toLocalDateString(now);
      const dateReference = buildDateReference(now);

      // 先用规则把「周五」「下周一」就地标注成具体日期，再标出已完成的句子，
      // 最后才交给模型。只改送进模型的这份副本，落库的转写原文不动。
      const transcript = annotateCompletedClauses(
        rewriteRelativeDates(rawTranscript, now),
      );
      let contextText = transcript;
      const log = (msg: string, debugOnly = false) =>
        TodoExtractionService.log(msg, debugOnly);
      const sensitive = (text: string) =>
        TodoExtractionService.sensitivePreview(text);

      log(
        `\n\n[${new Date().toISOString()}] Starting extraction for note ${noteId} (length: ${rawTranscript.length}, annotated: ${transcript.length})\n`,
      );

      // 整段都是「已经做完」的事：不必问模型，也不该产生任何待办。
      // 否则这些句子会被抽成待办，又因为没有日期回落到今天，
      // 上周就结束的事情反而出现在今天的日历上。
      if (isEntirelyCompleted(rawTranscript)) {
        log(`All clauses are already completed. No todos for this note.\n`);
        this.todoRepository.deleteTodosByNoteId(noteId);
        return true;
      }

      // Apply RAG if transcript is long
      if (transcript.length > 1500) {
        log(`Applying RAG for long transcript...\n`);
        try {
          const status = await this.embeddingService.getStatus();
          if (status.installed) {
            const chunks = TodoExtractionService.chunkText(
              transcript,
              500,
              100,
            );
            const query =
              'action items, tasks, to-dos, assignments, deadlines, reminders, 待办事项, 任务, 行动项';
            const [queryVector] = await this.embeddingService.embedMany([
              query,
            ]);

            const chunkVectors = await this.embeddingService.embedMany(chunks);
            const items = chunks.map((text, idx) => ({
              text,
              embedding: chunkVectors[idx],
            }));

            const topChunks = rankBySimilarity(queryVector, items, 5, 0.1);
            if (topChunks.length > 0) {
              contextText = topChunks.map((c) => c.text).join('\n...\n');
              log(
                `RAG selected ${topChunks.length} chunks. Reduced context to ${contextText.length} chars.\n`,
              );
            }
          } else {
            log(
              `Embedding model not installed. Falling back to full transcript.\n`,
            );
          }
        } catch (err) {
          log(
            `RAG failed (${TodoExtractionService.errorKind(
              err,
            )}). Falling back to full transcript.\n`,
          );
          log(
            `RAG error detail: ${TodoExtractionService.errorDetail(err)}\n`,
            true,
          );
        }
      }

      const prompt = buildExtractionPrompt(contextText, dateReference);
      if (transcript.length <= 1500) {
        log(`Context: ${sensitive(contextText)}\n`, true);
      }
      log(`Date reference:\n${dateReference}\n`, true);

      const response = await this.chatService.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1 },
      );
      let content = response.content.trim();

      log(`LLM Response:\n${sensitive(content)}\n`, true);

      // If the LLM returned a single object without array brackets, wrap it
      if (content.startsWith('{') && content.endsWith('}')) {
        content = `[${content}]`;
        log(`Wrapped single object in array: ${sensitive(content)}\n`, true);
      }

      // Robustly extract JSON array using Regex in case LLM added conversational filler
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        [content] = match;
        log(`Regex matched JSON: ${sensitive(content)}\n`, true);
      } else {
        // 模型没按要求返回 JSON 时，它的输出往往是在复述笔记原文，
        // 因此 console 只留长度等元信息，正文走 debug 日志。
        console.warn(
          `No JSON array found in LLM output for note ${noteId} (output length: ${content.length}).`,
        );
        log(`Failed to match JSON array. Aborting.\n`);
        log(`Unmatched LLM output: ${sensitive(content)}\n`, true);
        return false;
      }

      let extractedItems: Array<{
        title: string;
        dueDate: string | null;
        repeat?: string | null;
      }> = [];
      try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          console.warn(
            `LLM output for note ${noteId} parsed but is not a JSON array (output length: ${content.length}).`,
          );
          log(`Output is not a JSON array. Aborting.\n`);
          log(`Non-array LLM output: ${sensitive(content)}\n`, true);
          return false;
        }
        extractedItems = parsed;
        log(`Parsed ${extractedItems.length} items successfully.\n`);
      } catch (e) {
        const kind = TodoExtractionService.errorKind(e);
        console.error(
          `Failed to parse LLM output as JSON for note ${noteId} (output length: ${content.length}, error: ${kind}).`,
        );
        log(`JSON Parse Error (${kind}).\n`);
        log(
          `Parse error detail: ${TodoExtractionService.errorDetail(e)}\n`,
          true,
        );
        log(`Unparsed LLM output: ${sensitive(content)}\n`, true);
        return false;
      }

      // 第二步：只问「要不要我干、干完没有」，把别人的活和已完成的事筛掉。
      // 抽取那一步同时管五件事，小模型顾不过来，筛选交给一个窄问题更稳。
      const survivors = await this.filterByOwnership(
        transcript,
        extractedItems,
        log,
      );

      // Clear old ones first
      this.todoRepository.deleteTodosByNoteId(noteId);

      // 同一件事被反复提到时，小模型经常原样输出好几遍。
      // 标题+日期完全相同的必然是重复，写库前先去掉。
      const seen = new Set<string>();

      // 模型会看到「周五」就自己脑补出 weekly，把一次性任务铺成几十条。
      // 重复只认标注过的：文本里没出现 REPEAT=xxx，就不允许有这个周期。
      const groundedRepeats = new Set(
        [...transcript.matchAll(/REPEAT=([a-z]+)/gi)].map((entry) =>
          entry[1].toLowerCase(),
        ),
      );

      // 模型偶尔漏抄标注里的日期，返回 null。这时不该一律算今天：
      // 整段话只指向一个日期时，那就是唯一合理的归属。
      const soleDate = soleAnnotatedDate(transcript);

      // 逐条写库并带条件过滤，普通循环比链式调用更直观。
      // eslint-disable-next-line no-restricted-syntax
      for (const item of survivors) {
        if (
          item &&
          typeof item.title === 'string' &&
          item.title.trim().length > 0
        ) {
          const title = item.title.trim();
          // 模型仍可能给出 2026-13-45 这类不存在的日期，或把项目编号
          // 当成日期，落库前统一校验。
          // 兜底顺序：全文只标注了一个日期就用它，否则才回落到今天。
          const fallback = soleDate ?? today;
          const dueDate = normalizeDueDate(item.dueDate, fallback);
          if (item.dueDate && dueDate !== item.dueDate) {
            log(`Rejected unusable dueDate for "${title}" -> ${dueDate}.\n`);
          } else if (!item.dueDate) {
            // 之前这里一声不吭地记成今天，日历上凭空多一个点却查不到原因。
            const why = soleDate ? 'sole annotated date' : 'today';
            log(
              `No dueDate from model for "${title}"; used ${dueDate} (${why}).\n`,
            );
          }

          const fingerprint = `${title.toLocaleLowerCase()}@${dueDate}`;
          if (seen.has(fingerprint)) {
            log(`Skipped duplicate todo: ${title}\n`);
            // eslint-disable-next-line no-continue
            continue;
          }
          seen.add(fingerprint);

          // 重复待办由代码展开成逐次发生，模型只负责给出起点和周期。
          let repeat = normalizeRepeat(item.repeat);
          if (repeat && !groundedRepeats.has(repeat)) {
            log(`Dropped ungrounded repeat "${repeat}" for "${title}".\n`);
            repeat = null;
          }
          const dates = expandOccurrences(dueDate, repeat);
          if (repeat) {
            log(
              `Expanded "${title}" (${repeat}) into ${dates.length} occurrences from ${dueDate}.\n`,
            );
          }

          dates.forEach((dateString) => {
            this.todoRepository.createTodo({
              noteId,
              title,
              dateString,
              isCompleted: false,
            });
          });
          log(`Saved todo: ${title} (${dates.length} date(s))\n`, true);
        }
      }

      return true;
    } catch (error) {
      // 上游（Ollama、嵌入服务）的报错信息里可能回显 prompt，
      // 而 prompt 内含笔记原文，所以默认只暴露错误类型。
      const kind = TodoExtractionService.errorKind(error);
      console.error(
        `Error extracting todos for note ${noteId} (error: ${kind}).`,
      );
      TodoExtractionService.log(`Fatal Error (${kind}).\n`);
      TodoExtractionService.log(
        `Fatal error detail: ${TodoExtractionService.sensitivePreview(
          TodoExtractionService.errorDetail(error),
        )}\n`,
        true,
      );
      return false;
    }
  }
}
