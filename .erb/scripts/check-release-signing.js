/* eslint-disable no-console */
const { execFileSync } = require('child_process');
const chalk = require('chalk');

/**
 * release 构建的签名前置检查。
 *
 * 三种构建目标要区分清楚：
 *  - dev：npm start，不打包；
 *  - internal：npm run package，产物明确标 -internal-unsigned，仅供内部验证；
 *  - release：npm run package:release，必须有 Developer ID 和公证凭据，缺一即失败。
 *
 * 这一步的意义是「早失败」：不要等打完包、上传完了才发现 Gatekeeper 拦截。
 */

function fail(lines) {
  console.error(
    chalk.whiteBright.bgRed.bold(
      ['', ...lines.map((l) => ` ${l} `), ''].join('\n'),
    ),
  );
  process.exit(1);
}

/** 本机是否装了可用的 Developer ID Application 证书。 */
function hasDeveloperIdIdentity() {
  try {
    const output = execFileSync(
      'security',
      ['find-identity', '-v', '-p', 'codesigning'],
      { encoding: 'utf8' },
    );
    return output.includes('Developer ID Application');
  } catch {
    return false;
  }
}

function checkMacos() {
  const missing = ['APPLE_ID', 'APPLE_ID_PASS', 'APPLE_TEAM_ID'].filter(
    (name) => !process.env[name],
  );

  // 证书可以来自钥匙串，也可以来自 CI 注入的 CSC_LINK / CSC_NAME。
  const hasCertificate =
    Boolean(process.env.CSC_LINK || process.env.CSC_NAME) ||
    hasDeveloperIdIdentity();

  if (!hasCertificate) {
    fail([
      'Release 构建缺少 Developer ID Application 证书。',
      'Release build requires a Developer ID Application certificate.',
      '',
      '本机检查 / Check locally:  security find-identity -v -p codesigning',
      'CI 注入 / In CI: 设置 CSC_LINK（base64 的 .p12）与 CSC_KEY_PASSWORD',
      '',
      '只需要内部测试包时改用 / For internal builds run: npm run package',
    ]);
  }

  if (missing.length > 0) {
    fail([
      `Release 构建缺少公证凭据：${missing.join(', ')}`,
      `Release build is missing notarization credentials: ${missing.join(', ')}`,
      '',
      'APPLE_ID       Apple 账号邮箱',
      'APPLE_ID_PASS  App-specific password',
      'APPLE_TEAM_ID  开发者团队 ID',
      '',
      '只需要内部测试包时改用 / For internal builds run: npm run package',
    ]);
  }

  console.log(
    chalk.green('macOS 签名与公证凭据齐备 / signing + notarization ready.'),
  );
}

function checkWindows() {
  if (!process.env.CSC_LINK && !process.env.CSC_NAME) {
    console.warn(
      chalk.yellow(
        'Windows release 未配置代码签名证书（CSC_LINK / CSC_NAME），产物会触发 SmartScreen 警告。',
      ),
    );
  }
}

if (process.platform === 'darwin') {
  checkMacos();
} else if (process.platform === 'win32') {
  checkWindows();
} else {
  console.log(chalk.yellow(`平台 ${process.platform} 无签名要求，跳过检查。`));
}
