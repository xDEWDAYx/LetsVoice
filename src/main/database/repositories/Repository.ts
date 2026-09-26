export interface Repository<T> {
  // create(entity: T): void;

  findById(entityId: number): T | null;

  // update(entity: T): boolean;

  deleteById(entityId: number): boolean;

  existsById(entityId: number): boolean;
}
