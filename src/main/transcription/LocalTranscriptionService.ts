import {
  isWhisperLanguage,
  LanguageDetectionResult,
  TranscriptionResult,
} from '@shared/types/TranscriptionTypes';
import { STTModelManager } from '../AI-module/STTModelManager';
import { PARAKEET_ENGINE } from './STTModelCatalog';
import ParakeetTranscriptionService from './ParakeetTranscriptionService';
import TranscriptionSourceResolver from './TranscriptionSourceResolver';
import WhisperTranscriptionService, {
  TranscriptionOptions,
} from './WhisperTranscriptionService';

export type TranscriptionBackend = {
  transcribe(
    source: unknown,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
};

type WhisperBackend = TranscriptionBackend & {
  detectLanguage(
    source: unknown,
    signal?: AbortSignal,
  ): Promise<LanguageDetectionResult>;
};

/** 根据当前激活模型选择 Whisper 或 Parakeet，IPC 无需知道引擎细节。 */
export default class LocalTranscriptionService implements TranscriptionBackend {
  private readonly models: STTModelManager;

  private readonly whisper: WhisperBackend;

  private readonly parakeet: TranscriptionBackend;

  public constructor(
    models = new STTModelManager(),
    whisper: WhisperBackend = new WhisperTranscriptionService(),
    parakeet: TranscriptionBackend = new ParakeetTranscriptionService(),
  ) {
    this.models = models;
    this.whisper = whisper;
    this.parakeet = parakeet;
  }

  public transcribe(
    source: unknown,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const activeModel = this.models.getActivatedModel();
    if (!activeModel) {
      throw new Error('请先下载并激活一个 STT 模型');
    }

    const normalizedSource =
      TranscriptionSourceResolver.normalizeSource(source);
    const requestedLanguage = normalizedSource.language ?? 'auto';
    const modelLanguage = activeModel.language;

    if (
      modelLanguage !== 'multilingual' &&
      requestedLanguage !== 'auto' &&
      requestedLanguage !== modelLanguage
    ) {
      throw new Error(
        `当前 STT 模型仅支持 ${modelLanguage}。请在模型管理中切换到 multilingual Whisper 模型后再转录其他语言。`,
      );
    }

    const effectiveSource =
      modelLanguage !== 'multilingual' && requestedLanguage === 'auto'
        ? { ...normalizedSource, language: modelLanguage }
        : normalizedSource;

    if (activeModel.engine === PARAKEET_ENGINE) {
      return this.parakeet.transcribe(effectiveSource, options);
    }
    if (activeModel.engine === 'whisper.cpp') {
      return this.whisper.transcribe(effectiveSource, options);
    }
    throw new Error(`不支持的 STT 引擎: ${activeModel.engine}`);
  }

  public detectLanguage(
    source: unknown,
    signal?: AbortSignal,
  ): Promise<LanguageDetectionResult> {
    const activeModel = this.models.getActivatedModel();
    if (!activeModel) {
      throw new Error('请先下载并激活一个 STT 模型');
    }

    if (activeModel.language !== 'multilingual') {
      if (!isWhisperLanguage(activeModel.language)) {
        throw new Error(
          '当前 STT 模型不支持自动语言检测 / Active STT model cannot auto-detect language',
        );
      }
      return Promise.resolve({
        language: activeModel.language,
        confidence: 1,
        source: 'model-fixed',
      });
    }

    if (activeModel.engine !== 'whisper.cpp') {
      throw new Error(
        '当前 STT 引擎不支持自动语言检测 / Active STT engine cannot auto-detect language',
      );
    }

    return this.whisper.detectLanguage(source, signal);
  }
}
