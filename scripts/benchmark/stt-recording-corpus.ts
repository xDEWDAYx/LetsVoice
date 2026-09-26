/**
 * 真人 STT 录音 → 原文 的映射表。
 *
 * 用户按 stt-recording-protocol.md 在手机上连续录了 56 段
 * （docs/testing/datasets/stt-human-recordings/*.m4a），
 * 文件名是录音 App 自己编的序号，不带任何可识别的 ID。映射关系是靠听写比对反推出来的：
 * 用 whisper-large-v1 转写若干锚点文件，跟 tts-corpus.json 里的候选原文比对内容，
 * 确认了三段边界和一处例外（第 3 段录音把两条文本连着念完才停止，没有分开录）。
 *
 * 不要在没有重新核对内容的情况下改这份映射 —— 位置和文件大小只是辅助线索，
 * 真正确认靠的是转写内容本身。
 */

export type RecordingSegment = 'A' | 'B' | 'C';

export type RecordingCase = {
  /** wav16k/ 下的文件名（已由 m4a 转成 16k 单声道 wav）。 */
  file: string;
  segment: RecordingSegment;
  /**
   * 对应 tts-corpus.json 的 case id。大多数是一个文件对一个 id；
   * rec_03 例外，一个文件里连续念了两条文本，数组长度为 2。
   */
  ids: string[];
  /**
   * A/C 段是照原文逐字读的，用严格 CER 打分才有意义；
   * B 段是看一眼原文后合上、用自己的话复述的，只用「内容覆盖率」打分，
   * 不计 CER —— 复述本来就不要求逐字一致，用 CER 打分只会产生误导性的高错误率。
   */
  scoring: 'strict' | 'paraphrase';
};

