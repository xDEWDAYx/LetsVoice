import os from 'os';
import ParakeetRuntimeService, {
  ParakeetRuntimeStatus,
} from './ParakeetRuntimeService';
import { requireAtRuntime } from '../runtime/RuntimeRequire';
import parseSherpaSegments, {
  SherpaRecognitionResult,
} from './SherpaOutputParser';

type Waveform = { samples: Float32Array; sampleRate: number };
type OfflineStream = { acceptWaveform(waveform: Waveform): void };
type OfflineRecognizer = {
  createStream(): OfflineStream;
  decodeAsync(stream: OfflineStream): Promise<SherpaRecognitionResult>;
};
type SherpaModule = {
  readWave(filePath: string): Waveform;
  OfflineRecognizer: {
    createAsync(config: unknown): Promise<OfflineRecognizer>;
  };
};
type ModuleLoader = () => SherpaModule;

/** 缓存当前 Parakeet 模型的异步识别器，模型切换后自动重建。 */
export default class ParakeetEngine {
  private recognizer: Promise<OfflineRecognizer> | null = null;

  private recognizerKey = '';

  private readonly runtime: ParakeetRuntimeService;

  private readonly loadModule: ModuleLoader;

  public constructor(
    runtime: ParakeetRuntimeService,
    loadModule: ModuleLoader = ParakeetEngine.requireModule,
  ) {
    this.runtime = runtime;
    this.loadModule = loadModule;
  }

  public async recognize(wavePath: string, signal?: AbortSignal) {
    const status = this.runtime.requireReady();
    if (signal?.aborted)
      throw new Error('转写已取消 / Transcription cancelled');
    const sherpa = this.loadModule();
    const recognizer = await this.getRecognizer(sherpa, status);
    const stream = recognizer.createStream();
    stream.acceptWaveform(sherpa.readWave(wavePath));
    const result = await recognizer.decodeAsync(stream);
    if (signal?.aborted)
      throw new Error('转写已取消 / Transcription cancelled');
    const text = String(result.text || '').trim();
    if (!text) throw new Error('Parakeet 转写结果为空');
    return {
      text,
      segments: parseSherpaSegments(result),
      modelId: status.activeModelId as string,
      modelName: status.activeModelName as string,
    };
  }

  private getRecognizer(
    sherpa: SherpaModule,
    status: ParakeetRuntimeStatus,
  ): Promise<OfflineRecognizer> {
    if (this.recognizer && this.recognizerKey === status.modelDir) {
      return this.recognizer;
    }
    this.recognizerKey = status.modelDir as string;
    this.recognizer = sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: status.requiredFiles['encoder.int8.onnx'],
          decoder: status.requiredFiles['decoder.int8.onnx'],
          joiner: status.requiredFiles['joiner.int8.onnx'],
        },
        tokens: status.requiredFiles['tokens.txt'],
        numThreads: Math.max(1, Math.min(os.cpus().length - 1, 4)),
        provider: 'cpu',
        modelType: status.modelType,
      },
      decodingMethod: 'greedy_search',
    });
    return this.recognizer;
  }

  private static requireModule(): SherpaModule {
    // 原生依赖与 TTS 共用 release/app 中的 external 包，按需加载。
    return requireAtRuntime<SherpaModule>('sherpa-onnx-node');
  }
}
