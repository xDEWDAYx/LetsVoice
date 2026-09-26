/**
 * electron-builder 配置。
 *
 * 之所以从 package.json 挪到 JS 文件：产物文件名要区分「内部未签名包」和
 * 「正式发布包」，而 package.json 里只能写 `${env.X}` 这种模板 ——
 * 一旦有人直接跑 electron-builder 而没带上环境变量，构建会以
 * ERR_ELECTRON_BUILDER_ENV_NOT_DEFINED 直接失败。放在 JS 里就能给出安全默认值：
 * 没显式声明是 release，就按内部包命名。
 */
const isReleaseBuild = process.env.SPEAKSPACE_RELEASE === 'true';

// 内部包一律带 -internal-unsigned 后缀，避免和正式产物混淆后被误分发。
const artifactSuffix = isReleaseBuild ? '' : '-internal-unsigned';

module.exports = {
  productName: 'SpeakSpace Local',
  appId: 'com.speakspace.app',
  copyright: 'Copyright © 2026 SpeakSpace Local',
  artifactName: `\${productName}-\${version}${artifactSuffix}.\${ext}`,
  asar: true,
  afterSign: '.erb/scripts/notarize.js',
  asarUnpack: '**\\*.{node,dll}',
  files: ['dist', 'node_modules', 'package.json'],
  mac: {
    notarize: false,
    target: 'default',
    type: 'distribution',
    hardenedRuntime: true,
    entitlements: 'assets/entitlements.mac.plist',
    entitlementsInherit: 'assets/entitlements.mac.plist',
    gatekeeperAssess: false,
  },
  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    target: ['nsis'],
  },
  linux: {
    target: ['AppImage'],
    category: 'Development',
  },
  directories: {
    app: 'release/app',
    buildResources: 'assets',
    output: 'release/build',
  },
  extraResources: ['./assets/**'],
  publish: {
    provider: 'github',
    owner: 'dhebhxh',
    repo: 'speakspace-local-electron',
  },
};
