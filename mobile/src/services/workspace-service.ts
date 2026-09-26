import { Workspace } from "@/domain/workspace/workspace";
import { ValidationError } from "@/errors/validation-error";
import { WorkspaceNotFoundError } from "@/errors/workspace-not-found-error";
import { WorkspaceRepository } from "@/repositories/workspace-repository";
import { NoteRepository } from "@/repositories/note-repository";
import { suggestWorkspaceName, type WorkspaceNameSuggestion } from "@/services/workspace-name-suggestion";

export class WorkspaceService {
  private readonly changeListeners = new Set<() => void>();
  public constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly noteRepository: NoteRepository,
  ) {}

  public async getWorkspaces(): Promise<Workspace[]> {
    return this.workspaceRepository.findAll();
  }

  public async getWorkspace(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findById(id);
  }

  public async getWorkspaceNameSuggestion(): Promise<WorkspaceNameSuggestion | null> {
    const [workspaces, notes] = await Promise.all([
      this.workspaceRepository.findAll(),
      this.noteRepository.findAll(),
    ]);
    return suggestWorkspaceName(workspaces, notes);
  }

  public async createWorkspace(name: string): Promise<Workspace> {
    const normalizedName = this.normalizeName(name);
    const now = new Date().toISOString();
    const workspace = new Workspace(this.createId(), normalizedName, now, now);

    await this.workspaceRepository.create(workspace);
    this.publishChange();
    return workspace;
  }

  public async getOrCreateDefaultWorkspace(): Promise<Workspace> {
    const active = await this.workspaceRepository.findAll();
    const existing = active.find((workspace) => workspace.getName() === "My Workspace") ?? active[0];
    if (existing) return existing;

    const now = new Date().toISOString();
    const workspace = new Workspace(
      this.createId(),
      "My Workspace",
      now,
      now,
    );
    await this.workspaceRepository.create(workspace);
    this.publishChange();
    return workspace;
  }

  public async renameWorkspace(id: string, name: string): Promise<void> {
    const workspace = await this.getWorkspaceOrThrow(id);
    workspace.rename(this.normalizeName(name));
    await this.workspaceRepository.update(workspace);
    this.publishChange();
  }

  public async deleteWorkspace(id: string): Promise<void> {
    await this.getWorkspaceOrThrow(id);
    await this.workspaceRepository.trash(id);
    this.publishChange();
  }

  public async restoreWorkspace(id: string): Promise<void> {
    await this.workspaceRepository.restore(id);
    this.publishChange();
  }

  public subscribeToChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private publishChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }

  private async getWorkspaceOrThrow(id: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findById(id);

    if (workspace === null) {
      throw new WorkspaceNotFoundError(id);
    }

    return workspace;
  }

  private normalizeName(name: string): string {
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      throw new ValidationError("Workspace name cannot be empty.");
    }

    return normalizedName;
  }

  private createId(): string {
    return `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
