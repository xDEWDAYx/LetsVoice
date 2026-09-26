export type WorkspaceSuggestion = {
  shouldSuggest: boolean;
  category: string;
  name: string;
  reason: string;
  targetWorkspaceId: number | null;
};

type WorkspaceSuggestionApi = {
  getWorkspace(): Promise<WorkspaceSuggestion>;
};

/** Renderer 只展示建议；是否采用名称始终由用户操作。 */
export class WorkspaceSuggestionController {
  private readonly api: WorkspaceSuggestionApi;

  public constructor(
    api: WorkspaceSuggestionApi = window.electron.recommendation,
  ) {
    this.api = api;
  }

  public getSuggestion(): Promise<WorkspaceSuggestion> {
    return this.api.getWorkspace();
  }
}
