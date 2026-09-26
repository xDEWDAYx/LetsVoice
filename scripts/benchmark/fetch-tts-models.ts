/**
 * 把基准测试需要的 TTS 模型下载到基准缓存目录。
 *
 * URL 与 sha256 直接取自应用的 TTSModelCatalog，所以不会和线上安装包脱节。
 * 下载目标是独立缓存目录，不会改动应用 userData 里的已装模型状态。
 *
 *   npm run bench:tts:fetch
 *   npm run bench:tts:fetch -- --only melo
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { TTS_MODEL_CATALOG } from '../../src/main/tts/TTSModelCatalog';
import type { TTSModelCatalogItem } from '../../src/main/tts/TTSModelCatalog';
import { benchmarkModelsRoot, resolveTTSModelDir } from './tts-paths';

const ALIASES: Record<string, string> = {
  kokoro: 'kokoro-multi-lang-v1_0',
  melo: 'vits-melo-tts-zh_en',
  moss: 'moss-tts-nano-100m-onnx',
};

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/** 跟随重定向的流式下载，带进度输出。GitHub 与 HuggingFace 都会 302。 */
function download(url: string, target: string, hops = 0): Promise<void> {
  if (hops > 8) return Promise.reject(new Error(`重定向过多: ${url}`));
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { 'User-Agent': 'speakspace-benchmark' } },
      (response) => {
        const { statusCode, headers } = response;
        if (
          statusCode &&
          statusCode >= 300 &&
          statusCode < 400 &&
          headers.location
        ) {
          response.resume();
          const next = new URL(headers.location, url).toString();
          download(next, target, hops + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} ${url}`));
          return;
        }
        const total = Number(headers['content-length'] ?? 0);
        let received = 0;
        let lastReport = Date.now();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const file = fs.createWriteStream(`${target}.part`);
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (Date.now() - lastReport > 5000) {
            lastReport = Date.now();
            const percent = total ? ((received / total) * 100).toFixed(1) : '?';
            log(
              `    ${path.basename(target)} ${(received / 1024 / 1024).toFixed(1)} MiB (${percent}%)`,
            );
          }
        });
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(`${target}.part`, target);
            resolve();
          });
        });
        file.on('error', reject);
      },
    );
    request.on('error', reject);
  });
}

async function ensureFile(
  url: string,
  target: string,
  expectedSha256: string,
): Promise<void> {
  if (fs.existsSync(target) && sha256File(target) === expectedSha256) {
    log(`  已存在且校验通过: ${path.basename(target)}`);
    return;
  }
  log(`  下载: ${url}`);
  await download(url, target);
  const actual = sha256File(target);
  if (actual !== expectedSha256) {
    fs.rmSync(target, { force: true });
    throw new Error(
      `sha256 不匹配: ${target}\n  期望 ${expectedSha256}\n  实际 ${actual}`,
    );
  }
  log(`  校验通过: ${path.basename(target)}`);
}

/**
 * Windows 自带的 bsdtar 不认 -j，Git 附带的 GNU tar 认。
 * 逐个候选试过去，第一个成功的就用它。
 */
function extractTarBz2(archive: string, targetParent: string): void {
  fs.mkdirSync(targetParent, { recursive: true });
  const binaries = [
    'tar',
    'C:\\Program Files\\Git\\usr\\bin\\tar.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\tar.exe',
    '/usr/bin/tar',
  ];
  const argumentSets = [
    ['-xjf', archive, '-C', targetParent],
    ['-xf', archive, '-C', targetParent],
  ];
  for (const binary of binaries) {
    for (const args of argumentSets) {
      const result = spawnSync(binary, args, { stdio: 'ignore' });
      if (!result.error && result.status === 0) return;
    }
  }
  throw new Error(`解压失败: ${archive}（需要支持 bzip2 的 tar）`);
}

async function installModel(item: TTSModelCatalogItem): Promise<void> {
  const modelsRoot = benchmarkModelsRoot();
  const targetDir = path.join(modelsRoot, item.id);
  const existing = resolveTTSModelDir(item.id);
  const complete =
    existing !== null &&
    item.requiredFiles.every((relative) =>
      fs.existsSync(path.join(existing, relative)),
    );
  if (complete) {
    log(`[跳过] ${item.name} 已就绪: ${existing}`);
    return;
  }

  log(`[安装] ${item.name} → ${targetDir}`);
  if (item.installation.kind === 'archive') {
    const archive = path.join(modelsRoot, `${item.id}.tar.bz2`);
    await ensureFile(item.installation.url, archive, item.installation.sha256);
    extractTarBz2(archive, modelsRoot);
    fs.rmSync(archive, { force: true });
  } else {
    for (const asset of item.installation.assets) {
      // 逐个下载：MOSS 有 440 MiB 的单文件，串行更容易观察进度和重试。
      // eslint-disable-next-line no-await-in-loop
      await ensureFile(
        asset.url,
        path.join(targetDir, asset.relativePath),
        asset.sha256,
      );
    }
  }

  const missing = item.requiredFiles.filter(
    (relative) => !fs.existsSync(path.join(targetDir, relative)),
  );
  if (missing.length > 0) {
    throw new Error(`${item.name} 缺少文件: ${missing.join(', ')}`);
  }
  log(`[完成] ${item.name}`);
}

async function main(): Promise<void> {
  const onlyIndex = process.argv.indexOf('--only');
  const requested =
    onlyIndex >= 0
      ? process.argv[onlyIndex + 1]
          .split(',')
          .map((name) => ALIASES[name.trim()] ?? name.trim())
      : TTS_MODEL_CATALOG.map((item) => item.id);

  const failures: string[] = [];
  for (const item of TTS_MODEL_CATALOG) {
    if (!requested.includes(item.id)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await installModel(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${item.name}: ${message}`);
      log(`[失败] ${item.name}: ${message}`);
    }
  }
  if (failures.length > 0) {
    log(`\n有 ${failures.length} 个模型未就绪:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    log('\n全部模型已就绪。');
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
