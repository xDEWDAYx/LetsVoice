/* eslint-disable no-console */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { downloadArtifact } = require('@electron/get');

/**
 * Electron 的二进制不随 npm 包发布，而是 postinstall 阶段单独下载 + 解压的。
 * 这一步失败时 npm install 依然会以 0 退出，用户要到 `npm start` 才发现应用起不来，
 * 报错也看不出和依赖有关。这个脚本在 install 之后和 start 之前各跑一次。
 *
 * Windows 上最常见的成因是「上一次的开发实例还开着」：
 * 运行中的 electron.exe 会锁住 dist 里的 resources.pak / locales 等文件，
 * 解压既覆盖不了也删不掉，于是留下一个缺可执行文件的半成品 dist。
 * 所以检测到不完整时，先看是谁占着，再决定要不要重装。
 */

const electronPackagePath = path.dirname(
  require.resolve('electron/package.json'),
);
const electronPackageJsonPath = path.join(electronPackagePath, 'package.json');
const electronPackage = require(electronPackageJsonPath);
const distPath = path.join(electronPackagePath, 'dist');

function getExpectedExecutableRelativePath() {
  const platform = process.env.npm_config_platform || process.platform;
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      return null;
  }
}

/** path.txt 记录了当前平台可执行文件在 dist 里的相对路径。 */
function getExecutablePath() {
  const pathTxt = path.join(electronPackagePath, 'path.txt');
  if (!fs.existsSync(pathTxt)) return null;
  const relative = fs.readFileSync(pathTxt, 'utf8').trim();
  if (relative !== getExpectedExecutableRelativePath()) return null;
  return relative ? path.join(distPath, relative) : null;
}

/** path.txt、version 和可执行文件三者齐备，dist 才算解压完整。 */
function isBinaryComplete() {
  const executablePath = getExecutablePath();
  if (!executablePath || !fs.existsSync(executablePath)) return false;
  const versionPath = path.join(distPath, 'version');
  if (!fs.existsSync(versionPath)) return false;
  const installedVersion = fs.readFileSync(versionPath, 'utf8').trim();
  if (installedVersion.replace(/^v/, '') !== electronPackage.version) {
    return false;
  }
  // 解压中断会留下 0 字节的占位文件，大小检查能识别出这种半成品。
  return fs.statSync(executablePath).size > 0;
}

/** 仍在占用本仓库 Electron 二进制的进程数；探测本身失败时按 0 处理。 */
function countRunningElectronProcesses() {
  try {
    if (process.platform === 'win32') {
      const escapedDistPath = distPath.replace(/'/g, "''");
      const command = [
        `$target = [System.IO.Path]::GetFullPath('${escapedDistPath}')`,
        '$comparison = [System.StringComparison]::OrdinalIgnoreCase',
        '@(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [System.IO.Path]::GetFullPath($_.Path).StartsWith($target, $comparison) }).Count',
      ].join('; ');
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { encoding: 'utf8' },
      );
      return Number.parseInt(output.trim(), 10) || 0;
    }
    const output = execFileSync('pgrep', ['-f', distPath], {
      encoding: 'utf8',
    });
    return output.split(/\s+/).filter(Boolean).length;
  } catch {
    // 没有匹配进程时 tasklist / pgrep 以非零码退出，等同于「没人占用」。
    return 0;
  }
}

/**
 * extract-zip@2 can finish without extracting the complete archive on newer
 * Node.js releases. Electron's installer then exits successfully even though
 * path.txt and electron.exe are absent. Use Windows' built-in tar as a fallback
 * so `npm start` can repair that half-installed state by itself.
 */
