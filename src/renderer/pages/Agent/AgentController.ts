import type {
  AgentEvent,
  AgentRunRequest,
  AgentRunStarted,
} from '@shared/types/AgentTypes';
import { WorkspaceItem } from '../Workspace/WorkspaceController';

type AgentApi = {
  start(request: AgentRunRequest): Promise<AgentRunStarted>;
  cancel(runId: string): Promise<boolean>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
};

type WorkspaceApi = {
  getList(limit?: number): Promise<WorkspaceItem[]>;
};

/** Renderer 只负责发送任务和订阅公开步骤，不直接调用模型或数据库。 */
export default class AgentController {
  private readonly agent: AgentApi;

  private readonly workspace: WorkspaceApi;

  public constructor(
    agent: AgentApi = window.electron.agent,
    workspace: WorkspaceApi = window.electron.workspace,
  ) {
    this.agent = agent;
    this.workspace = workspace;
  }

  public listWorkspaces(): Promise<WorkspaceItem[]> {
    return this.workspace.getList(100);
  }

  public start(request: AgentRunRequest): Promise<AgentRunStarted> {
    return this.agent.start(request);
  }

  public cancel(runId: string): Promise<boolean> {
    return this.agent.cancel(runId);
  }

  public onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.agent.onEvent(listener);
  }
}
