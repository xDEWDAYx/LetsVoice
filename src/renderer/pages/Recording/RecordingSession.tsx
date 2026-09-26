import {
  RecordingListener,
  RecordingSnapshot,
  RecordingState,
  SavedRecording,
} from './RecordingTypes';
import MediaRecorderController from './MediaRecorderController';

/**
 * 管理一次麦克风录音会话。UI 通过 subscribe 观察状态，不直接操作 MediaRecorder。
 */
export class RecordingSession {
  private readonly mediaRecorder = new MediaRecorderController();

  private chunks: Blob[] = [];

  private readonly listeners = new Set<RecordingListener>();

  private state = RecordingState.Idle;

  private busy = false;

  private statusMessage = '准备录音 / Ready to record';

  private errorMessage: string | null = null;

  private savedRecording: SavedRecording | null = null;

  private liveChunkHandler: ((chunk: Blob) => void) | null = null;

  public getSnapshot(): RecordingSnapshot {
    return {
      state: this.state,
      busy: this.busy,
      statusMessage: this.statusMessage,
      errorMessage: this.errorMessage,
      bufferedBytes: this.chunks.reduce(
        (total, chunk) => total + chunk.size,
        0,
      ),
      savedRecording: this.savedRecording,
    };
  }

  public setLiveChunkHandler(handler: (chunk: Blob) => void): () => void {
    this.liveChunkHandler = handler;
    return () => {
      if (this.liveChunkHandler === handler) this.liveChunkHandler = null;
    };
  }

  public subscribe(listener: RecordingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async start(): Promise<void> {
    if (this.state !== RecordingState.Idle || this.busy) return;

    this.update({
      busy: true,
      errorMessage: null,
      statusMessage: '正在请求麦克风权限 / Requesting microphone access',
    });

    try {
      this.chunks = [];
      await this.mediaRecorder.start(
        (chunk) => {
          this.chunks.push(chunk);
          this.notify();
        },
        (chunk) => this.liveChunkHandler?.(chunk),
      );

      this.update({
        state: RecordingState.Recording,
        busy: false,
        statusMessage: '正在录音 / Recording',
      });
    } catch (error) {
      this.mediaRecorder.release();
      this.update({
        state: RecordingState.Idle,
        busy: false,
        errorMessage: RecordingSession.getErrorMessage(error),
        statusMessage: '无法开始录音 / Unable to start recording',
      });
    }
  }

  public pause(): void {
    if (!this.mediaRecorder.pause()) return;
    this.update({
      state: RecordingState.Paused,
      statusMessage: '录音已暂停 / Recording paused',
    });
  }

  public resume(): void {
    if (!this.mediaRecorder.resume()) return;
    this.update({
      state: RecordingState.Recording,
      statusMessage: '正在录音 / Recording',
    });
  }

  public async stop(): Promise<void> {
    if (this.busy) return;

    this.update({
      busy: true,
      statusMessage: '正在完成录音 / Finalising recording',
    });

    try {
      await this.mediaRecorder.stop();
      this.update({
        state: RecordingState.Completed,
        busy: false,
        statusMessage: '录音完成，可以保存或放弃 / Recording complete',
      });
    } catch (error) {
      this.update({
        state: RecordingState.Idle,
        busy: false,
        errorMessage: RecordingSession.getErrorMessage(error),
        statusMessage: '录音失败 / Recording failed',
      });
    }
  }

  public async save(): Promise<SavedRecording | null> {
    if (this.state !== RecordingState.Completed || this.busy) return null;
    if (this.chunks.length === 0) {
      this.update({
        errorMessage: '没有收到录音数据 / No recording data received',
      });
      return null;
    }

    this.update({
      busy: true,
      errorMessage: null,
      statusMessage: '正在保存录音 / Saving recording',
    });

    try {
      const [firstChunk] = this.chunks;
      const mimeType = firstChunk.type || 'audio/webm';
      const recordingBlob = new Blob(this.chunks, { type: mimeType });
      const savedRecording = (await window.electron.audio.saveRecording(
        await recordingBlob.arrayBuffer(),
        mimeType,
      )) as SavedRecording;

      this.chunks = [];
      this.update({
        state: RecordingState.Saved,
        busy: false,
        savedRecording,
        statusMessage: '录音已保存 / Recording saved',
      });
      return savedRecording;
    } catch (error) {
      this.update({
        busy: false,
        errorMessage: RecordingSession.getErrorMessage(error),
        statusMessage: '保存失败 / Save failed',
      });
      return null;
    }
  }

  public async discard(): Promise<void> {
    if (this.busy) return;

    this.update({
      busy: true,
      errorMessage: null,
      statusMessage: '正在放弃录音 / Discarding recording',
    });

    try {
      if (this.savedRecording) {
        const discardResult = (await window.electron.audio.discardRecording(
          this.savedRecording.relativePath,
        )) as { deleted: boolean; reason: 'deleted' | 'missing' | 'in-use' };

        if (discardResult.reason === 'in-use') {
          throw new Error(
            '录音已被笔记使用，不能直接删除 / Recording is used by a note',
          );
        }
      }

      this.chunks = [];
      this.update({
        state: RecordingState.Idle,
        busy: false,
        savedRecording: null,
        statusMessage: '录音已放弃 / Recording discarded',
      });
    } catch (error) {
      this.update({
        busy: false,
        errorMessage: RecordingSession.getErrorMessage(error),
        statusMessage: '无法放弃录音 / Unable to discard recording',
      });
    }
  }

  private update(changes: Partial<RecordingSnapshot>): void {
    if (changes.state !== undefined) this.state = changes.state;
    if (changes.busy !== undefined) this.busy = changes.busy;
    if (changes.statusMessage !== undefined) {
      this.statusMessage = changes.statusMessage;
    }
    if (changes.errorMessage !== undefined) {
      this.errorMessage = changes.errorMessage;
    }
    if (changes.savedRecording !== undefined) {
      this.savedRecording = changes.savedRecording;
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : '未知录音错误 / Unknown recording error';
  }
}

export { RecordingState } from './RecordingTypes';
