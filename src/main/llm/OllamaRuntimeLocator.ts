import fs from 'fs';
import path from 'path';
import type { OllamaRuntimeLocation } from '@shared/types/RuntimeTypes';
import CommandLocator from '../runtime/CommandLocator';
import { ManagedPaths } from '../runtime/ManagedPaths';

export type { OllamaRuntimeLocation };

export type OllamaBinaryInfo = {
  binaryPath: string | null;
  location: OllamaRuntimeLocation;
};

type LocatorDependencies = {
  managedPaths?: ManagedPaths;
  platform?: typeof process.platform;
  environment?: typeof process.env;
  commandResolver?: (commands: string[]) => string | null;
};

/** 查找应用受管的 Ollama 或用户已安装的 Ollama，不会启动任何进程。 */
export default class OllamaRuntimeLocator {
  private readonly managedPaths: ManagedPaths;

  private readonly platform: typeof process.platform;

  private readonly environment: typeof process.env;

  private readonly commandResolver: (commands: string[]) => string | null;

  public constructor(dependencies: LocatorDependencies = {}) {
    this.managedPaths = dependencies.managedPaths ?? ManagedPaths.getInstance();
    this.platform = dependencies.platform ?? process.platform;
    this.environment = dependencies.environment ?? process.env;
    this.commandResolver =
      dependencies.commandResolver ?? CommandLocator.resolve;
  }

  public locate(): OllamaBinaryInfo {
    const portablePath = this.getPortablePath();
    if (fs.existsSync(portablePath)) {
      return { binaryPath: portablePath, location: 'portable' };
    }

    const installedPath = this.getInstalledCandidates().find((candidate) =>
      fs.existsSync(candidate),
    );
    if (installedPath) {
      return { binaryPath: installedPath, location: 'installed' };
    }

    const commandPath = this.commandResolver(['ollama']);
    if (commandPath) {
      return { binaryPath: commandPath, location: 'system-path' };
    }

    return { binaryPath: null, location: 'missing' };
  }

  private getPortablePath(): string {
    const executable = this.platform === 'win32' ? 'ollama.exe' : 'ollama';
    return path.join(
      this.managedPaths.getRuntimePaths('llm').runtimeRoot,
      'bin',
      executable,
    );
  }

  private getInstalledCandidates(): string[] {
    if (this.platform === 'win32') {
      const localAppData = this.environment.LOCALAPPDATA;
      return localAppData
        ? [path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe')]
        : [];
    }

    if (this.platform === 'darwin') {
      return [
        '/Applications/Ollama.app/Contents/Resources/ollama',
        '/opt/homebrew/bin/ollama',
        '/usr/local/bin/ollama',
      ];
    }

    return ['/usr/local/bin/ollama', '/usr/bin/ollama'];
  }
}
