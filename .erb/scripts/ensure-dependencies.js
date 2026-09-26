/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const appRoot = path.join(projectRoot, 'release', 'app');

function readPackageJson(directory) {
  return JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
  );
}

function packageManifestPath(directory, packageName) {
  return path.join(
    directory,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
}

function findMissingPackages(directory, includeDevDependencies = false) {
  const packageJson = readPackageJson(directory);
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(includeDevDependencies ? packageJson.devDependencies || {} : {}),
  };

  return Object.keys(dependencies).filter(
    (packageName) =>
      !fs.existsSync(packageManifestPath(directory, packageName)),
  );
}

function getInstallAction() {
  const hasNodeModules = fs.existsSync(path.join(projectRoot, 'node_modules'));
  const hasLockfile = fs.existsSync(
    path.join(projectRoot, 'package-lock.json'),
  );
  return !hasNodeModules && hasLockfile ? 'ci' : 'install';
}

function runNpmInstall(action) {
  const args = [action, '--include=dev', '--no-audit', '--no-fund'];
  const npmCli = process.env.npm_execpath;
  const command = npmCli && fs.existsSync(npmCli) ? process.execPath : 'npm';
  const commandArgs =
    npmCli && fs.existsSync(npmCli) ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === 'win32' && command === 'npm',
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm ${action} exited with code ${result.status ?? 'unknown'}`,
    );
  }
}

function main() {
  const missingRootPackages = findMissingPackages(projectRoot, true);
  const missingAppPackages = findMissingPackages(appRoot);

  if (missingRootPackages.length === 0 && missingAppPackages.length === 0) {
    return;
  }

  console.log(
    [
      '',
      'SpeakSpace Local 检测到首次启动所需的依赖尚未安装。',
      'Installing dependencies required for the first launch...',
      `Root packages missing: ${missingRootPackages.length}`,
      `App packages missing: ${missingAppPackages.length}`,
      '',
    ].join('\n'),
  );

  const installAction = getInstallAction();
  console.log(`Running npm ${installAction}...`);

  try {
    runNpmInstall(installAction);
  } catch (error) {
    console.error(
      [
        '',
        '自动安装依赖失败，请检查网络或 npm 设置后再次执行 npm start。',
        'Automatic dependency installation failed. Check your network/npm settings and run npm start again.',
        `Reason: ${error.message}`,
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const stillMissingRoot = findMissingPackages(projectRoot, true);
  const stillMissingApp = findMissingPackages(appRoot);
  if (stillMissingRoot.length > 0 || stillMissingApp.length > 0) {
    console.error(
      [
        '',
        `npm ${installAction} 已结束，但部分依赖仍然缺失。请再次执行 npm start。`,
        `npm ${installAction} finished, but some dependencies are still missing. Run npm start again.`,
        `Root packages missing: ${stillMissingRoot.join(', ') || 'none'}`,
        `App packages missing: ${stillMissingApp.join(', ') || 'none'}`,
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
}

main();
