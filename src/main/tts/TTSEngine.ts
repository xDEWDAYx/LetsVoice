import MossOnnxRuntime from './MossOnnxRuntime';
import SherpaTTSEngine from './SherpaTTSEngine';
import { GeneratedTTSAudio, TTSModelEngine } from './TTSGeneratedAudio';
import { getTTSModelCatalogItem } from './TTSModelCatalog';

type EngineFactory = (
  modelId: string,
  modelDir: string,
) => Promise<TTSModelEngine>;

/** 仅缓存当前激活模型的引擎，切换时立即释放旧引擎引用。 */
export default class TTSEngine {
  private activeModelId: string | null = null;

  private enginePromise: Promise<TTSModelEngine> | null = null;

  private readonly createEngine: EngineFactory;

  public constructor(createEngine: EngineFactory = TTSEngine.createEngine) {
    this.createEngine = createEngine;
  }

  public async generate(
    modelId: string,
    modelDir: string,
    text: string,
    speakerId: string,
    speed: number,
  ): Promise<GeneratedTTSAudio> {
    if (this.activeModelId !== modelId) this.dispose();
    this.activeModelId = modelId;
    if (!this.enginePromise) {
      this.enginePromise = this.createEngine(modelId, modelDir).catch(
        (error) => {
          this.enginePromise = null;
          this.activeModelId = null;
          throw error;
        },
      );
    }
    const engine = await this.enginePromise;
    return engine.generate(text, speakerId, speed);
  }

  public dispose(): void {
    const current = this.enginePromise;
    this.enginePromise = null;
    this.activeModelId = null;
    current?.then((engine) => engine.dispose()).catch(() => undefined);
  }

  private static async createEngine(
    modelId: string,
    modelDir: string,
  ): Promise<TTSModelEngine> {
    const item = getTTSModelCatalogItem(modelId);
    if (item.engine === 'moss-onnx') return MossOnnxRuntime.create(modelDir);
    return SherpaTTSEngine.create(modelId, modelDir);
  }
}
