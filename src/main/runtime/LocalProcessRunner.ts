import { spawn } from 'child_process';
import ProcessCancelledError from './ProcessCancelledError';

const MAX_CAPTURED_OUTPUT = 64 * 1024;

export type LocalProcessOptions = {
  cwd?: string;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export type LocalProcessResult = {
  stdout: string;
  stderr: string;
};

/** 通过参数数组启动本地进程，支持取消，不使用 shell 字符串拼接。 */
export default class LocalProcessRunner {
  // 保留实例方法以支持转写服务注入替代运行器。
  // eslint-disable-next-line class-methods-use-this
  public run(
    command: string,
    args: string[],
    options: LocalProcessOptions = {},
  ): Promise<LocalProcessResult> {
    if (options.signal?.aborted) {
      return Promise.reject(new ProcessCancelledError());
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const cleanup = (abortListener: () => void) => {
        options.signal?.removeEventListener('abort', abortListener);
      };
      const finishReject = (error: Error, abortListener: () => void) => {
        if (settled) return;
        settled = true;
        cleanup(abortListener);
        reject(error);
      };
      const handleAbort = () => {
        child.kill();
        finishReject(new ProcessCancelledError(), handleAbort);
      };

      options.signal?.addEventListener('abort', handleAbort, { once: true });
      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout = LocalProcessRunner.appendOutput(stdout, chunk);
        options.onStdout?.(chunk);
      });
      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr = LocalProcessRunner.appendOutput(stderr, chunk);
        options.onStderr?.(chunk);
      });
      child.on('error', (error) => finishReject(error, handleAbort));
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          finishReject(
            new Error(
              (stderr || stdout || `Process exited with code ${code}`).trim(),
            ),
            handleAbort,
          );
          return;
        }

        settled = true;
        cleanup(handleAbort);
        resolve({ stdout, stderr });
      });
    });
  }

  private static appendOutput(current: string, chunk: string): string {
    const combined = `${current}${chunk}`;
    return combined.length > MAX_CAPTURED_OUTPUT
      ? combined.slice(-MAX_CAPTURED_OUTPUT)
      : combined;
  }
}
