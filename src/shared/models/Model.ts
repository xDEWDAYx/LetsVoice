export class Model {
  id: string;

  name: string;

  language: string;

  engine: string;

  format: string;

  size: string;

  downloaded: boolean;

  activated: boolean;

  constructor(
    id: string,
    name: string,
    language: string,
    engine: string,
    format: string,
    size: string,
    downloaded: boolean,
    activated: boolean,
  ) {
    this.id = id;
    this.name = name;
    this.language = language;
    this.engine = engine;
    this.format = format;
    this.size = size;
    this.downloaded = downloaded;
    this.activated = activated;
  }
}
