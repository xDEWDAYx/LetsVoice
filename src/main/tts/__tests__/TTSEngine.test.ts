import TTSEngine from '../TTSEngine';
import { TTSModelEngine } from '../TTSGeneratedAudio';

describe('TTSEngine', () => {
  it('reuses one engine and disposes it when the selected model changes', async () => {
    const disposed: string[] = [];
    const created: string[] = [];
    const factory = async (modelId: string): Promise<TTSModelEngine> => {
      created.push(modelId);
      return {
        generate: async () => ({
          sampleRate: 24_000,
          channels: [Float32Array.of(0.1)],
        }),
        dispose: () => disposed.push(modelId),
      };
    };
    const engine = new TTSEngine(factory);

    await engine.generate('first', '/tmp/first', 'hello', '0', 1);
    await engine.generate('first', '/tmp/first', 'again', '0', 1);
    await engine.generate('second', '/tmp/second', 'switch', '0', 1);
    await Promise.resolve();

    expect(created).toEqual(['first', 'second']);
    expect(disposed).toEqual(['first']);
    engine.dispose();
  });
});
