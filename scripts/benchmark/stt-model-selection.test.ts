import { selectRequestedSttModels } from './stt-model-selection';

const MODELS = [
  { id: 'tiny', path: '/models/ggml-tiny.bin' },
  { id: 'small', path: '/models/ggml-small.bin' },
];

describe('selectRequestedSttModels', () => {
  it('returns all discovered models when no filter is requested', () => {
    expect(selectRequestedSttModels(MODELS)).toEqual(MODELS);
  });

  it('returns only explicitly requested models', () => {
    expect(selectRequestedSttModels(MODELS, ['small'])).toEqual([MODELS[1]]);
  });

  it('rejects a run when any explicitly requested model is missing', () => {
    expect(() =>
      selectRequestedSttModels(MODELS, ['tiny', 'large-v3']),
    ).toThrow('缺少指定的 whisper 模型：large-v3');
  });
});
