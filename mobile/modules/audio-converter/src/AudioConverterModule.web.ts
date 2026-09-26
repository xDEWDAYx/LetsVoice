import { NativeModule, registerWebModule } from "expo";

class AudioConverterModule extends NativeModule {
  async prepareAudioAsync(): Promise<never> {
    throw new Error("Local audio conversion is only available on Android.");
  }
}

export default registerWebModule(AudioConverterModule, "AudioConverter");
