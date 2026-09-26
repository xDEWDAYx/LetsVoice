export type GeneratedTTSAudio = {
  sampleRate: number;
  channels: Float32Array[];
};

export interface TTSModelEngine {
  generate(
    text: string,
    speakerId: string,
    speed: number,
  ): Promise<GeneratedTTSAudio>;

  dispose(): void;
}
