import { useCallback, useEffect, useRef, useState } from 'react';
import type { TTSAudioResult } from '@shared/types/TTSRuntimeTypes';
import TTSAudioPlayer from './TTSAudioPlayer';
import { getPreferredSpeakerId } from './TTSPreferences';
import { playTTSChunks, splitTTSChunks } from './TTSPlaybackPipeline';

export default function useTTSPlayback() {
  const player = useRef<TTSAudioPlayer | null>(null);
  const requestId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    player.current = new TTSAudioPlayer();
    return () => {
      requestId.current += 1;
      player.current?.stop();
    };
  }, []);

  const speak = useCallback(
    async (text: string, speakerId?: string, speed = 1) => {
      const currentRequest = requestId.current + 1;
      requestId.current = currentRequest;
      try {
        setLoading(true);
        setError('');
        player.current?.stop();
        setPlaying(false);
        const status = await window.electron.tts.getStatus();
        const selectedSpeakerId =
          speakerId ??
          (status.activeModelId
            ? getPreferredSpeakerId(status.activeModelId, status.speakers)
            : undefined);
        const chunks = splitTTSChunks(text);
        await playTTSChunks(chunks, {
          synthesize: (chunk) =>
            window.electron.tts.synthesize(chunk, {
              speakerId: selectedSpeakerId,
              speed,
            }) as Promise<TTSAudioResult>,
          play: (audio) => player.current?.play(audio) ?? Promise.resolve(),
          isCancelled: () => requestId.current !== currentRequest,
          onFirstAudioReady: () => {
            if (requestId.current !== currentRequest) return;
            setLoading(false);
            setPlaying(true);
          },
        });
        if (requestId.current === currentRequest) setPlaying(false);
      } catch (reason) {
        if (requestId.current !== currentRequest) return;
        setPlaying(false);
        setError(reason instanceof Error ? reason.message : '语音播放失败');
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    },
    [],
  );

  const stop = useCallback(() => {
    requestId.current += 1;
    player.current?.stop();
    setLoading(false);
    setPlaying(false);
  }, []);

  return { speak, stop, loading, playing, error };
}
