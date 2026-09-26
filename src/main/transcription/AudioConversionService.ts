import fs from 'fs/promises';
import path from 'path';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';

export type PreparedAudio = {
  wavePath: string;
  temporary: boolean;
};

/** 将 Whisper 不直接支持的媒体格式转换为 16kHz 单声道 WAV。 */
export default class AudioConversionService {
  private readonly managedPaths: ManagedPaths;

  private readonly processRunner: LocalProcessRunner;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    processRunner = new LocalProcessRunner(),
  ) {
    this.managedPaths = managedPaths;
    this.processRunner = processRunner;
  }

  public async prepare(
    rawInputPath: unknown,
    outputBasePath: string,
    ffmpegPath: string | null,
    signal?: AbortSignal,
  ): Promise<PreparedAudio> {
    const inputPath = await AudioConversionService.normalizeInput(rawInputPath);
    if (path.extname(inputPath).toLowerCase() === '.wav') {
      return { wavePath: inputPath, temporary: false };
    }
    if (!ffmpegPath) {
      throw new Error(
        '此媒体格式需要本机 ffmpeg 转换 / ffmpeg is required for this media format',
      );
    }
    if (!this.managedPaths.isManagedPath(outputBasePath)) {
      throw new Error('转写输出路径无效 / Invalid transcription output path');
    }

    const wavePath = `${outputBasePath}.input.wav`;
    await fs.mkdir(path.dirname(wavePath), { recursive: true });
    await this.processRunner.run(
      ffmpegPath,
      [
        '-y',
        '-i',
        inputPath,
        '-c:a',
        'pcm_s16le',
        '-ac',
        '1',
        '-ar',
        '16000',
        wavePath,
      ],
      { signal },
    );

    return { wavePath, temporary: true };
  }

  private static async normalizeInput(rawInputPath: unknown): Promise<string> {
    if (typeof rawInputPath !== 'string' || rawInputPath.length > 4096) {
      throw new Error('无效的音频路径 / Invalid audio path');
    }

    const inputPath = path.resolve(rawInputPath);
    const stat = await fs.stat(inputPath);
    if (!stat.isFile()) {
      throw new Error('音频路径不是文件 / Audio path is not a file');
    }

    return inputPath;
  }
}
