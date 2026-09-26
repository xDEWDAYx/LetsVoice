import type {
  EmbeddingModelStatus,
  SemanticNoteResult,
} from '@shared/types/SemanticTypes';

type SemanticApi = {
  getStatus(): Promise<EmbeddingModelStatus>;
  search(
    query: string,
    workspaceId?: number | null,
    topK?: number,
  ): Promise<SemanticNoteResult[]>;
};

/** 工作空间语义搜索只通过 preload 调用本机索引。 */
export default class WorkspaceSemanticController {
  private readonly api: SemanticApi;

  public constructor(api: SemanticApi = window.electron.semantic) {
    this.api = api;
  }

  public getStatus(): Promise<EmbeddingModelStatus> {
    return this.api.getStatus();
  }

  public search(
    query: string,
    workspaceId: number,
  ): Promise<SemanticNoteResult[]> {
    return this.api.search(query, workspaceId, 5);
  }
}
