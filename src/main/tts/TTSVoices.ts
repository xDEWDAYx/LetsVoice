import fs from 'fs';
import path from 'path';
import type { TTSSpeaker } from '@shared/types/TTSRuntimeTypes';
import {
  KOKORO_TTS_MODEL_ID,
  MELO_TTS_MODEL_ID,
  MOSS_TTS_MODEL_ID,
} from './TTSModelCatalog';

const KOKORO_VOICE_NAMES = [
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_heart',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis',
  'ef_dora',
  'em_alex',
  'ff_siwis',
  'hf_alpha',
  'hf_beta',
  'hm_omega',
  'hm_psi',
  'if_sara',
  'im_nicola',
  'jf_alpha',
  'jf_gongitsune',
  'jf_nezumi',
  'jf_tebukuro',
  'jm_kumo',
  'pf_dora',
  'pm_alex',
  'pm_santa',
  'zf_xiaobei',
  'zf_xiaoni',
  'zf_xiaoxiao',
  'zf_xiaoyi',
  'zm_yunjian',
  'zm_yunxi',
  'zm_yunxia',
  'zm_yunyang',
] as const;

const KOKORO_DEFAULT_SPEAKER_ID = '45';
const CHINESE_NAMES: Record<string, string> = {
  zf_xiaobei: '小贝',
  zf_xiaoni: '小妮',
  zf_xiaoxiao: '晓晓',
  zf_xiaoyi: '小艺',
  zm_yunjian: '云健',
  zm_yunxi: '云熙',
  zm_yunxia: '云夏',
  zm_yunyang: '云扬',
};

function getKokoroLanguage(prefix: string): string {
  const names: Record<string, string> = {
    a: '美式英语',
    b: '英式英语',
    e: '西班牙语',
    f: '法语',
    h: '印地语',
    i: '意大利语',
    j: '日语',
    p: '葡萄牙语',
    z: '中文',
  };
  return names[prefix[0]] ?? '多语言';
}

function getKokoroSpeakers(): TTSSpeaker[] {
  return KOKORO_VOICE_NAMES.map((name, index) => {
    const id = String(index);
    const language = getKokoroLanguage(name);
    const displayName = CHINESE_NAMES[name] ?? name.split('_')[1];
    return {
      id,
      name,
      label: `${language} · ${displayName}${id === KOKORO_DEFAULT_SPEAKER_ID ? '（默认）' : ''}`,
      language,
      isDefault: id === KOKORO_DEFAULT_SPEAKER_ID,
    };
  });
}

type MossManifestVoice = {
  voice: string;
  display_name?: string;
  group?: string;
};

function getMossSpeakers(modelDir?: string | null): TTSSpeaker[] {
  if (!modelDir) return [];
  try {
    const manifestPath = path.join(
      modelDir,
      'MOSS-TTS-Nano-100M-ONNX',
      'browser_poc_manifest.json',
    );
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      builtin_voices?: MossManifestVoice[];
    };
    return (parsed.builtin_voices ?? []).map((voice, index) => ({
      id: voice.voice,
      name: voice.voice,
      label: `${voice.group ?? '官方音色'} · ${voice.voice}${index === 0 ? '（默认）' : ''}`,
      language: voice.group ?? '多语言',
      isDefault: index === 0,
    }));
  } catch {
    return [];
  }
}

/** 返回当前模型的官方内置音色，不接受外部参考音频。 */
export function getTTSSpeakers(
  modelId: string,
  modelDir?: string | null,
): TTSSpeaker[] {
  if (modelId === KOKORO_TTS_MODEL_ID) return getKokoroSpeakers();
  if (modelId === MELO_TTS_MODEL_ID) {
    return [
      {
        id: '0',
        name: 'default',
        label: '中英双语 · MeloTTS 默认音色',
        language: '中英双语',
        isDefault: true,
      },
    ];
  }
  if (modelId === MOSS_TTS_MODEL_ID) return getMossSpeakers(modelDir);
  return [];
}

export { KOKORO_DEFAULT_SPEAKER_ID };
