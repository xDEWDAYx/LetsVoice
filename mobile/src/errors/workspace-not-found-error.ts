export class WorkspaceNotFoundError extends Error {
  public constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} was not found.`);
    this.name = "WorkspaceNotFoundError";
  }
}
