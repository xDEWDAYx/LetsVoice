import { Model } from '@shared/models/Model';
import { TTSBackend } from '../tts/TTSModelCatalog';

export default class TTSModel extends Model {
  declare engine: TTSBackend;

  recommended: boolean;

  public constructor(
    id: string,
    name: string,
    language: string,
    engine: TTSBackend,
    format: string,
    size: string,
    downloaded: boolean,
    activated: boolean,
    recommended: boolean,
  ) {
    super(id, name, language, engine, format, size, downloaded, activated);
    this.recommended = recommended;
  }
}
