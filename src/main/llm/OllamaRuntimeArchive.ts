import fs from 'fs/promises';
import path from 'path';

/** 查找 Ollama CLI，并保留同目录的 GPU/runner 子目录进行安装。 */
export default class OllamaRuntimeArchive {
  public static async findExecutable(
    rootDirectory: string,
  ): Promise<string | null> {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    const executableName =
      process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const directMatch = entries.find(
      (entry) => entry.isFile() && entry.name === executableName,
    );
    if (directMatch) return path.join(rootDirectory, directMatch.name);

    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          OllamaRuntimeArchive.findExecutable(
            path.join(rootDirectory, entry.name),
          ),
        ),
    );
    return nested.find((result) => result !== null) ?? null;
  }

  public static async copyRuntime(
    executablePath: string,
    destinationDirectory: string,
  ): Promise<void> {
    await fs.mkdir(destinationDirectory, { recursive: true });
    await fs.cp(path.dirname(executablePath), destinationDirectory, {
      recursive: true,
      force: true,
    });
  }
}
