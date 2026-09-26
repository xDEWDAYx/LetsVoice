import type { TTSBackend } from '@shared/types/TTSRuntimeTypes';

export const KOKORO_TTS_MODEL_ID = 'kokoro-multi-lang-v1_0';
export const MELO_TTS_MODEL_ID = 'vits-melo-tts-zh_en';
export const MOSS_TTS_MODEL_ID = 'moss-tts-nano-100m-onnx';

export type { TTSBackend };

export type TTSArchiveInstallation = {
  kind: 'archive';
  url: string;
  sha256: string;
};

export type TTSFileAsset = {
  relativePath: string;
  url: string;
  sha256: string;
  sizeBytes: number;
};

export type TTSFilesInstallation = {
  kind: 'files';
  assets: readonly TTSFileAsset[];
};

export type TTSModelCatalogItem = {
  id: string;
  name: string;
  language: string;
  engine: TTSBackend;
  format: string;
  size: string;
  recommended: boolean;
  requiredFiles: readonly string[];
  installation: TTSArchiveInstallation | TTSFilesInstallation;
};

const SHERPA_RELEASE_ROOT =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';
const MOSS_TTS_REVISION = 'f52645cb467506d8e18e746ddd59482685b74e58';
const MOSS_CODEC_REVISION = 'ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae';
// 官方 MOSS ONNX CPU 版本及两个官方 Hugging Face 仓库：
// https://github.com/OpenMOSS/MOSS-TTS-Nano#onnx-cpu-version
const MOSS_TTS_ROOT = `https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX/resolve/${MOSS_TTS_REVISION}`;
const MOSS_CODEC_ROOT = `https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX/resolve/${MOSS_CODEC_REVISION}`;

const MOSS_ASSETS = [
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/browser_poc_manifest.json',
    url: `${MOSS_TTS_ROOT}/browser_poc_manifest.json`,
    sha256: '097d80e993dc29f0bae427590b4f77084a161cb578b50d82c29f455d5faa9eee',
    sizeBytes: 503_354,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/tokenizer.model',
    url: `${MOSS_TTS_ROOT}/tokenizer.model`,
    sha256: 'c353ee1479b536bf414c1b247f5542b6607fb8ae91320e5af1781fee200fddff',
    sizeBytes: 470_897,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/tts_browser_onnx_meta.json',
    url: `${MOSS_TTS_ROOT}/tts_browser_onnx_meta.json`,
    sha256: '3edf25232dcd0af3d061c837e9a968a39e2f8592e06777d740503c4f2244f95c',
    sizeBytes: 4_487,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/moss_tts_prefill.onnx',
    url: `${MOSS_TTS_ROOT}/moss_tts_prefill.onnx`,
    sha256: 'd56126dcd0574c2f15d98fc6b35eda68d0386b5bd9c5e38e28548d6f2ea8f3db',
    sizeBytes: 283_305,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/moss_tts_decode_step.onnx',
    url: `${MOSS_TTS_ROOT}/moss_tts_decode_step.onnx`,
    sha256: '698cbc2fc1c2feca16e5895614ed52bbb32ded10f236c076f477b2e69abf32d8',
    sizeBytes: 291_483,
  },
  {
    relativePath:
      'MOSS-TTS-Nano-100M-ONNX/moss_tts_local_fixed_sampled_frame.onnx',
    url: `${MOSS_TTS_ROOT}/moss_tts_local_fixed_sampled_frame.onnx`,
    sha256: '40cdb00efc171c450cf91468e01429caa41b0252222cd308e978f58fe354afa8',
    sizeBytes: 471_262,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/moss_tts_global_shared.data',
    url: `${MOSS_TTS_ROOT}/moss_tts_global_shared.data`,
    sha256: 'bce8312c3df6a44545302cae229b61054fe0672e0b252ba59cba47adeed831dc',
    sizeBytes: 440_813_568,
  },
  {
    relativePath: 'MOSS-TTS-Nano-100M-ONNX/moss_tts_local_shared.data',
    url: `${MOSS_TTS_ROOT}/moss_tts_local_shared.data`,
    sha256: 'bae7782032c0fb12490ab42afe009f87ae6c75a0f0596fc7b5c08e4d5ee93916',
    sizeBytes: 229_678_080,
  },
  {
    relativePath: 'MOSS-Audio-Tokenizer-Nano-ONNX/codec_browser_onnx_meta.json',
    url: `${MOSS_CODEC_ROOT}/codec_browser_onnx_meta.json`,
    sha256: '3e291c883bb7d11ff2fe8e964e3e495519760358859f35c951254c7741592731',
    sizeBytes: 17_036,
  },
  {
    relativePath:
      'MOSS-Audio-Tokenizer-Nano-ONNX/moss_audio_tokenizer_decode_full.onnx',
    url: `${MOSS_CODEC_ROOT}/moss_audio_tokenizer_decode_full.onnx`,
    sha256: '0fbbafe3fd4afa2a019af5c5ced204af6e2d1db044fa40f021525d2aee95b4ac',
    sizeBytes: 681_902,
  },
  {
    relativePath:
      'MOSS-Audio-Tokenizer-Nano-ONNX/moss_audio_tokenizer_decode_shared.data',
    url: `${MOSS_CODEC_ROOT}/moss_audio_tokenizer_decode_shared.data`,
    sha256: 'e69d52e0f4e84ca27850557ee54face46632d3a5a16c89bd246c7c408466dcad',
    sizeBytes: 44_198_912,
  },
] as const satisfies readonly TTSFileAsset[];

