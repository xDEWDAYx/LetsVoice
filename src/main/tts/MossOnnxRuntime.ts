import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { requireAtRuntime } from '../runtime/RuntimeRequire';
import { GeneratedTTSAudio, TTSModelEngine } from './TTSGeneratedAudio';

type TensorData =
  | Float32Array
  | Int32Array
  | BigInt64Array
  | Uint8Array
  | readonly number[];
type OrtTensor = { data: TensorData; dims: readonly number[] };
type OrtSession = {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?(): Promise<void> | void;
};
type OrtModule = {
  Tensor: new (
    type: 'float32' | 'int32',
    data: Float32Array | Int32Array,
    dims: readonly number[],
  ) => OrtTensor;
  InferenceSession: {
    create(modelPath: string, options: unknown): Promise<OrtSession>;
  };
};
type SentencePieceProcessor = {
  load(modelPath: string): Promise<void>;
  encodeIds(text: string): number[];
};
type SentencePieceModule = {
  SentencePieceProcessor: new () => SentencePieceProcessor;
};

type MossVoice = {
  voice: string;
  prompt_audio_codes: number[][];
};
type MossManifest = {
  model_files: {
    tts_meta: string;
    codec_meta: string;
    tokenizer_model: string;
  };
  tts_config: {
    n_vq: number;
    audio_pad_token_id: number;
    audio_start_token_id: number;
    audio_end_token_id: number;
    audio_user_slot_token_id: number;
    audio_assistant_slot_token_id: number;
  };
  prompt_templates: {
    user_prompt_prefix_token_ids: number[];
    user_prompt_after_reference_token_ids: number[];
    assistant_prompt_prefix_token_ids: number[];
  };
  generation_defaults: { max_new_frames: number };
  builtin_voices: MossVoice[];
};
type MossTtsMeta = {
  files: {
    prefill: string;
    decode_step: string;
    local_fixed_sampled_frame: string;
  };
  model_config: { audio_codebook_sizes: number[] };
  onnx: {
    prefill_output_names: string[];
    decode_input_names: string[];
    decode_output_names: string[];
  };
};
type MossCodecMeta = {
  files: { decode_full: string };
  codec_config: {
    sample_rate: number;
    channels: number;
    num_quantizers: number;
  };
};

type MossSessions = {
  prefill: OrtSession;
  decode: OrtSession;
  localFixed: OrtSession;
  codecDecode: OrtSession;
};

const MAX_TEXT_TOKENS_PER_CHUNK = 75;
const MAX_RANDOM = 0.99999994;

/**
 * MOSS 的固定采样 CPU 路径，按 Apache-2.0 官方实现移植：
 * https://github.com/OpenMOSS/MOSS-TTS-Nano/blob/cc7bdf19c7639c0870dab22045a33b442760f6be/ort_cpu_runtime.py
 */
export default class MossOnnxRuntime implements TTSModelEngine {
  private readonly ort: OrtModule;

  private readonly tokenizer: SentencePieceProcessor;

  private constructor(
    private readonly modelDir: string,
    private readonly manifest: MossManifest,
    private readonly ttsMeta: MossTtsMeta,
    private readonly codecMeta: MossCodecMeta,
    private sessions: MossSessions | null,
    ort: OrtModule,
    tokenizer: SentencePieceProcessor,
  ) {
    this.ort = ort;
    this.tokenizer = tokenizer;
  }

  public static async create(modelDir: string): Promise<MossOnnxRuntime> {
    const ttsDir = path.join(modelDir, 'MOSS-TTS-Nano-100M-ONNX');
    const manifest = await MossOnnxRuntime.readJson<MossManifest>(
      path.join(ttsDir, 'browser_poc_manifest.json'),
    );
    const ttsMetaPath = path.resolve(ttsDir, manifest.model_files.tts_meta);
    const codecMetaPath = path.resolve(ttsDir, manifest.model_files.codec_meta);
    const [ttsMeta, codecMeta] = await Promise.all([
      MossOnnxRuntime.readJson<MossTtsMeta>(ttsMetaPath),
      MossOnnxRuntime.readJson<MossCodecMeta>(codecMetaPath),
    ]);
    const ort = MossOnnxRuntime.requireOrt();
    const sentencePiece = MossOnnxRuntime.requireSentencePiece();
    const tokenizer = new sentencePiece.SentencePieceProcessor();
    await tokenizer.load(
      path.resolve(ttsDir, manifest.model_files.tokenizer_model),
    );
    const options = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: Math.max(1, Math.min(os.cpus().length - 1, 4)),
      interOpNumThreads: 1,
    };
    const ttsModelDir = path.dirname(ttsMetaPath);
    const codecModelDir = path.dirname(codecMetaPath);

