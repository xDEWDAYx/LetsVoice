import {
  getRuntimeInstallSupport,
  getRuntimeInstallSupportSummary,
} from '../RuntimeInstallSupport';

describe('RuntimeInstallSupport', () => {
  it('只在 Windows 上开放自动安装', () => {
    const summary = getRuntimeInstallSupportSummary('win32');
    expect(summary.whisper.supported).toBe(true);
    expect(summary.ffmpeg.supported).toBe(true);
    expect(summary.ollama.supported).toBe(true);
  });

  it('macOS / Linux 关闭自动安装并给出手动安装说明', () => {
    (['darwin', 'linux'] as NodeJS.Platform[]).forEach((platform) => {
      const summary = getRuntimeInstallSupportSummary(platform);
      expect(summary.platform).toBe(platform);
      [summary.whisper, summary.ffmpeg, summary.ollama].forEach((support) => {
        expect(support.supported).toBe(false);
        expect(support.manualHint.length).toBeGreaterThan(0);
      });
    });
  });

  it('非 Windows 平台的提示里不出现 Windows 字样', () => {
    const summary = getRuntimeInstallSupportSummary('darwin');
    const hints = [
      summary.whisper.manualHint,
      summary.ffmpeg.manualHint,
      summary.ollama.manualHint,
    ].join(' ');
    expect(hints).not.toMatch(/Windows/i);
  });

  it('未知平台回退到通用说明', () => {
    const support = getRuntimeInstallSupport('ollama', 'freebsd');
    expect(support.supported).toBe(false);
    expect(support.manualHint).toContain('ollama.com/download');
  });
});
