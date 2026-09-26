export class DatabaseConfig {
  public readonly databaseName: string;
  public readonly version: number;

  public constructor(databaseName: string, version: number) {
    this.databaseName = databaseName;
    this.version = version;
  }
}
