import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoteItem, WorkspaceController } from '../WorkspaceController';

/**
 * 录音播放条。
 *
 * 只有点了标题行的「播放」才会挂载，所以这里直接开始取音频，
 * 不再自带一个「录音」按钮——每条笔记下面常驻一个大盒子实在多余。
 */
export default function WorkspaceAudioPlayer({
  workspaceId,
  note,
}: {
  workspaceId: number;
  note: NoteItem;
}) {
  const { t } = useTranslation();
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  // 卸载时释放 blob URL；audioUrl 只会从空串变成一个值，放 ref 里
  // 是为了让清理函数不依赖 state 的最新值。
  const urlRef = useRef('');
  urlRef.current = audioUrl;
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new WorkspaceController();

    const load = async () => {
      try {
        const audio = await controller.getNoteAudio(workspaceId, note.id);
        if (cancelled) return;
        if (!audio) {
          setError(t('workspace.audio.errorMoved'));
          return;
        }
        const bytes = new Uint8Array(audio.bytes);
        const data = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        setAudioUrl(
          URL.createObjectURL(new Blob([data], { type: audio.mime_type })),
        );
      } catch (reason) {
        if (cancelled) return;
        setError(
          WorkspaceController.getErrorMessage(
            reason,
            t('workspace.audio.errorRead'),
          ),
        );
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, note.id, t]);

  if (error) {
    return <small className="workspace-audio-error">{error}</small>;
  }

  if (!audioUrl) {
    return (
      <span className="workspace-content-empty">
        {t('workspace.audio.loading')}
      </span>
    );
  }

  return (
    // 文件路径又长又没用，藏进 title
    <audio
      className="workspace-audio"
      controls
      // 是用户点「播放」才展开的，直接开始放
      // eslint-disable-next-line jsx-a11y/media-has-caption
      autoPlay
      preload="metadata"
      src={audioUrl}
      title={note.audio_relative_path ?? undefined}
    >
      <track kind="captions" />
    </audio>
  );
}
