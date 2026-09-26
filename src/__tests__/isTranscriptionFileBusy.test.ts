import type { TranscriptionControllerSnapshot } from '../renderer/pages/Recording/TranscriptionController';
import { isTranscriptionFileBusy } from '../renderer/pages/Recording/TranscriptionController';

/**
 * 工作台和独立录音页共用同一份忙碌判定。
 * 漏掉任何一项都会让用户在转写途中二次触发上传，
 * resetLive() 会把当前 controller 状态连同复核内容一起冲掉。
 */

const IDLE: TranscriptionControllerSnapshot = {
  job: null,
  inputMode: 'file',
  uploadedFileName: null,
  uploadedFilePath: null,
  uploadedRecording: null,
  uploadPending: false,
  uploadProgress: null,
  uploadLanguage: 'auto',
  detectedLanguage: null,
  languageDetectionPending: false,
  languageDetectionError: null,
  languageConfirmationRequired: false,
  requestPending: false,
  requestError: null,
  liveSegments: [],
  livePendingCount: 0,
  liveError: null,
  structuredNoteDraft: null,
  structuredNotePending: false,
  structuredNoteError: null,
};

function snapshot(
  patch: Partial<TranscriptionControllerSnapshot>,
): TranscriptionControllerSnapshot {
  return { ...IDLE, ...patch };
}

describe('isTranscriptionFileBusy', () => {
  it('空闲时不忙', () => {
    expect(isTranscriptionFileBusy(IDLE)).toBe(false);
  });

  it('语言检测进行中算忙（BUG-002 复现方式 A）', () => {
    expect(
      isTranscriptionFileBusy(snapshot({ languageDetectionPending: true })),
    ).toBe(true);
  });

  it('文件转写 job 处理中算忙（BUG-002 复现方式 B）', () => {
    expect(
      isTranscriptionFileBusy(
        snapshot({
          job: {
            status: 'processing',
          } as TranscriptionControllerSnapshot['job'],
        }),
      ),
    ).toBe(true);
  });

  it('请求提交中算忙', () => {
    expect(isTranscriptionFileBusy(snapshot({ requestPending: true }))).toBe(
      true,
    );
  });

  it('keeps file actions disabled while the selected audio is importing', () => {
    expect(isTranscriptionFileBusy(snapshot({ uploadPending: true }))).toBe(
      true,
    );
  });

  it('实时分段转写中算忙', () => {
    expect(isTranscriptionFileBusy(snapshot({ livePendingCount: 2 }))).toBe(
      true,
    );
  });

  it('job 已完成不再算忙', () => {
    expect(
      isTranscriptionFileBusy(
        snapshot({
          job: {
            status: 'completed',
          } as TranscriptionControllerSnapshot['job'],
        }),
      ),
    ).toBe(false);
  });

  it('Structured Note 生成默认不影响普通转写忙碌状态', () => {
    expect(
      isTranscriptionFileBusy(snapshot({ structuredNotePending: true })),
    ).toBe(false);
  });

  it('includeStructuredNote 打开后生成草稿算忙（工作台入口用）', () => {
    expect(
      isTranscriptionFileBusy(snapshot({ structuredNotePending: true }), {
        includeStructuredNote: true,
      }),
    ).toBe(true);
  });
});
