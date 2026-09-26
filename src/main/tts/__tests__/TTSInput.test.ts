import type { TTSSpeaker } from '@shared/types/TTSRuntimeTypes';
import { normalizeTTSInput } from '../TTSInput';

const speakers: TTSSpeaker[] = [
  {
    id: 'Junhao',
    name: 'Junhao',
    label: 'Junhao',
    language: '中文',
    isDefault: true,
  },
  {
    id: 'Ava',
    name: 'Ava',
    label: 'Ava',
    language: '英文',
    isDefault: false,
  },
];

describe('normalizeTTSInput', () => {
  it('uses the active model default speaker when none is supplied', () => {
    expect(normalizeTTSInput(' hello ', {}, speakers)).toEqual({
      text: 'hello',
      speakerId: 'Junhao',
      speed: 1,
    });
  });

  it('rejects a speaker that is not in the active model', () => {
    expect(() =>
      normalizeTTSInput('hello', { speakerId: 'missing' }, speakers),
    ).toThrow('Invalid TTS speaker');
  });
});