export const TTS_MODEL_CATALOG: readonly TTSModelCatalogItem[] = [
  {
    id: KOKORO_TTS_MODEL_ID,
    name: 'Kokoro Multi-Lang v1.0',
    language: 'multilingual',
    engine: 'sherpa-kokoro',
    format: 'ONNX',
    size: '382 MiB',
    recommended: false,
    requiredFiles: [
      'model.onnx',
      'voices.bin',
      'tokens.txt',
      'espeak-ng-data',
      'lexicon-us-en.txt',
      'lexicon-zh.txt',
    ],
    installation: {
      kind: 'archive',
      url: `${SHERPA_RELEASE_ROOT}/kokoro-multi-lang-v1_0.tar.bz2`,
      sha256:
        'c133d26353d776da730870dac7da07dbfc9a5e3bc80cc5e8e83ab6e823be7046',
    },
  },
  {
    id: MELO_TTS_MODEL_ID,
    name: 'MeloTTS Chinese-English',
    language: 'zh-en',
    engine: 'sherpa-vits',
    format: 'ONNX',
    size: '182 MiB',
    recommended: true,
    requiredFiles: [
      'model.onnx',
      'lexicon.txt',
      'tokens.txt',
      'dict',
      'phone.fst',
      'date.fst',
      'number.fst',
    ],
    installation: {
      kind: 'archive',
      url: `${SHERPA_RELEASE_ROOT}/vits-melo-tts-zh_en.tar.bz2`,
      sha256:
        'e58351ed7149f290a54534538badd4077cdbe6fddc964b24d0bee870415d1514',
    },
  },
  {
    id: MOSS_TTS_MODEL_ID,
    name: 'MOSS-TTS-Nano 100M',
    language: 'multilingual-20',
    engine: 'moss-onnx',
    format: 'ONNX',
    size: '684 MiB',
    recommended: false,
    requiredFiles: MOSS_ASSETS.map((asset) => asset.relativePath),
    installation: { kind: 'files', assets: MOSS_ASSETS },
  },
] as const;

export function getTTSModelCatalogItem(id: string): TTSModelCatalogItem {
  const item = TTS_MODEL_CATALOG.find((candidate) => candidate.id === id);
  if (!item) throw new Error('找不到 TTS 模型 / TTS model not found');
  return item;
}
