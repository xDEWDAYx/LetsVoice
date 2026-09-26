import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { TTSModelCatalogItem } from './TTSModelCatalog';

/** TTS 安装状态完全由模型目录中的必需文件决定。 */
export default class TTSModelStorage {
  private readonly modelsRoot: string;

  public constructor(modelsRoot: string) {
    this.modelsRoot = modelsRoot;
  }

  public getInstallPath(item: TTSModelCatalogItem): string {
    return path.join(this.modelsRoot, item.id);
  }

  public getMissingFiles(item: TTSModelCatalogItem): string[] {
    const modelDir = this.getInstallPath(item);
    return item.requiredFiles.filter(
      (relativePath) => !fs.existsSync(path.join(modelDir, relativePath)),
    );
  }

  public isInstalled(item: TTSModelCatalogItem): boolean {
    return this.getMissingFiles(item).length === 0;
  }

  public async remove(item: TTSModelCatalogItem): Promise<void> {
    await fsPromises.rm(this.getInstallPath(item), {
      recursive: true,
      force: true,
    });
  }
}