async function extractElectronWithSystemTar() {
  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;

  if (platform !== 'win32') return;

  console.log(
    chalk.yellow(
      'Electron 标准解压未完成，正在使用 Windows 内置解压工具重试… / Retrying with the Windows extractor…',
    ),
  );

  const useRemoteChecksums =
    process.env.electron_use_remote_checksums ??
    process.env.npm_config_electron_use_remote_checksums;
  const archivePath = await downloadArtifact({
    version: electronPackage.version,
    artifactName: 'electron',
    force: process.env.force_no_cache === 'true',
    cacheRoot: process.env.electron_config_cache,
    checksums: useRemoteChecksums
      ? undefined
      : require(path.join(electronPackagePath, 'checksums.json')),
    platform,
    arch,
  });

  fs.rmSync(distPath, { recursive: true, force: true });
  fs.mkdirSync(distPath, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', distPath], {
    stdio: 'inherit',
  });

  if (fs.existsSync(path.join(distPath, 'electron.exe'))) {
    fs.writeFileSync(
      path.join(electronPackagePath, 'path.txt'),
      'electron.exe',
    );
  }
}

async function reinstallElectron() {
  console.log(
    chalk.yellow(
      'Electron 可执行文件缺失，正在重新解压运行时… / Electron binary missing, reinstalling…',
    ),
  );
  // 先清空再解压：直接往半成品 dist 上覆盖，在 Windows 上会静默失败。
  // 删不掉时不阻断，交给 install.js 尽力补齐，最终以完整性检查为准。
  try {
    fs.rmSync(distPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      chalk.yellow(`无法清空 ${distPath}（${error.code}），将尝试直接补齐。`),
    );
  }
  try {
    execFileSync(process.execPath, ['install.js'], {
      cwd: electronPackagePath,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Electron 标准安装程序失败（${error.message}），尝试备用方式。`,
      ),
    );
  }

  if (!isBinaryComplete()) {
    await extractElectronWithSystemTar();
  }
}

function reportFailure(runningProcessCount) {
  const lines = [
    '',
    ' Electron 二进制不完整，应用无法启动。 / Electron binary is incomplete. ',
    '',
    ` 期望路径 / Expected: ${getExecutablePath() ?? '<path.txt 缺失 / missing>'} `,
    '',
  ];

  if (runningProcessCount > 0) {
    lines.push(
      ` 检测到 ${runningProcessCount} 个 Electron 进程仍在运行，正锁住 dist 目录。 `,
      ` ${runningProcessCount} Electron process(es) are running and locking dist. `,
      '',
      ' 修复方式 / Fix: 先关闭这个项目的开发窗口，再重试 ',
      process.platform === 'win32'
        ? '   npm start '
        : '   pkill -f node_modules/electron/dist && npm start ',
    );
  } else {
    lines.push(
      ' 修复方式 / Fix: ',
      process.platform === 'win32'
        ? '   Remove-Item -LiteralPath node_modules\\electron -Recurse -Force; npm start '
        : '   rm -rf node_modules/electron && npm start ',
      ' 网络受限时可先设置镜像 / Behind a proxy set a mirror first: ',
      '   npm config set electron_mirror https://npmmirror.com/mirrors/electron/ ',
    );
  }

  lines.push('');
  console.error(chalk.whiteBright.bgRed.bold(lines.join('\n')));
}

async function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.log(
      chalk.yellow(
        'ELECTRON_SKIP_BINARY_DOWNLOAD 已设置，跳过 Electron 二进制自检。',
      ),
    );
    return;
  }

  if (isBinaryComplete()) return;

  const runningProcessCount = countRunningElectronProcesses();
  if (runningProcessCount === 0) {
    try {
      await reinstallElectron();
    } catch (error) {
      console.error(chalk.red('Electron 安装脚本执行失败：'), error.message);
    }

    if (isBinaryComplete()) {
      console.log(
        chalk.green('Electron 可执行文件已恢复 / Electron binary restored.'),
      );
      return;
    }
  }

  reportFailure(runningProcessCount);
  process.exit(1);
}

main().catch((error) => {
  console.error(chalk.red('Electron 自检失败：'), error.message);
  process.exit(1);
});
