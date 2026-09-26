import os from 'os';
import path from 'path';
import { requireAtRuntime } from '../runtime/RuntimeRequire';
import { TTSModelEngine, GeneratedTTSAudio } from './TTSGeneratedAudio';
import { KOKORO_TTS_MODEL_ID, MELO_TTS_MODEL_ID } from './TTSModelCatalog';

type SherpaGeneratedAudio = { samples: Float32Array; sampleRate: number };
type OfflineTts = {
  generateAsync(request: {
    text: string;
    sid: number;
    speed: number;
    enableExternalBuffer: boolean;
  }): Promise<SherpaGeneratedAudio>;
};
type SherpaModule = {
  OfflineTts: { createAsync(config: unknown): Promise<OfflineTts> };
};

/** Kokoro 和 MeloTTS 共用 sherpa-onnx 的异步离线合成接口。 */
export default class SherpaTTSEngine implements TTSModelEngine {
  private engine: OfflineTts | null;

  private constructor(engine: OfflineTts) {
    this.engine = engine;
  }

  public static async create(
    modelId: string,
    modelDir: string,
  ): Promise<SherpaTTSEngine> {
    const module = SherpaTTSEngine.requireModule();
    const common = {
      numThreads: Math.max(1, Math.min(os.cpus().length - 1, 4)),
      maxNumSentences: 1,
      silenceScale: 0.2,
      provider: 'cpu',
    };
    const config =
      modelId === KOKORO_TTS_MODEL_ID
        ? {
            model: {
              kokoro: {
                model: path.join(modelDir, 'model.onnx'),
                voices: path.join(modelDir, 'voices.bin'),
                tokens: path.join(modelDir, 'tokens.txt'),
                dataDir: path.join(modelDir, 'espeak-ng-data'),
                lexicon: [
                  path.join(modelDir, 'lexicon-us-en.txt'),
                  path.join(modelDir, 'lexicon-zh.txt'),
                ].join(','),
              },
            },
            ...common,
          }
        : {
            model: {
              vits: {
                model: path.join(modelDir, 'model.onnx'),
                lexicon: path.join(modelDir, 'lexicon.txt'),
                tokens: path.join(modelDir, 'tokens.txt'),
                dictDir: path.join(modelDir, 'dict'),
              },
            },
            ruleFsts: [
              path.join(modelDir, 'phone.fst'),
              path.join(modelDir, 'date.fst'),
              path.join(modelDir, 'number.fst'),
            ].join(','),
            ...common,
          };
    if (modelId !== KOKORO_TTS_MODEL_ID && modelId !== MELO_TTS_MODEL_ID) {
      throw new Error(`sherpa-onnx 不支持该 TTS 模型: ${modelId}`);
    }
    return new SherpaTTSEngine(await module.OfflineTts.createAsync(config));
  }

  public async generate(
    text: string,
    speakerId: string,
    speed: number,
  ): Promise<GeneratedTTSAudio> {
    if (!this.engine) throw new Error('TTS 引擎已释放');
    const numericSpeakerId = Number(speakerId);
    if (!Number.isInteger(numericSpeakerId)) {
      throw new Error('sherpa-onnx 音色 ID 无效');
    }
    const generated = await this.engine.generateAsync({
      text,
      sid: numericSpeakerId,
      speed,
      enableExternalBuffer: false,
    });
    if (!generated?.samples?.length || !generated.sampleRate) {
      throw new Error('本地 TTS 没有返回音频 / TTS returned no audio');
    }
    return {
      sampleRate: generated.sampleRate,
      channels: [Float32Array.from(generated.samples)],
    };
  }

  public dispose(): void {
    this.engine = null;
  }

  private static requireModule(): SherpaModule {
    // 官方 Node 包提供 macOS x64/arm64 和 Windows x64 原生绑定：
    // https://k2-fsa.github.io/sherpa/onnx/javascript-api/install.html
    return requireAtRuntime<SherpaModule>('sherpa-onnx-node');
  }
}
