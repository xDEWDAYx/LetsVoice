const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const LIVE_SEGMENT_MS = 5000;

type ChunkHandler = (chunk: Blob) => void;

/**
 * 封装浏览器 MediaRecorder 生命周期和麦克风资源释放。
 * 完整录音与实时识别使用两个 recorder：前者保持连续文件，后者每几秒生成
 * 一个可独立解码的短音频文件，避免直接拆分 WebM 后缺少容器头的问题。
 */
export default class MediaRecorderController {
  private recorder?: MediaRecorder;

  private liveRecorder?: MediaRecorder;

  private liveTimer?: ReturnType<typeof setTimeout>;

  private stream?: MediaStream;

  private liveHandler?: ChunkHandler;

  private mimeType?: string;

  private stopping = false;

  public async start(
    onChunk: ChunkHandler,
    onLiveSegment?: ChunkHandler,
  ): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stopping = false;
    this.liveHandler = onLiveSegment;

    try {
      this.mimeType = MediaRecorderController.selectMimeType();
      this.recorder = this.createRecorder();
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) onChunk(event.data);
      };
      this.recorder.start(1000);

      if (this.liveHandler) {
        this.startLiveSegment();
      }
    } catch (error) {
      this.release();
      throw error;
    }
  }

  public pause(): boolean {
    if (this.recorder?.state !== 'recording') return false;
    this.recorder.pause();
    this.clearLiveTimer();
    if (this.liveRecorder?.state === 'recording') {
      this.liveRecorder.pause();
    }
    return true;
  }

  public resume(): boolean {
    if (this.recorder?.state !== 'paused') return false;
    this.recorder.resume();
    if (this.liveRecorder?.state === 'paused') {
      this.liveRecorder.resume();
      this.scheduleLiveSegmentStop();
    } else if (!this.liveRecorder || this.liveRecorder.state === 'inactive') {
      this.startLiveSegment();
    }
    return true;
  }

  public async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.clearLiveTimer();

    const { recorder: fullRecorder, liveRecorder } = this;

    try {
      await Promise.all([
        MediaRecorderController.stopRecorder(fullRecorder),
        MediaRecorderController.stopRecorder(liveRecorder),
      ]);
    } finally {
      this.release();
    }
  }

  public release(): void {
    this.clearLiveTimer();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    this.liveRecorder = undefined;
    this.liveHandler = undefined;
    this.mimeType = undefined;
    this.stopping = false;
  }

  private createRecorder(): MediaRecorder {
    if (!this.stream) throw new Error('Microphone stream is not available');
    return new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined,
    );
  }

  private startLiveSegment(): void {
    if (!this.liveHandler || !this.stream || this.stopping) return;
    if (this.recorder?.state !== 'recording') return;

    const recorder = this.createRecorder();
    const chunks: Blob[] = [];
    this.liveRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.addEventListener(
      'stop',
      () => {
        this.clearLiveTimer();
        if (chunks.length > 0 && this.liveHandler) {
          const segment = new Blob(chunks, {
            type: recorder.mimeType || this.mimeType || 'audio/webm',
          });
          this.liveHandler(segment);
        }

        if (!this.stopping && this.recorder?.state === 'recording') {
          this.startLiveSegment();
        }
      },
      { once: true },
    );

    recorder.start();
    this.scheduleLiveSegmentStop();
  }

  private scheduleLiveSegmentStop(): void {
    this.clearLiveTimer();
    const recorder = this.liveRecorder;
    if (!recorder || recorder.state !== 'recording') return;

    this.liveTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, LIVE_SEGMENT_MS);
  }

  private clearLiveTimer(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = undefined;
  }

  private static stopRecorder(recorder?: MediaRecorder): Promise<void> {
    if (!recorder || recorder.state === 'inactive') return Promise.resolve();

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      recorder.addEventListener('stop', () => finish(), { once: true });
      recorder.addEventListener(
        'error',
        () => finish(new Error('Recording device error')),
        { once: true },
      );

      try {
        recorder.stop();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private static selectMimeType(): string | undefined {
    return MIME_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    );
  }
}
