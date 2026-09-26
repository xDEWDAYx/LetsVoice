import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ManagedPaths } from '../runtime/ManagedPaths';
import { OLLAMA_SERVER_URL, readOllamaModelNames } from './OllamaEndpoint';
import OllamaRuntimeLocator from './OllamaRuntimeLocator';

type ServerControllerDependencies = {
  locator?: OllamaRuntimeLocator;
  managedPaths?: ManagedPaths;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  retryDelayMs?: number;
  startTimeoutMs?: number;
};

export type OllamaServerStartResult = {
  started: boolean;
  binaryPath: string | null;
};

/** 仅在聊天或模型操作需要时启动 Ollama，并只持有本应用启动的进程。 */
export default class OllamaServerController {
  private readonly locator: OllamaRuntimeLocator;

  private readonly managedPaths: ManagedPaths;

  private readonly fetchImpl: typeof fetch;

  private readonly spawnImpl: typeof spawn;

  private readonly retryDelayMs: number;

  private readonly startTimeoutMs: number;

  private ownedProcess: ChildProcess | null = null;

  private startPromise: Promise<OllamaServerStartResult> | null = null;

  public constructor(dependencies: ServerControllerDependencies = {}) {
    this.locator = dependencies.locator ?? new OllamaRuntimeLocator();
    this.managedPaths = dependencies.managedPaths ?? ManagedPaths.getInstance();
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.spawnImpl = dependencies.spawnImpl ?? spawn;
    this.retryDelayMs = dependencies.retryDelayMs ?? 300;
    this.startTimeoutMs = dependencies.startTimeoutMs ?? 15_000;
  }

  public async ensureRunning(): Promise<OllamaServerStartResult> {
    if (await this.isReachable()) {
      return { started: false, binaryPath: this.locator.locate().binaryPath };
    }
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startOwnedServer();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  public stop(): void {
    if (this.ownedProcess && this.ownedProcess.exitCode === null) {
      this.ownedProcess.kill();
    }
    this.ownedProcess = null;
  }

  private async startOwnedServer(): Promise<OllamaServerStartResult> {
    const binary = this.locator.locate();
    if (!binary.binaryPath) {
      throw new Error(
        '未找到 Ollama；请先安装运行时 / Ollama runtime was not found',
      );
    }

    const environment: typeof process.env = {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11434',
    };
    if (binary.location === 'portable') {
      const { modelsRoot } = this.managedPaths.ensureRuntimeDirectories('llm');
      fs.mkdirSync(modelsRoot, { recursive: true });
      environment.OLLAMA_MODELS = modelsRoot;
    }

    let processError: Error | null = null;
    this.ownedProcess = this.spawnImpl(binary.binaryPath, ['serve'], {
      cwd: path.dirname(binary.binaryPath),
      env: environment,
      stdio: 'ignore',
      windowsHide: true,
    });
    this.ownedProcess.once('error', (error) => {
      processError = error;
    });

    const attempts = Math.max(
      1,
      Math.ceil(this.startTimeoutMs / this.retryDelayMs),
    );
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (processError) throw processError;
      if (this.ownedProcess.exitCode !== null) {
        throw new Error('Ollama 服务启动后立即退出 / Ollama exited early');
      }
      // 服务就绪检查必须串行，避免同时向刚启动的端口发送大量请求。
      // eslint-disable-next-line no-await-in-loop
      if (await this.isReachable()) {
        return { started: true, binaryPath: binary.binaryPath };
      }
      // eslint-disable-next-line no-await-in-loop
      await OllamaServerController.delay(this.retryDelayMs);
    }

    this.stop();
    throw new Error('Ollama 服务启动超时 / Ollama server start timed out');
  }

  private async isReachable(): Promise<boolean> {
    return (
      (await readOllamaModelNames(
        this.fetchImpl,
        OLLAMA_SERVER_URL,
        this.retryDelayMs,
      )) !== null
    );
  }

  private static delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
