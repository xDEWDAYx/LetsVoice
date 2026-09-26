import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export const PARAKEET_REQUIRED_FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
];

/** 验证官方 Parakeet 压缩包，并定位可能嵌套的模型根目录。 */
export default class ParakeetModelArchive {
  public static isComplete(modelDir: string): boolean {
    return PARAKEET_REQUIRED_FILES.every((fileName) =>
      fs.existsSync(path.join(modelDir, fileName)),
    );
  }

  public static async findModelRoot(root: string): Promise<string | null> {
    if (ParakeetModelArchive.isComplete(root)) return root;
    const entries = await fsPromises.readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          ParakeetModelArchive.findModelRoot(path.join(root, entry.name)),
        ),
    );
    return nested.find((candidate) => candidate !== null) ?? null;
  }
}
