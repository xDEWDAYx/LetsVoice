import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, Square } from 'lucide-react';
import type { Model } from '@shared/models/Model';
import ModelModule from './components/ModelModule';
import ModelSelect, { ModelOption } from './components/ModelSelect';
import { ModelIcons } from './components/ModelIcons';
import { getModelDescription } from './ModelDescription';
import { getModelTags } from './ModelTags';
import { buildModuleRuntimes } from './ModelRuntimes';
import {
  getPreferredSpeakerId,
  setPreferredSpeakerId,
} from '../../tts/TTSPreferences';
import useTTSPlayback from '../../tts/useTTSPlayback';
import ModelModuleSkeleton from './components/ModelModuleSkeleton';
import useModelManager from './useModelManager';
import './ModelManagerPage.css';

function toOptions(
  models: Model[],
  modelType: 'stt' | 'tts' | 'llm',
  recommendedId: string | undefined,
): ModelOption[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    meta: model.size,
    tags: getModelTags(model, modelType),
    description: getModelDescription(model, modelType),
    downloaded: model.downloaded,
    active: model.activated,
    recommended:
      model.id === recommendedId ||
      Boolean((model as { recommended?: boolean }).recommended),
  }));
}

/** 试听按钮的三种状态：生成中、播放中、可播放。 */
function renderPreviewIcon(loading: boolean, playing: boolean) {
  if (loading) return <RefreshCw className="icon spin" size={16} />;
  if (playing) return <Square className="icon" size={16} />;
  return <Play className="icon" size={16} />;
}

