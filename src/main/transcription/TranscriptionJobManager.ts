import { randomUUID } from 'crypto';
import type {
  TranscriptSegment,
  TranscriptionJob,
  TranscriptionProgress,
  TranscriptionSource,
} from '@shared/types/TranscriptionTypes';
import ProcessCancelledError from '../runtime/ProcessCancelledError';
import TranscriptionSourceResolver from './TranscriptionSourceResolver';
import LocalTranscriptionService, {
  TranscriptionBackend,
} from './LocalTranscriptionService';

const MAX_RETAINED_JOBS = 100;

type ActiveJob = {
  controller: AbortController;
  completion: Promise<void>;
};

export type TranscriptionJobListener = (job: TranscriptionJob) => void;
export type TranscriptionPartialListener = (
  jobId: string,
  segment: TranscriptSegment,
) => void;

/** 管理转写任务状态、取消和重试；实际引擎执行由独立服务负责。 */
export default class TranscriptionJobManager {
  private readonly transcriptionService: TranscriptionBackend;

  private readonly jobs = new Map<string, TranscriptionJob>();

  private readonly activeJobs = new Map<string, ActiveJob>();

  private readonly listeners = new Set<TranscriptionJobListener>();

  private readonly partialListeners = new Set<TranscriptionPartialListener>();

  public constructor(transcriptionService = new LocalTranscriptionService()) {
    this.transcriptionService = transcriptionService;
  }

  public start(rawSource: unknown): TranscriptionJob {
    this.pruneJobs();
    const source = TranscriptionSourceResolver.normalizeSource(rawSource);
    const job = TranscriptionJobManager.createJob(source);
    this.jobs.set(job.id, job);
    this.launch(job);
    return TranscriptionJobManager.cloneJob(job);
  }

  public get(rawJobId: unknown): TranscriptionJob {
    const job = this.requireJob(rawJobId);
    return TranscriptionJobManager.cloneJob(job);
  }

  public async cancel(rawJobId: unknown): Promise<TranscriptionJob> {
    const job = this.requireJob(rawJobId);
    const activeJob = this.activeJobs.get(job.id);

    if (activeJob) {
      activeJob.controller.abort();
      await activeJob.completion;
    }

    return TranscriptionJobManager.cloneJob(job);
  }

  public retry(rawJobId: unknown): TranscriptionJob {
    const job = this.requireJob(rawJobId);
    if (this.activeJobs.has(job.id)) {
      throw new Error('转写任务仍在运行 / Transcription job is still running');
    }

    const now = new Date().toISOString();
    Object.assign(job, {
      status: 'processing',
      phase: 'preparing',
      statusMessage: '正在重新准备转写 / Preparing transcription retry',
      errorMessage: null,
      result: null,
      attempt: job.attempt + 1,
      updatedAt: now,
    } satisfies Partial<TranscriptionJob>);
    this.notify(job);
    this.launch(job);
    return TranscriptionJobManager.cloneJob(job);
  }

  public subscribe(listener: TranscriptionJobListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribePartial(listener: TranscriptionPartialListener): () => void {
    this.partialListeners.add(listener);
    return () => {
      this.partialListeners.delete(listener);
    };
  }

  private launch(job: TranscriptionJob): void {
    const controller = new AbortController();
    const completion = this.execute(job, controller).finally(() => {
      this.activeJobs.delete(job.id);
    });
    this.activeJobs.set(job.id, { controller, completion });
  }

  private async execute(
    job: TranscriptionJob,
    controller: AbortController,
  ): Promise<void> {
    this.notify(job);

    try {
      const result = await this.transcriptionService.transcribe(job.source, {
        signal: controller.signal,
        onProgress: (progress) => this.updateProgress(job, progress),
        onPartial: (segment) => this.notifyPartial(job.id, segment),
      });
      Object.assign(job, {
        status: 'completed',
        phase: 'completed',
        statusMessage: '转写完成 / Transcription completed',
        errorMessage: null,
        result,
        updatedAt: new Date().toISOString(),
      } satisfies Partial<TranscriptionJob>);
    } catch (error) {
      const cancelled =
        controller.signal.aborted || error instanceof ProcessCancelledError;
      Object.assign(job, {
        status: cancelled ? 'cancelled' : 'failed',
        statusMessage: cancelled
          ? '转写已取消 / Transcription cancelled'
          : '转写失败 / Transcription failed',
        errorMessage: cancelled
          ? null
          : TranscriptionJobManager.getErrorMessage(error),
        updatedAt: new Date().toISOString(),
      } satisfies Partial<TranscriptionJob>);
    }

    this.notify(job);
  }

  private updateProgress(
    job: TranscriptionJob,
    progress: TranscriptionProgress,
  ): void {
    job.phase = progress.phase;
    job.statusMessage = progress.message;
    job.updatedAt = new Date().toISOString();
    this.notify(job);
  }

  private notify(job: TranscriptionJob): void {
    const snapshot = TranscriptionJobManager.cloneJob(job);
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private notifyPartial(jobId: string, segment: TranscriptSegment): void {
    const snapshot = { ...segment };
    this.partialListeners.forEach((listener) => listener(jobId, snapshot));
  }

  private requireJob(rawJobId: unknown): TranscriptionJob {
    if (typeof rawJobId !== 'string' || rawJobId.length > 100) {
      throw new Error('无效的转写任务 ID / Invalid transcription job ID');
    }
    const job = this.jobs.get(rawJobId);
    if (!job) throw new Error('找不到转写任务 / Transcription job not found');
    return job;
  }

  private pruneJobs(): void {
    if (this.jobs.size < MAX_RETAINED_JOBS) return;

    const finishedJob = Array.from(this.jobs.values()).find(
      (job) => !this.activeJobs.has(job.id),
    );
    if (finishedJob) this.jobs.delete(finishedJob.id);
  }

  private static createJob(source: TranscriptionSource): TranscriptionJob {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      source,
      status: 'processing',
      phase: 'preparing',
      statusMessage: '正在准备本地转写 / Preparing local transcription',
      errorMessage: null,
      result: null,
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  private static cloneJob(job: TranscriptionJob): TranscriptionJob {
    return {
      ...job,
      source: { ...job.source },
      result: job.result
        ? {
            ...job.result,
            segments: job.result.segments.map((segment) => ({ ...segment })),
          }
        : null,
    };
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : '未知转写错误 / Unknown transcription error';
  }
}
