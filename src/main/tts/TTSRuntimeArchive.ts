import fs from 'fs/promises';
import path from 'path';

/** 定位包含全部必需文件的模型根目录。 */
export default class TTSRuntimeArchive {
  public static async findModelRoot(
    root: string,
    requiredFiles: readonly string[],
  ): Promise<string | null> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const present = await Promise.all(
      requiredFiles.map((relativePath) =>
        fs
          .access(path.join(root, relativePath))
          .then(() => true)
          .catch(() => false),
      ),
    );
    if (present.every(Boolean)) {
      return root;
    }

    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          TTSRuntimeArchive.findModelRoot(
            path.join(root, entry.name),
            requiredFiles,
          ),
        ),
    );
    return nested.find((result) => result !== null) ?? null;
  }

  public static async copyModel(
    source: string,
    destination: string,
  ): Promise<void> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true });
  }
}
