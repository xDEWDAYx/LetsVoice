import fs from 'fs/promises';
import path from 'path';

/** 查找解压后的 CLI，并复制同目录的 DLL 和运行文件。 */
export default class WhisperRuntimeArchive {
  public static async findCli(rootDirectory: string): Promise<string | null> {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    const directMatch = entries.find(
      (entry) => entry.isFile() && entry.name === 'whisper-cli.exe',
    );
    if (directMatch) return path.join(rootDirectory, directMatch.name);

    const nestedResults = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          WhisperRuntimeArchive.findCli(path.join(rootDirectory, entry.name)),
        ),
    );
    return nestedResults.find((result) => result !== null) ?? null;
  }

  public static async copyRuntimeFiles(
    sourceDirectory: string,
    destinationDirectory: string,
  ): Promise<void> {
    await fs.mkdir(destinationDirectory, { recursive: true });
    const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          fs.copyFile(
            path.join(sourceDirectory, entry.name),
            path.join(destinationDirectory, entry.name),
          ),
        ),
    );
  }
}
