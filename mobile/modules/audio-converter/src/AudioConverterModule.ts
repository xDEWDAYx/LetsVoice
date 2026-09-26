import { NativeModule, requireNativeModule } from "expo";

export type PreparedAudio = {
  uri: string;
  temporary: boolean;
};

declare class AudioConverterModule extends NativeModule {
  prepareAudioAsync(inputUri: string, outputUri: string): Promise<PreparedAudio>;
}

export default requireNativeModule<AudioConverterModule>("AudioConverter");
