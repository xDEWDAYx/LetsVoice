import fs from 'fs';
import os from 'os';
import path from 'path';
import TTSModelManager from '../../AI-module/TTSModelManager';
import ActiveModelStateStore from '../../AI-module/ActiveModelStateStore';
import { ManagedPaths } from '../../runtime/ManagedPaths';
import {
  getTTSModelCatalogItem,
  KOKORO_TTS_MODEL_ID,
  MELO_TTS_MODEL_ID,
} from '../TTSModelCatalog';

function createRequiredFiles(root: string, modelId: string): void {
  const item = getTTSModelCatalogItem(modelId);
  item.requiredFiles.forEach((relativePath) => {
    const target = path.join(root, 'models', 'tts', modelId, relativePath);
    if (path.extname(relativePath)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'test');
    } else {
      fs.mkdirSync(target, { recursive: true });
    }
  });
}

describe('TTSModelManager', () => {
  let root: string;
  let manager: TTSModelManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakspace-tts-manager-'));
    createRequiredFiles(root, KOKORO_TTS_MODEL_ID);
    createRequiredFiles(root, MELO_TTS_MODEL_ID);
    manager = new TTSModelManager({
      managedPaths: new ManagedPaths(root),
      stateStore: new ActiveModelStateStore(
        path.join(root, 'model-state', 'tts.json'),
      ),
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('auto-activates the first downloaded model and persists the choice', () => {
    // 模型下载完就该直接可用：没人手动选过时自动选中目录里第一个已下载的，
    // 否则开工前检查会一直报「未选择模型」，而模型其实就躺在硬盘上。
    expect(manager.getActivatedModel()?.id).toBe(KOKORO_TTS_MODEL_ID);

    const reloaded = new TTSModelManager({
      managedPaths: new ManagedPaths(root),
    });
    expect(reloaded.getActivatedModel()?.id).toBe(KOKORO_TTS_MODEL_ID);
  });

  it('keeps an explicit activation instead of falling back to the first model', () => {
    expect(manager.activateModel(MELO_TTS_MODEL_ID)).toBe(true);

    const reloaded = new TTSModelManager({
      managedPaths: new ManagedPaths(root),
    });
    expect(reloaded.getActivatedModel()?.id).toBe(MELO_TTS_MODEL_ID);
  });

  it('refuses to delete the active model, then deletes it after switching', async () => {
    manager.activateModel(KOKORO_TTS_MODEL_ID);
    await expect(manager.deleteModel(KOKORO_TTS_MODEL_ID)).rejects.toThrow(
      '正在使用',
    );
    expect(manager.activateModel(MELO_TTS_MODEL_ID)).toBe(true);
    await manager.deleteModel(KOKORO_TTS_MODEL_ID);
    expect(
      manager.getModelList().find((model) => model.id === KOKORO_TTS_MODEL_ID)
        ?.downloaded,
    ).toBe(false);
  });
});
