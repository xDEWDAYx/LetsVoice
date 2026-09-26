import { NativeModule, requireNativeModule } from "expo";

declare class SpeechPcmPlayerModule extends NativeModule {
  start(sessionId: string, sampleRate: number, channels: number): Promise<void>;
  write(sessionId: string, samples: number[]): Promise<void>;
  stop(): void;
}

export default requireNativeModule<SpeechPcmPlayerModule>("SpeechPcmPlayer");