// 保持命名导出，与同目录其他模块一致。
export function ModelManagerPage() {
  const { t } = useTranslation();
  const manager = useModelManager();
  const playback = useTTSPlayback();
  const [speakerId, setSpeakerId] = useState<string | null>(null);

  const transcription = manager.runtime?.transcription;
  const parakeet = manager.runtime?.parakeetTranscription;
  const languageModel = manager.runtime?.languageModel;
  const speech = manager.runtime?.speechSynthesis;

  useEffect(() => {
    if (speech?.activeModelId && speech.speakers.length) {
      setSpeakerId(
        getPreferredSpeakerId(speech.activeModelId, speech.speakers),
      );
    } else {
      setSpeakerId(null);
    }
  }, [speech?.activeModelId, speech?.speakers]);

  const isModuleBusy = (module: 'stt' | 'tts' | 'embedding' | 'llm') =>
    manager.busyKeys.some((key) => key.startsWith(`${module}:`));
  const runtimes = buildModuleRuntimes(manager.runtime, manager.embedding, {
    installWhisper: manager.installWhisper,
    installFfmpeg: manager.installFfmpeg,
    installOllama: manager.installOllama,
    uninstall: manager.uninstallRuntime,
  });

  const sttOptions = toOptions(
    manager.sttModels,
    'stt',
    manager.recommendation?.stt?.id,
  );
  const llmOptions = toOptions(
    manager.llmModels,
    'llm',
    manager.recommendation?.llm?.id,
  );
  const ttsOptions = toOptions(manager.ttsModels, 'tts', undefined);

  const speakerOptions: ModelOption[] = (speech?.speakers ?? []).map(
    (speaker) => ({
      id: String(speaker.id),
      name: speaker.label,
      tags: speaker.language ? [speaker.language] : [],
      downloaded: true,
      active: speaker.id === speakerId,
    }),
  );

  const embeddingOptions: ModelOption[] = manager.embedding
    ? [
        {
          id: manager.embedding.modelName,
          name: manager.embedding.modelName,
          tags: [
            t('modelManager.tags.multilingual'),
            t('modelManager.tags.search'),
          ],
          description: t('modelManager.embedding.desc'),
          downloaded: manager.embedding.installed,
          active: manager.embedding.installed,
          recommended: true,
        },
      ]
    : [];

  const selectSpeaker = (id: string) => {
    if (!speech?.activeModelId) return;
    setSpeakerId(id);
    setPreferredSpeakerId(speech.activeModelId, id);
  };

  return (
    <div className="model-manager-page">
      <header className="model-manager-header">
        <h1>{t('modelManager.title')}</h1>
        <button
          aria-label={t('modelManager.refresh')}
          className="model-icon-button"
          onClick={() => manager.refreshAll()}
          title={t('modelManager.refresh')}
          type="button"
        >
          {ModelIcons.refresh}
        </button>
      </header>

      {/* 加载中只挂骨架，不要把真正的模块树用 hidden 藏在后面 ——
          hidden 只是视觉隐藏，React 该建的 DOM 一个都不少，
          切换到本页的那一帧就得把整棵树渲染完，卡顿就是这么来的。 */}
      {manager.initialLoading ? (
        <ModelModuleSkeleton />
      ) : (
        <div className="model-module-list anim-stagger">
          <ModelModule
            actions={null}
            busy={isModuleBusy('stt')}
            error={manager.errors.stt}
            hint={t('modelManager.stt.hint')}
            icon="stt"
            name="STT"
            progress={manager.progress.stt}
            ready={Boolean(transcription?.ready || parakeet?.ready)}
            readyHint={
              transcription?.ready || parakeet?.ready
                ? t('modelManager.status.ready')
                : t('modelManager.status.notReady')
            }
            runtimes={runtimes.stt}
          >
            <ModelSelect
              label={t('modelManager.stt.label')}
              onDelete={manager.stt.remove}
              onDownload={manager.stt.download}
              onSelect={manager.stt.select}
              options={sttOptions}
              operations={manager.modelOperations.stt ?? {}}
              placeholder={t('modelManager.select.placeholder')}
            />
          </ModelModule>

          <ModelModule
            busy={isModuleBusy('tts')}
            error={manager.errors.tts}
            hint={t('modelManager.tts.hint')}
            icon="tts"
            name="TTS"
            progress={manager.progress.tts}
            ready={Boolean(speech?.runtimeReady)}
            readyHint={
              speech?.runtimeReady
                ? t('modelManager.tts.ready')
                : t('modelManager.status.notReady')
            }
            runtimes={runtimes.tts}
            actions={
              speech?.runtimeReady && speakerId !== null ? (
                <button
                  aria-label={
                    playback.playing
                      ? t('modelManager.tts.stopPreview')
                      : t('modelManager.tts.startPreview')
                  }
                  className="model-icon-button"
                  disabled={playback.loading}
                  onClick={() =>
                    playback.playing
                      ? playback.stop()
                      : playback.speak(
                          t('modelManager.tts.previewText'),
                          speakerId,
                        )
                  }
                  title={
                    playback.playing
                      ? t('modelManager.tts.stopPreview')
                      : t('modelManager.tts.startPreview')
                  }
                  type="button"
                >
                  {renderPreviewIcon(playback.loading, playback.playing)}
                </button>
              ) : null
            }
          >
            <div className="model-selectors">
              <ModelSelect
                label={t('modelManager.tts.label')}
                onDelete={manager.tts.remove}
                onDownload={manager.tts.download}
                onSelect={manager.tts.select}
                options={ttsOptions}
                operations={manager.modelOperations.tts ?? {}}
                placeholder={t('modelManager.select.placeholder')}
              />
              {speech?.runtimeReady && speakerOptions.length > 0 && (
                <ModelSelect
                  label={t('modelManager.tts.roleLabel')}
                  onDelete={null}
                  onDownload={null}
                  onSelect={selectSpeaker}
                  options={speakerOptions}
                  operations={{}}
                  placeholder={t('modelManager.tts.rolePlaceholder')}
                />
              )}
            </div>
          </ModelModule>

          <ModelModule
            actions={null}
            busy={isModuleBusy('embedding')}
            error={manager.errors.embedding}
            hint={t('modelManager.embedding.hint')}
            icon="embedding"
            name="Embedding"
            progress={manager.progress.embedding}
            ready={Boolean(manager.embedding?.installed)}
            readyHint={
              manager.embedding?.installed
                ? t('modelManager.embedding.installed')
                : t('modelManager.embedding.notInstalled')
            }
            runtimes={runtimes.embedding}
          >
            <ModelSelect
              label={t('modelManager.embedding.label')}
              onDelete={null}
              onDownload={manager.installEmbedding}
              onSelect={() => {}}
              options={embeddingOptions}
              operations={
                manager.embedding && isModuleBusy('embedding')
                  ? {
                      [manager.embedding.modelName]: {
                        busy: true,
                        progress: null,
                        error: '',
                      },
                    }
                  : {}
              }
              placeholder={t('modelManager.embedding.placeholder')}
            />
          </ModelModule>

          <ModelModule
            actions={null}
            busy={isModuleBusy('llm')}
            error={manager.errors.llm}
            hint={t('modelManager.llm.hint')}
            icon="llm"
            name="LLM"
            progress={manager.progress.llm}
            ready={Boolean(languageModel?.runtimeReady)}
            readyHint={
              languageModel?.runtimeReady
                ? t('modelManager.llm.ready')
                : t('modelManager.status.notReady')
            }
            runtimes={runtimes.llm}
          >
            <ModelSelect
              label={t('modelManager.llm.label')}
              onDelete={manager.llm.remove}
              onDownload={manager.llm.download}
              onSelect={manager.llm.select}
              options={llmOptions}
              operations={manager.modelOperations.llm ?? {}}
              placeholder={t('modelManager.select.placeholder')}
            />
          </ModelModule>
        </div>
      )}

      {playback.error && (
        <p className="model-manager-note" role="alert">
          {playback.error}
        </p>
      )}
    </div>
  );
}
