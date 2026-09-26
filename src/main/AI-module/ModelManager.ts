import { Model } from '@shared/models/Model';

export interface ModelManager {
  getModelList(): Model[] | Promise<Model[]>;

  downloadModel(id: string): Promise<void>;

  deleteModel(id: string): Promise<void>;

  activateModel(id: string): boolean | Promise<boolean>;
}