export const RECORDING_CASES: RecordingCase[] = [
  { file: 'rec_01.wav', segment: 'A', ids: ['zh_short'], scoring: 'strict' },
  { file: 'rec_02.wav', segment: 'A', ids: ['zh_basic_02'], scoring: 'strict' },
  // 用户连着念完了 zh_basic_03 和 zh_numeric_01 才停止录音，没有分成两段。
  {
    file: 'rec_03.wav',
    segment: 'A',
    ids: ['zh_basic_03', 'zh_numeric_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_04.wav',
    segment: 'A',
    ids: ['zh_numeric_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_05.wav',
    segment: 'A',
    ids: ['zh_datetime_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_06.wav',
    segment: 'A',
    ids: ['zh_datetime_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_07.wav',
    segment: 'A',
    ids: ['zh_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_08.wav',
    segment: 'A',
    ids: ['zh_acronym_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_09.wav',
    segment: 'A',
    ids: ['zh_technical_01'],
    scoring: 'strict',
  },
  { file: 'rec_10.wav', segment: 'A', ids: ['zh_punct_01'], scoring: 'strict' },
  { file: 'rec_11.wav', segment: 'A', ids: ['zh_long_01'], scoring: 'strict' },
  { file: 'rec_12.wav', segment: 'A', ids: ['en_short'], scoring: 'strict' },
  { file: 'rec_13.wav', segment: 'A', ids: ['en_basic_02'], scoring: 'strict' },
  { file: 'rec_14.wav', segment: 'A', ids: ['en_basic_03'], scoring: 'strict' },
  {
    file: 'rec_15.wav',
    segment: 'A',
    ids: ['en_numeric_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_16.wav',
    segment: 'A',
    ids: ['en_numeric_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_17.wav',
    segment: 'A',
    ids: ['en_datetime_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_18.wav',
    segment: 'A',
    ids: ['en_datetime_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_19.wav',
    segment: 'A',
    ids: ['en_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_20.wav',
    segment: 'A',
    ids: ['en_acronym_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_21.wav',
    segment: 'A',
    ids: ['en_technical_01'],
    scoring: 'strict',
  },
  { file: 'rec_22.wav', segment: 'A', ids: ['en_punct_01'], scoring: 'strict' },
  { file: 'rec_23.wav', segment: 'A', ids: ['en_long_01'], scoring: 'strict' },
  { file: 'rec_24.wav', segment: 'A', ids: ['zh_en_mixed'], scoring: 'strict' },
  {
    file: 'rec_25.wav',
    segment: 'A',
    ids: ['mixed_basic_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_26.wav',
    segment: 'A',
    ids: ['mixed_basic_03'],
    scoring: 'strict',
  },
  {
    file: 'rec_27.wav',
    segment: 'A',
    ids: ['mixed_numeric_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_28.wav',
    segment: 'A',
    ids: ['mixed_numeric_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_29.wav',
    segment: 'A',
    ids: ['mixed_datetime_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_30.wav',
    segment: 'A',
    ids: ['mixed_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_31.wav',
    segment: 'A',
    ids: ['mixed_acronym_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_32.wav',
    segment: 'A',
    ids: ['mixed_technical_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_33.wav',
    segment: 'A',
    ids: ['mixed_technical_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_34.wav',
    segment: 'A',
    ids: ['mixed_punct_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_35.wav',
    segment: 'A',
    ids: ['mixed_long_01'],
    scoring: 'strict',
  },

  // B 段：看一眼原文，合上后用自己的话复述。只用内容覆盖率打分。
  {
    file: 'rec_36.wav',
    segment: 'B',
    ids: ['zh_basic_02'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_37.wav',
    segment: 'B',
    ids: ['zh_numeric_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_38.wav',
    segment: 'B',
    ids: ['zh_datetime_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_39.wav',
    segment: 'B',
    ids: ['zh_technical_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_40.wav',
    segment: 'B',
    ids: ['en_basic_02'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_41.wav',
    segment: 'B',
    ids: ['en_numeric_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_42.wav',
    segment: 'B',
    ids: ['en_datetime_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_43.wav',
    segment: 'B',
    ids: ['en_technical_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_44.wav',
    segment: 'B',
    ids: ['zh_en_mixed'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_45.wav',
    segment: 'B',
    ids: ['mixed_numeric_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_46.wav',
    segment: 'B',
    ids: ['mixed_datetime_01'],
    scoring: 'paraphrase',
  },
  {
    file: 'rec_47.wav',
    segment: 'B',
    ids: ['mixed_technical_01'],
    scoring: 'paraphrase',
  },

  // C 段：背景有轻度噪音，照原文逐字读。跟 A 段一样用严格 CER。
  { file: 'rec_48.wav', segment: 'C', ids: ['zh_short'], scoring: 'strict' },
  {
    file: 'rec_49.wav',
    segment: 'C',
    ids: ['zh_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_50.wav',
    segment: 'C',
    ids: ['zh_acronym_01'],
    scoring: 'strict',
  },
  { file: 'rec_51.wav', segment: 'C', ids: ['en_short'], scoring: 'strict' },
  {
    file: 'rec_52.wav',
    segment: 'C',
    ids: ['en_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_53.wav',
    segment: 'C',
    ids: ['en_acronym_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_54.wav',
    segment: 'C',
    ids: ['mixed_basic_02'],
    scoring: 'strict',
  },
  {
    file: 'rec_55.wav',
    segment: 'C',
    ids: ['mixed_proper_01'],
    scoring: 'strict',
  },
  {
    file: 'rec_56.wav',
    segment: 'C',
    ids: ['mixed_acronym_01'],
    scoring: 'strict',
  },
];

/**
 * 映射验证记录：用 whisper-large-v1 实际转写下列文件并核对内容后确认，
 * 不是单靠文件顺序或大小推断。覆盖了三段的起止边界和三条长文本的位置。
 */
export const VERIFIED_ANCHORS = [
  'rec_01',
  'rec_02',
  'rec_03',
  'rec_04',
  'rec_05',
  'rec_06',
  'rec_07',
  'rec_08',
  'rec_09',
  'rec_10',
  'rec_11',
  'rec_12',
  'rec_13',
  'rec_14',
  'rec_22',
  'rec_23',
  'rec_24',
  'rec_25',
  'rec_34',
  'rec_36',
  'rec_37',
  'rec_41',
  'rec_47',
  'rec_48',
  'rec_52',
  'rec_56',
];
