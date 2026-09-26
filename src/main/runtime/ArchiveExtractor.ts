import fs from 'fs';
import path from 'path';
import CommandLocator from './CommandLocator';
import LocalProcessRunner, { LocalProcessOptions } from './LocalProcessRunner';

/**
 * 跨环境解压压缩包（zip / tar.*）。
 *
 * Windows 上的坑：PATH 里若优先命中 Git/MSYS 的 GNU tar，会把形如 `C:\...`
 * 的本地路径当成「远程主机:路径」（报 "Cannot connect to C"），且 GNU tar
 * 不能解压 zip。Windows 自带的 System32\tar.exe（bsdtar）两者都能正确处理，
 * 因此优先使用它；失败时对 zip 退回 PowerShell 的 Expand-Archive，
 * 其余格式再退回 PATH 中的 tar 并加 --force-local 规避冒号问题。
 */
export default class ArchiveExtractor {
  public static async extract(
    archivePath: string,
    destDir: string,
    runner: LocalProcessRunner = new LocalProcessRunner(),
    options: LocalProcessOptions = {},
  ): Promise<void> {
    const isZip = archivePath.toLowerCase().endsWith('.zip');

    if (process.platform === 'win32') {
      const systemTar = path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'tar.exe',
      );

      if (fs.existsSync(systemTar)) {
        try {
          await runner.run(
            systemTar,
            ['-xf', archivePath, '-C', destDir],
            options,
          );
          return;
        } catch {
          // bsdtar 失败：zip 交给 PowerShell 兜底，其余向下继续尝试 GNU tar。
          if (!isZip) {
            await ArchiveExtractor.extractWithGnuTar(
              archivePath,
              destDir,
              runner,
              options,
            );
            return;
          }
        }
      }

      if (isZip) {
        await ArchiveExtractor.expandZipWithPowerShell(
          archivePath,
          destDir,
          runner,
          options,
        );
        return;
      }

      await ArchiveExtractor.extractWithGnuTar(
        archivePath,
        destDir,
        runner,
        options,
      );
      return;
    }

    // 非 Windows：系统 tar 直接可用，路径不含盘符冒号问题。
    const tarPath = CommandLocator.resolve(['tar']);
    if (!tarPath) {
      throw new Error('未找到系统 tar 解压工具 / tar is not available');
    }
    await runner.run(tarPath, ['-xf', archivePath, '-C', destDir], options);
  }

  private static async extractWithGnuTar(
    archivePath: string,
    destDir: string,
    runner: LocalProcessRunner,
    options: LocalProcessOptions,
  ): Promise<void> {
    const tarPath = CommandLocator.resolve(['tar.exe', 'tar']);
    if (!tarPath) {
      throw new Error('未找到系统 tar 解压工具 / tar is not available');
    }
    // --force-local 让 GNU tar 把 `C:\...` 当作本地文件而非远程主机。
    await runner.run(
      tarPath,
      ['--force-local', '-xf', archivePath, '-C', destDir],
      options,
    );
  }

  private static expandZipWithPowerShell(
    archivePath: string,
    destDir: string,
    runner: LocalProcessRunner,
    options: LocalProcessOptions,
  ): Promise<unknown> {
    const escape = (value: string) => value.replace(/'/g, "''");
    const command = `Expand-Archive -LiteralPath '${escape(
      archivePath,
    )}' -DestinationPath '${escape(destDir)}' -Force`;
    return runner.run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command,
      ],
      options,
    );
  }
}
