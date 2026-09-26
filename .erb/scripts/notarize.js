const build = require('../../electron-builder');

/** release 构建里签名 / 公证缺失必须直接失败，不能静默产出一个装不上的包。 */
const isReleaseBuild = process.env.SPEAKSPACE_RELEASE === 'true';

function skipOrFail(reason) {
  if (isReleaseBuild) {
    throw new Error(
      `Release 构建要求公证，但${reason}。请配置 APPLE_ID / APPLE_ID_PASS / APPLE_TEAM_ID，或改用 npm run package 产出内部未签名包。`,
    );
  }
  console.warn(`Skipping notarizing step: ${reason}`);
}

exports.default = async function notarizeMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (!isReleaseBuild && process.env.CI !== 'true') {
    skipOrFail('当前不是 CI 环境 / not running in CI');
    return;
  }

  if (
    !(
      'APPLE_ID' in process.env &&
      'APPLE_ID_PASS' in process.env &&
      'APPLE_TEAM_ID' in process.env
    )
  ) {
    skipOrFail(
      '缺少 APPLE_ID / APPLE_ID_PASS / APPLE_TEAM_ID 环境变量 / credentials are missing',
    );
    return;
  }

  // 上游模板写的是 `const { notarize } = import(...)`，
  // 解构的是 Promise 本身，拿到的永远是 undefined，调用时必然抛错。
  // 动态 import 必须 await。
  const { notarize } = await import('@electron/notarize');
  const appName = context.packager.appInfo.productFilename;

  await notarize({
    tool: 'notarytool',
    appBundleId: build.appId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASS,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