    // 顺序创建会话，避免四个大模型同时解析造成峰值内存叠加。
    const prefill = await ort.InferenceSession.create(
      path.join(ttsModelDir, ttsMeta.files.prefill),
      options,
    );
    const decode = await ort.InferenceSession.create(
      path.join(ttsModelDir, ttsMeta.files.decode_step),
      options,
    );
    const localFixed = await ort.InferenceSession.create(
      path.join(ttsModelDir, ttsMeta.files.local_fixed_sampled_frame),
      options,
    );
    const codecDecode = await ort.InferenceSession.create(
      path.join(codecModelDir, codecMeta.files.decode_full),
      options,
    );
    return new MossOnnxRuntime(
      modelDir,
      manifest,
      ttsMeta,
      codecMeta,
      { prefill, decode, localFixed, codecDecode },
      ort,
      tokenizer,
    );
  }

  // MOSS 官方 ONNX 导出不提供语速输入，实现可安全忽略统一接口的第三个参数。
  public async generate(
    text: string,
    speakerId: string,
  ): Promise<GeneratedTTSAudio> {
    if (!this.sessions) throw new Error('MOSS TTS 引擎已释放');
    const voice = this.manifest.builtin_voices.find(
      (candidate) => candidate.voice === speakerId,
    );
    if (!voice) throw new Error('MOSS 官方内置音色不存在');
    const chunks = this.splitText(text, MAX_TEXT_TOKENS_PER_CHUNK);
    const allChannels = Array.from(
      { length: this.codecMeta.codec_config.channels },
      () => [] as Float32Array[],
    );

    // 分句是模型内部的非流式生成，所有句子完成后才交给 Renderer 播放。
    // eslint-disable-next-line no-restricted-syntax
    for (const [index, chunk] of chunks.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const generated = await this.generateChunk(chunk, voice);
      generated.forEach((channel, channelIndex) =>
        allChannels[channelIndex].push(channel),
      );
      if (index < chunks.length - 1) {
        const pauseSeconds = /\s/.test(chunk) ? 0.4 : 0.24;
        const pause = new Float32Array(
          Math.round(this.codecMeta.codec_config.sample_rate * pauseSeconds),
        );
        allChannels.forEach((channel) => channel.push(pause));
      }
    }

    const channels = allChannels.map(MossOnnxRuntime.concatFloat32);
    MossOnnxRuntime.normalizePeak(channels);
    if (!channels.length || !channels[0].length) {
      throw new Error('MOSS TTS 没有返回音频');
    }
    return { sampleRate: this.codecMeta.codec_config.sample_rate, channels };
  }

  public dispose(): void {
    const { sessions } = this;
    this.sessions = null;
    if (!sessions) return;
    Object.values(sessions).forEach((session) => {
      Promise.resolve(session.release?.()).catch(() => undefined);
    });
  }

  private async generateChunk(
    text: string,
    voice: MossVoice,
  ): Promise<Float32Array[]> {
    const { sessions } = this;
    if (!sessions) throw new Error('MOSS TTS 引擎已释放');
    const requestRows = this.buildRequestRows(
      voice.prompt_audio_codes,
      this.tokenizer.encodeIds(text),
    );
    const rowWidth = this.manifest.tts_config.n_vq + 1;
    const inputIds = new Int32Array(requestRows.length * rowWidth);
    requestRows.forEach((row, rowIndex) =>
      inputIds.set(row, rowIndex * rowWidth),
    );
    const attentionMask = new Int32Array(requestRows.length).fill(1);
    const prefill = await sessions.prefill.run({
      input_ids: this.tensorInt32(inputIds, [1, requestRows.length, rowWidth]),
      attention_mask: this.tensorInt32(attentionMask, [1, requestRows.length]),
    });
    let globalHidden = this.lastHidden(prefill.global_hidden);
    let pastValidLength = requestRows.length;
    let past = Object.fromEntries(
      this.ttsMeta.onnx.prefill_output_names
        .slice(1)
        .map((outputName) => [
          outputName.replace('present_', 'past_'),
          prefill[outputName],
        ]),
    );
    const previousTokens = Array.from(
      { length: this.manifest.tts_config.n_vq },
      () => new Set<number>(),
    );
    const frames: number[][] = [];
    const random = MossOnnxRuntime.seededRandom(1234);

    for (
      let step = 0;
      step < this.manifest.generation_defaults.max_new_frames;
      step += 1
    ) {
      // 每一帧依赖上一帧的 KV cache，必须严格顺序生成。
      // eslint-disable-next-line no-await-in-loop
      const { shouldContinue, frame } = await this.sampleFrame(
        globalHidden,
        previousTokens,
        random,
      );
      if (!shouldContinue) break;
      frames.push(frame);
      frame.forEach((token, channel) => previousTokens[channel].add(token));

      const nextRow = new Int32Array(rowWidth).fill(
        this.manifest.tts_config.audio_pad_token_id,
      );
      nextRow[0] = this.manifest.tts_config.audio_assistant_slot_token_id;
      frame.forEach((token, index) => {
        nextRow[index + 1] = token;
      });
      const feeds: Record<string, OrtTensor> = {
        input_ids: this.tensorInt32(nextRow, [1, 1, rowWidth]),
        past_valid_lengths: this.tensorInt32(Int32Array.of(pastValidLength), [
          1,
        ]),
      };
      const currentPast = past;
      this.ttsMeta.onnx.decode_input_names.slice(2).forEach((inputName) => {
        feeds[inputName] = currentPast[inputName];
      });
      // eslint-disable-next-line no-await-in-loop
      const decoded = await sessions.decode.run(feeds);
      globalHidden = this.lastHidden(decoded.global_hidden);
      pastValidLength += 1;
      past = Object.fromEntries(
        this.ttsMeta.onnx.decode_output_names
          .slice(1)
          .map((outputName) => [
            outputName.replace('present_', 'past_'),
            decoded[outputName],
          ]),
      );
    }

    if (!frames.length) return [];
    const frameData = new Int32Array(
      frames.length * this.codecMeta.codec_config.num_quantizers,
    );
    frames.forEach((frame, index) =>
      frameData.set(
        frame.slice(0, this.codecMeta.codec_config.num_quantizers),
        index * this.codecMeta.codec_config.num_quantizers,
      ),
    );
    const decodedAudio = await sessions.codecDecode.run({
      audio_codes: this.tensorInt32(frameData, [
        1,
        frames.length,
        this.codecMeta.codec_config.num_quantizers,
      ]),
      audio_code_lengths: this.tensorInt32(Int32Array.of(frames.length), [1]),
    });
    const audioLength = Number(decodedAudio.audio_lengths.data[0]);
    const { audio } = decodedAudio;
    const samples = audio.data as Float32Array;
    const totalPerChannel = audio.dims[audio.dims.length - 1];
    return Array.from(
      { length: this.codecMeta.codec_config.channels },
      (_unused, channel) =>
        Float32Array.from(
          samples.subarray(
            channel * totalPerChannel,
            channel * totalPerChannel + audioLength,
          ),
        ),
    );
  }

  private async sampleFrame(
    globalHidden: OrtTensor,
    previousTokens: Set<number>[],
    random: () => number,
  ): Promise<{ shouldContinue: boolean; frame: number[] }> {
    if (!this.sessions) throw new Error('MOSS TTS 引擎已释放');
    const codebookSize = this.ttsMeta.model_config.audio_codebook_sizes[0];
    const mask = new Int32Array(this.manifest.tts_config.n_vq * codebookSize);
    previousTokens.forEach((tokens, channel) => {
      tokens.forEach((token) => {
        if (token >= 0 && token < codebookSize) {
          mask[channel * codebookSize + token] = 1;
        }
      });
    });
    const audioRandom = Float32Array.from(
      { length: this.manifest.tts_config.n_vq },
      () => Math.min(MAX_RANDOM, Math.max(0, random())),
    );
    const output = await this.sessions.localFixed.run({
      global_hidden: globalHidden,
      repetition_seen_mask: this.tensorInt32(mask, [
        1,
        this.manifest.tts_config.n_vq,
        codebookSize,
      ]),
      assistant_random_u: this.tensorFloat32(
        Float32Array.of(Math.min(MAX_RANDOM, Math.max(0, random()))),
        [1],
      ),
      audio_random_u: this.tensorFloat32(audioRandom, [
        1,
        this.manifest.tts_config.n_vq,
      ]),
    });
    return {
      shouldContinue: Number(output.should_continue.data[0]) !== 0,
      frame: Array.from(output.frame_token_ids.data as Int32Array, Number),
    };
  }

  private buildRequestRows(
    promptAudioCodes: number[][],
    textTokenIds: number[],
  ): number[][] {
    const config = this.manifest.tts_config;
    const prefix = [
      ...this.manifest.prompt_templates.user_prompt_prefix_token_ids,
      config.audio_start_token_id,
    ];
    const suffix = [
      config.audio_end_token_id,
      ...this.manifest.prompt_templates.user_prompt_after_reference_token_ids,
      ...textTokenIds,
      ...this.manifest.prompt_templates.assistant_prompt_prefix_token_ids,
      config.audio_start_token_id,
    ];
    return [
      ...prefix.map((token) => this.buildTextRow(token)),
      ...promptAudioCodes.map((codes) => {
        const row = new Array(config.n_vq + 1).fill(config.audio_pad_token_id);
        row[0] = config.audio_user_slot_token_id;
        codes.slice(0, config.n_vq).forEach((token, index) => {
          row[index + 1] = token;
        });
        return row;
      }),
      ...suffix.map((token) => this.buildTextRow(token)),
    ];
  }

  private buildTextRow(token: number): number[] {
    const row = new Array(this.manifest.tts_config.n_vq + 1).fill(
      this.manifest.tts_config.audio_pad_token_id,
    );
    row[0] = token;
    return row;
  }

  private splitText(text: string, maxTokens: number): string[] {
    let remaining = text.replace(/\s+/g, ' ').trim();
    const chunks: string[] = [];
    const boundaries = new Set('。！？；，、.!?;, \n'.split(''));
    while (remaining) {
      if (this.tokenizer.encodeIds(remaining).length <= maxTokens) {
        chunks.push(remaining);
        break;
      }
      let low = 1;
      let high = remaining.length;
      let best = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (
          this.tokenizer.encodeIds(remaining.slice(0, middle).trim()).length <=
          maxTokens
        ) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      let cut = best;
      for (let index = best - 1; index >= Math.max(0, best - 25); index -= 1) {
        if (boundaries.has(remaining[index])) {
          cut = index + 1;
          break;
        }
      }
      const chunk = remaining.slice(0, cut).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(cut).trim();
    }
    return chunks;
  }

  private lastHidden(tensor: OrtTensor): OrtTensor {
    const hiddenSize = tensor.dims[tensor.dims.length - 1];
    const data = tensor.data as Float32Array;
    return this.tensorFloat32(
      Float32Array.from(data.subarray(data.length - hiddenSize)),
      [1, hiddenSize],
    );
  }

  private tensorInt32(data: Int32Array, dims: readonly number[]): OrtTensor {
    return new this.ort.Tensor('int32', data, dims);
  }

  private tensorFloat32(
    data: Float32Array,
    dims: readonly number[],
  ): OrtTensor {
    return new this.ort.Tensor('float32', data, dims);
  }

  private static concatFloat32(chunks: Float32Array[]): Float32Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  private static normalizePeak(channels: Float32Array[]): void {
    let peak = 0;
    channels.forEach((channel) =>
      channel.forEach((sample) => {
        if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
      }),
    );
    if (peak <= 0.98) return;
    const scale = 0.98 / peak;
    channels.forEach((channel) => {
      for (let index = 0; index < channel.length; index += 1) {
        channel[index] *= scale;
      }
    });
  }

  private static seededRandom(seed: number): () => number {
    let state = Math.abs(Math.trunc(seed)) % 4_294_967_296;
    return () => {
      state = (Math.imul(1_664_525, state) + 1_013_904_223) % 4_294_967_296;
      if (state < 0) state += 4_294_967_296;
      return state / 4_294_967_296;
    };
  }

  private static async readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  }

  private static requireOrt(): OrtModule {
    // ONNX Runtime Node 的官方 CPU 包支持 Windows x64 与 macOS x64/arm64：
    // https://onnxruntime.ai/docs/get-started/with-javascript/node.html
    return requireAtRuntime<OrtModule>('onnxruntime-node');
  }

  private static requireSentencePiece(): SentencePieceModule {
    return requireAtRuntime<SentencePieceModule>('@sctg/sentencepiece-js');
  }
}
