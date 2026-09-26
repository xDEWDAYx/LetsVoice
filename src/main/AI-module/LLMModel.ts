import { Model } from '@shared/models/Model';

export class LLMModel extends Model {
  quantization: string | null;

  modelName: string;

  constructor(
    id: string,
    name: string,
    language: string,
    engine: string,
    format: string,
    quantization: string | null,
    size: string,
    modelName: string,
    downloaded: boolean,
    activated: boolean,
  ) {
    super(id, name, language, engine, format, size, downloaded, activated);

    this.quantization = quantization;
    this.modelName = modelName;
  }
}
