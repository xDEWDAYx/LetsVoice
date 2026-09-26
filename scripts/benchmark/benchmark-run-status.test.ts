import { isCompleteBenchmarkRun } from './benchmark-run-status';

describe('isCompleteBenchmarkRun', () => {
  it('accepts a run only when every selected step succeeded', () => {
    expect(
      isCompleteBenchmarkRun([
        { id: 'tts', status: 'ok' },
        { id: 'llm', status: 'ok' },
        { id: 'stt', status: 'ok' },
      ]),
    ).toBe(true);
  });

  it.each(['skipped', 'failed'])('rejects a run containing %s', (status) => {
    expect(
      isCompleteBenchmarkRun([
        { id: 'tts', status: 'ok' },
        { id: 'llm', status },
      ]),
    ).toBe(false);
  });

  it('rejects an empty run', () => {
    expect(isCompleteBenchmarkRun([])).toBe(false);
  });
});
