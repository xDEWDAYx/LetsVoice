export type TrashItemType = 'note' | 'workspace' | 'conversation' | 'template';

export type TrashFilter = 'all' | TrashItemType;

export type TrashActionTarget = {
  itemType: TrashItemType;
  id: number;
};

export type TrashListQuery = {
  search?: string;
  filter?: TrashFilter;
  page?: number;
  pageSize?: number;
};

export type TrashedNoteItem = {
  itemType: 'note';
  id: number;
  name: string;
  trashedAt: string;
  originalWorkspaceId: number;
  originalWorkspaceName: string;
  preview: string;
};

export type TrashedWorkspaceItem = {
  itemType: 'workspace';
  id: number;
  name: string;
  trashedAt: string;
  noteCount: number;
  matchedContainedNote: boolean;
};

export type TrashedConversationItem = {
  itemType: 'conversation';
  id: number;
  name: string;
  trashedAt: string;
  /** 这次对话里有多少条消息，回收站里用来判断值不值得恢复。 */
  messageCount: number;
};

export type TrashedTemplateItem = {
  itemType: 'template';
  id: number;
  name: string;
  trashedAt: string;
  preview: string;
  /** 永久删除模板时会一并删除的历史生成结果数量。 */
  outputCount: number;
};

export type TrashItem =
  | TrashedNoteItem
  | TrashedWorkspaceItem
  | TrashedConversationItem
  | TrashedTemplateItem;

export type TrashListResult = {
  items: TrashItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type TrashActionResult = {
  itemType: TrashItemType;
  id: number;
  name: string;
  workspaceId: number | null;
  noteCount: number;
};
