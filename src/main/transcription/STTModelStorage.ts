import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import ParakeetModelArchive from './ParakeetModelArchive';
import { PARAKEET_ENGINE, STTCatalogItem } from './STTModelCatalog';

/** 区分 Whisper 单文件模型和 Parakeet 多文件模型目录。 */
export default class STTModelStorage {
  private readonly modelsRoot: string;

  public constructor(modelsRoot: string) {
    this.modelsRoot = modelsRoot;
  }

  public getInstallPath(item: STTCatalogItem): string {
    return item.engine === PARAKEET_ENGINE
      ? path.join(this.modelsRoot, item.id)
      : path.join(
          this.modelsRoot,
          path.basename(new URL(item.downloadUrl).pathname),
        );
  }

  public isInstalled(item: STTCatalogItem): boolean {
    const installPath = this.getInstallPath(item);
    return item.engine === PARAKEET_ENGINE
      ? ParakeetModelArchive.isComplete(installPath)
      : fs.existsSync(installPath);
  }

  public async remove(item: STTCatalogItem): Promise<void> {
    const installPath = this.getInstallPath(item);
    if (item.engine === PARAKEET_ENGINE) {
      await fsPromises.rm(installPath, { recursive: true, force: true });
    } else {
      await fsPromises.unlink(installPath);
    }
  }
}
