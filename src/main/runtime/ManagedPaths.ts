import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import type { RuntimeKind } from '@shared/types/RuntimeTypes';

export type { RuntimeKind };

export type RuntimeStoragePaths = {
  runtimeRoot: string;
  modelsRoot: string;
  cacheRoot: string;
  outputRoot: string;
  manifestPath: string;
};

/**
 * 统一管理模型、运行时、缓存和输出目录。
 * 所有可下载或可删除的数据均位于 Electron userData 下，打包后不会尝试修改应用目录。
 */
export class ManagedPaths {
  // 类内部的单例类型属于正常自引用，不是运行时的提前访问。
  // eslint-disable-next-line no-use-before-define
  private static instance: ManagedPaths | null = null;

  private readonly dataRoot: string;

  public constructor(dataRoot = app.getPath('userData')) {
    this.dataRoot = path.resolve(dataRoot);
  }

  public static getInstance(): ManagedPaths {
    if (ManagedPaths.instance === null) {
      ManagedPaths.instance = new ManagedPaths();
    }

    return ManagedPaths.instance;
  }

  public getDataRoot(): string {
    return this.dataRoot;
  }

  public getBlobRoot(): string {
    return path.join(this.dataRoot, 'blobs');
  }

  public getRecordingsRoot(): string {
    return path.join(this.getBlobRoot(), 'recordings');
  }

  public getRuntimePaths(kind: RuntimeKind): RuntimeStoragePaths {
    const runtimeRoot = path.join(this.dataRoot, 'runtimes', kind);

    return {
      runtimeRoot,
      // 保留当前 models/stt 目录约定，已经下载的模型无需搬迁。
      modelsRoot: path.join(this.dataRoot, 'models', kind),
      cacheRoot: path.join(this.dataRoot, 'cache', kind),
      outputRoot: path.join(this.dataRoot, 'output', kind),
      manifestPath: path.join(runtimeRoot, 'runtime-manifest.json'),
    };
  }

  /**
   * 功能首次使用时再创建目录，避免应用启动时生成大量空文件夹。
   */
  public ensureRuntimeDirectories(kind: RuntimeKind): RuntimeStoragePaths {
    const runtimePaths = this.getRuntimePaths(kind);

    [
      runtimePaths.runtimeRoot,
      runtimePaths.modelsRoot,
      runtimePaths.cacheRoot,
      runtimePaths.outputRoot,
    ].forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

    return runtimePaths;
  }

  /**
   * 删除或写入前可用此方法验证路径，防止 `..` 或绝对路径逃出 userData。
   */
  public isManagedPath(candidatePath: string): boolean {
    const absoluteCandidate = path.resolve(candidatePath);
    const relativePath = path.relative(this.dataRoot, absoluteCandidate);

    return (
      relativePath.length > 0 &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    );
  }

  public resolveManagedPath(...segments: string[]): string {
    const resolvedPath = path.resolve(this.dataRoot, ...segments);

    if (!this.isManagedPath(resolvedPath)) {
      throw new Error('路径不在应用受管目录中 / Path is outside managed data');
    }

    return resolvedPath;
  }
}
