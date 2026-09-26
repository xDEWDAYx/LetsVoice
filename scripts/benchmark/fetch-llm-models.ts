/**
 * 把跨机器 LLM 基准需要的模型拉齐。
 *
 * 跟 bench:tts:fetch 是同一个角色：只补缺的，已经装了的直接跳过，
 * 所以重复运行几乎不花时间，可以放心地放在一键测速流程里每次都跑一遍。
 *
 * 走 Ollama 的 HTTP API 而不是 `ollama pull` 命令行，是因为便携安装（应用自带的
 * runtimes/llm/bin/ollama.exe）不在 PATH 里，但 HTTP 端口一定是通的 ——
 * llm-runtime-probe 本来也只通过 HTTP 说话。
 *
 *   npm run bench:llm:fetch
 *   npm run bench:llm:fetch -- --models qwen2.5:3b-instruct
 *   npm run bench:llm:fetch -- --check    # 只报告缺什么，不下载
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import http from 'http';
import {
  BenchmarkLlmModel,
  LLM_BENCHMARK_MODELS,
  listInstalledModels,
  normaliseModelName,
  ollamaHost,
} from './llm-benchmark-models';
import { totalSize } from './model-size';

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * /api/pull 返回的是 NDJSON 流：一行一个 {status, digest?, total?, completed?}，
 * 出错时是 {error}，成功以 {status:"success"} 结尾。
 * 这里不设超时——拉 3 GiB 在慢网络上就是会很久，交给使用者 Ctrl+C。
 */
function pullModel(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${ollamaHost()}/api/pull`);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: '/api/pull',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`POST /api/pull 返回 HTTP ${response.statusCode}`));
          return;
        }
        let buffer = '';
        let lastReport = 0;
        let failed: Error | null = null;
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: {
              status?: string;
              error?: string;
              total?: number;
              completed?: number;
            };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.error) {
              failed = new Error(event.error);
              response.destroy();
              return;
            }
            const { total, completed } = event;
            if (total && completed && Date.now() - lastReport > 5000) {
              lastReport = Date.now();
              const percent = ((completed / total) * 100).toFixed(1);
              log(
                `    ${name} ${(completed / 1024 / 1024 / 1024).toFixed(2)} / ${(
                  total /
                  1024 /
                  1024 /
                  1024
                ).toFixed(2)} GiB (${percent}%)`,
              );
            }
          }
        });
        response.on('end', () => {
          if (failed) reject(failed);
          else resolve();
        });
        response.on('error', (error) => reject(failed ?? error));
        response.on('close', () => {
          if (failed) reject(failed);
        });
      },
    );
    request.on('error', reject);
    // model 是新字段、name 是旧字段，两个都给，兼容不同版本的 Ollama。
    request.write(JSON.stringify({ model: name, name, stream: true }));
    request.end();
  });
}

async function main(): Promise<void> {
  const requested = flagValue('--models');
  const checkOnly = process.argv.includes('--check');
  const wanted: BenchmarkLlmModel[] = requested
    ? requested
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map(
          (name) =>
            LLM_BENCHMARK_MODELS.find(
              (model) =>
                normaliseModelName(model.name) === normaliseModelName(name),
            ) ?? { name, size: '未知' },
        )
    : LLM_BENCHMARK_MODELS;

  let installed: string[];
  try {
    installed = await listInstalledModels();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Ollama 不可用（${message}）：无法拉取模型，LLM 测速会被跳过。`);
    log(`如果 Ollama 装在别处，设置 OLLAMA_HOST 后重试。当前：${ollamaHost()}`);
    process.exitCode = 1;
    return;
  }

  const installedSet = new Set(installed);
  const missing = wanted.filter(
    (model) => !installedSet.has(normaliseModelName(model.name)),
  );

  log(
    `基准模型集合共 ${wanted.length} 个，已装 ${wanted.length - missing.length} 个。`,
  );
  if (missing.length === 0) {
    log('全部模型已就绪。');
    return;
  }

  log(
    `缺 ${missing.length} 个，需要下载约 ${totalSize(missing)}：\n${missing
      .map((model) => `  - ${model.name}（${model.size}）`)
      .join('\n')}`,
  );

  if (checkOnly) {
    process.exitCode = 1;
    return;
  }

  const failures: string[] = [];
  for (const model of missing) {
    log(`\n[拉取] ${model.name}`);
    try {
      await pullModel(model.name);
      log(`[完成] ${model.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model.name}: ${message}`);
      log(`[失败] ${model.name}: ${message}`);
    }
  }

  if (failures.length > 0) {
    log(`\n有 ${failures.length} 个模型没拉下来：\n${failures.join('\n')}`);
    log('这些模型在跨机器对比表里会留空。网络恢复后重跑本命令即可补齐。');
    process.exitCode = 1;
    return;
  }
  log('\n全部模型已就绪。');
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
