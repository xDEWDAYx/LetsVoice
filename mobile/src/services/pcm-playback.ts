import SpeechPcmPlayer from "../../modules/speech-pcm-player";

export interface PcmPlayback {
  start(sessionId: string, sampleRate: number): Promise<void>;
  write(sessionId: string, samples: number[]): Promise<void>;
  stopImmediately(): void;
}

class NativePcmPlayback implements PcmPlayback {
  public start(sessionId: string, sampleRate: number): Promise<void> {
    return SpeechPcmPlayer.start(sessionId, sampleRate, 1);
  }

  public write(sessionId: string, samples: number[]): Promise<void> {
    return SpeechPcmPlayer.write(sessionId, samples);
  }

  public stopImmediately(): void {
    SpeechPcmPlayer.stop();
  }
}

export const pcmPlayback: PcmPlayback = new NativePcmPlayback();
