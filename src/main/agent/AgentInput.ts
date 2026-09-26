import { AgentHistoryMessage, AgentRunRequest } from './AgentTypes';

const MAX_INSTRUCTION_CHARACTERS = 4000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARACTERS = 4000;
/** 挂上的笔记会作为本轮正文上下文载入，过多会挤占模型上下文。 */
const MAX_LINKED_NOTES = 8;

function normalizeWorkspaceId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('无效的工作空间 ID / Invalid workspace ID');
  }
  return id;
}

/** 非法 ID 直接丢掉而不是报错：挂错一条笔记不该让整次提问失败。 */
function normalizeLinkedNoteIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_LINKED_NOTES);
}

function normalizeHistory(value: unknown): AgentHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AgentHistoryMessage =>
        item !== null &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string',
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_HISTORY_CHARACTERS),
    }))
    .filter((item) => item.content.length > 0);
}

/** IPC 输入进入 Agent 前先限制长度、角色和工作空间范围。 */
export default function normalizeAgentRequest(
  value: unknown,
): Required<AgentRunRequest> {
  const request =
    value !== null && typeof value === 'object'
      ? (value as Partial<AgentRunRequest>)
      : {};
  const instruction = String(request.instruction || '').trim();
  if (!instruction) {
    throw new Error('请输入任务内容 / Agent instruction is required');
  }
  // workspaceId 为空且没有关联笔记时表示不限定工作区。
  const workspaceId = normalizeWorkspaceId(request.workspaceId);
  return {
    instruction: instruction.slice(0, MAX_INSTRUCTION_CHARACTERS),
    workspaceId,
    linkedNoteIds: normalizeLinkedNoteIds(request.linkedNoteIds),
    history: normalizeHistory(request.history),
  };
}
