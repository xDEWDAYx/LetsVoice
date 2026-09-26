/* eslint-disable no-console */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * 打包后的签名校验：只有真的带 Developer ID 和 TeamIdentifier，
 * 用户下载 DMG 后才不需要手工绕过 Gatekeeper。
 * 非 release 构建只提示，release 构建校验不过直接退出非零。
 */

const isReleaseBuild = process.env.SPEAKSPACE_RELEASE === 'true';
const buildRoot = path.resolve(__dirname, '../../release/build');

function findApps() {
  if (!fs.existsSync(buildRoot)) return [];
  return fs
    .readdirSync(buildRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('mac'))
    .flatMap((entry) => {
      const directory = path.join(buildRoot, entry.name);
      return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.app'))
        .map((name) => path.join(directory, name));
    });
}

function describeSignature(appPath) {
  try {
    // codesign 把详情写在 stderr，这里合并读取。
    return execFileSync('codesign', ['-dv', '--verbose=2', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

function main() {
  if (process.platform !== 'darwin') {
    console.log(
      chalk.yellow('非 macOS 环境，跳过 codesign 校验 / not macOS, skipped.'),
    );
    return;
  }

  const apps = findApps();
  if (apps.length === 0) {
    console.warn(chalk.yellow('release/build 下没有找到 .app，跳过校验。'));
    return;
  }

  const unsigned = apps.filter((appPath) => {
    const output = describeSignature(appPath);
    const signed =
      output.includes('Authority=Developer ID Application') &&
      !output.includes('TeamIdentifier=not set');
    console.log(
      signed
        ? chalk.green(`已正式签名 / signed: ${path.basename(appPath)}`)
        : chalk.yellow(`未正式签名 / unsigned: ${path.basename(appPath)}`),
    );
    return !signed;
  });

  if (unsigned.length === 0) return;

  if (isReleaseBuild) {
    console.error(
      chalk.whiteBright.bgRed.bold(
        [
          '',
          ' Release 产物未通过 Developer ID 签名校验，不能发布。 ',
          ' Release artifacts are not signed with a Developer ID. ',
          '',
          ...unsigned.map((appPath) => ` ${appPath} `),
          '',
        ].join('\n'),
      ),
    );
    process.exit(1);
  }

  console.warn(
    chalk.yellow(
      '这是内部未签名构建，产物文件名带 -internal-unsigned，请勿对外分发。',
    ),
  );
}

main();
