import fs from 'fs';
import os from 'os';
import path from 'path';
import ActiveModelStateStore from '../ActiveModelStateStore';

describe('ActiveModelStateStore.resolveActiveModelId', () => {
  let root: string;
  let store: ActiveModelStateStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakspace-active-model-'));
    store = new ActiveModelStateStore(path.join(root, 'state.json'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('没人选过时自动选中第一个已下载的模型并落盘', () => {
    expect(store.resolveActiveModelId(['a', 'b'])).toBe('a');
    expect(store.getActiveModelId()).toBe('a');
  });

  it('已保存的选择仍然可用时原样沿用', () => {
    store.setActiveModelId('b');
    expect(store.resolveActiveModelId(['a', 'b'])).toBe('b');
  });

  it('已保存的模型被删掉后改选其余已下载的', () => {
    store.setActiveModelId('a');
    expect(store.resolveActiveModelId(['b'])).toBe('b');
    expect(store.getActiveModelId()).toBe('b');
  });

  it('列表为空时保持原选择不变', () => {
    // Ollama 没起来时拿到的就是空列表，这属于「查不到」，
    // 不能被当成「用户把模型删了」而清掉他的选择。
    store.setActiveModelId('a');
    expect(store.resolveActiveModelId([])).toBe('a');
    expect(store.getActiveModelId()).toBe('a');
  });

  it('从来没选过且没有已下载模型时返回 null，且不写文件', () => {
    expect(store.resolveActiveModelId([])).toBeNull();
    expect(fs.existsSync(path.join(root, 'state.json'))).toBe(false);
  });
});
