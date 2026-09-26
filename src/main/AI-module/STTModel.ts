import { Model } from '@shared/models/Model';

export class STTModel extends Model {
  downloadUrl: string;

  checksum: string | null;

  constructor(
    id: string,
    name: string,
    language: string,
    engine: string,
    format: string,
    size: string,
    downloadUrl: string,
    checksum: string | null,
    downloaded: boolean,
    activated: boolean,
  ) {
    super(id, name, language, engine, format, size, downloaded, activated);

    this.checksum = checksum;
    this.downloadUrl = downloadUrl;
  }
}
