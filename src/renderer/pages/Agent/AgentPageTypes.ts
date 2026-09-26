import type { AgentHistoryMessage, AgentStep } from '@shared/types/AgentTypes';

export type AgentPageMessage = AgentHistoryMessage & { id: string };
export type AgentPageStep = { id: string; step: AgentStep };

export type AgentPageState = {
  history: AgentPageMessage[];
  steps: AgentPageStep[];
  running: boolean;
  error: string;
  status: string;
};

export const EMPTY_AGENT_PAGE_STATE: AgentPageState = {
  history: [],
  steps: [],
  running: false,
  error: '',
  status: '选择工作空间后，可以让助理查找和读取本地笔记。',
};
