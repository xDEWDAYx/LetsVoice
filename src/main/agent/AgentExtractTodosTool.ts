import type { TodoData } from '../database/repositories/TodoRepository';
import { AgentNoteSource, isAgentNoteInScope } from './AgentNoteToolSupport';
import { throwIfAgentAborted } from './AgentRunSupport';
import { AgentTool } from './AgentTypes';

const MAX_RETURNED_TODOS = 20;

/** 与仪表盘用的同一套提取逻辑，这里只按结构约束，方便注入替身做测试。 */
export type TodoExtractor = {
  extractTodosForNote(noteId: number): Promise<boolean>;
};

export type TodoSource = {
  getTodosByNoteId(noteId: number): TodoData[];
};

/**
 * 让 Agent 复用仪表盘那套待办提取：对某条笔记跑一次抽取并写库，
 * 再把结果读回来告诉模型，保证回答里的待办与日历里看到的一致。
 */
export default function createAgentExtractTodosTool(
  notes: AgentNoteSource,
  extractor: TodoExtractor,
  todos: TodoSource,
): AgentTool {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'extract_todos',
        description:
          "Extract action items from one user-linked note, or a real note id from search_notes when no notes were linked, and save them to the user's to-do list.",
        parameters: {
          type: 'object',
          required: ['note_id'],
          properties: {
            note_id: { type: 'integer', description: 'Saved note id.' },
          },
        },
      },
    },
    run: async (args, context, signal) => {
      const noteId = Number(args.note_id);
      if (!Number.isInteger(noteId) || noteId <= 0) {
        throw new Error('无效的笔记 ID / Invalid note id');
      }
      const note = notes.findById(noteId);
      if (!note || !isAgentNoteInScope(note, context)) {
        throw new Error('当前笔记范围中找不到该笔记 / Note not found');
      }

      // 提取会调用本地模型并覆盖写待办表，是本工具唯一的副作用。
      // 用户已经取消（关页面 / 切路由）时不能再启动一次。
      throwIfAgentAborted(signal);
      const extracted = await extractor.extractTodosForNote(noteId);
      throwIfAgentAborted(signal);
      // 提取失败通常是本地模型没返回可解析的 JSON；此时库里仍是上一次的结果。
      const saved = todos.getTodosByNoteId(noteId).slice(0, MAX_RETURNED_TODOS);

      return JSON.stringify({
        noteId,
        noteName: note.getName() || `Note ${noteId}`,
        extracted,
        todos: saved.map((todo) => ({
          title: todo.title,
          dueDate: todo.dateString,
          completed: todo.isCompleted,
        })),
        ...(extracted
          ? {}
          : { hint: 'Extraction failed; listing previously saved to-dos.' }),
      });
    },
  };
}
