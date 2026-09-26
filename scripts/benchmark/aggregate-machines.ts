/**
 * 多机结果汇总。
 *
 *   npm run bench:aggregate
 *
 * 扫描 results/machines/ 下每一台机器的目录，抽出对硬件敏感的指标，
 * 生成一张跨机器总表和一组对比图，回答「换台机器会快多少、够不够跑」。
 *
 * 只汇总**硬件相关**的量：合成速度、峰值内存、LLM 吞吐、显存、GPU 卸载比例、STT 转写速度。
 * 准确率不在这里 —— 它取决于模型和提示词，跨机器比较没有意义，
 * 放进来只会让人误以为「换机器能让模型变准」。
 */

/* eslint-disable no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import {
  chart,
  fixed,
  Json,
  mib,
  percent,
  RESULTS,
  table,
  DOCS,
} from './report-format';
import { machineResultsMarkdownLink } from './tts-paths';

type MachineBundle = {
  id: string;
  profile: Json;
  dir: string;
  tts: Json[];
  ttsLength: Json[];
  llm: Json | null;
  stt: Json | null;
};

function readJsonFile(file: string): Json | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
  } catch {
    return null;
  }
}

export function loadMachines(): MachineBundle[] {
  const root = path.join(RESULTS, 'machines');
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): MachineBundle | null => {
      const dir = path.join(root, entry.name);
      const profile = readJsonFile(path.join(dir, 'machine.json'));
      if (!profile) return null;
      const files = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.json'));
      const read = (predicate: (name: string) => boolean) =>
        files
          .filter(predicate)
          .map((name) => readJsonFile(path.join(dir, name)))
          .filter((item): item is Json => item !== null);
      return {
        id: entry.name,
        profile,
        dir,
        // 主基准结果：以 tts- 开头但不是 memory / length / asr 那几类
        tts: read(
          (name) =>
            name.startsWith('tts-') &&
            !name.startsWith('tts-memory-') &&
            !name.startsWith('tts-length-') &&
            name !== 'tts-asr.json',
        ).filter((item) => item.overall !== undefined),
        ttsLength: read((name) => name.startsWith('tts-length-')),
        llm: read((name) => name === 'llm-runtime.json')[0] ?? null,
        stt: read((name) => name === 'stt-human-speed.json')[0] ?? null,
      };
    })
    .filter((item): item is MachineBundle => item !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function machineLabel(bundle: MachineBundle): string {
  const { profile } = bundle;
  const gpu = profile.gpu as Json | null;
  if (gpu) return `${bundle.id}（${gpu.name}）`;
  return profile.accelerator_class === 'apple-silicon'
    ? `${bundle.id}（Apple Silicon 统一内存）`
    : `${bundle.id}（无独立 GPU）`;
}

function main(): void {
  const machines = loadMachines();
  if (machines.length === 0) {
    process.stdout.write(
      `没有找到任何机器结果。\n请先在各台机器上运行 npm run bench -- --machine <标签>，\n` +
        `再把 ${path.join(RESULTS, 'machines')} 下的目录拷到本机同一路径。\n`,
    );
    process.exitCode = 1;
    return;
  }

  const lines: string[] = [];
  lines.push('# 跨机器硬件基准汇总');
  lines.push('');
  lines.push(
    `生成时间：${new Date().toISOString().slice(0, 10)} · 生成方式：\`npm run bench:aggregate\``,
  );
  lines.push('');
  lines.push(
    `已收集 **${machines.length}** 台机器。本表只汇总**对硬件敏感**的指标；` +
      '准确率取决于模型与提示词、与机器无关，因此不在这里比较。',
  );
  lines.push('');

  lines.push('## 机器清单');
  lines.push('');
  lines.push(
    table(
      ['机器', '系统', 'CPU', '核心', '内存', 'GPU', '类别'],
      machines.map((item) => {
        const { profile } = item;
        const gpu = profile.gpu as Json | null;
        return [
          `\`${item.id}\``,
          `${profile.os} ${profile.arch}`,
          String(profile.cpu_model),
          profile.cpu_physical_cores
            ? `${profile.cpu_physical_cores}C/${profile.cpu_logical_cores}T`
            : `${profile.cpu_logical_cores}T`,
          mib(profile.total_memory_bytes),
          gpu ? `${gpu.name} ${gpu.memory_total_mib} MiB` : '—',
          String(profile.accelerator_class),
        ];
      }),
    ),
  );
  lines.push('');

  /* ------------------------------ TTS 速度 ------------------------------ */
  const ttsModelIds = [
    ...new Set(
      machines.flatMap((item) => item.tts.map((x) => String(x.model_id))),
    ),
  ].sort();
  if (ttsModelIds.length > 0) {
    lines.push('## TTS 合成速度（P50 RTF，越低越快）');
    lines.push('');
    lines.push(chart('cross-tts-rtf.svg', '跨机器 TTS 速度'));
    lines.push(
      table(
        ['机器', ...ttsModelIds],
        machines.map((machine) => [
          `\`${machine.id}\``,
          ...ttsModelIds.map((modelId) => {
            const hit = machine.tts.find((x) => x.model_id === modelId);
            return hit ? fixed(hit.overall.p50_rtf) : '—';
          }),
        ]),
      ),
    );
    lines.push('');
    lines.push(
      'RTF = 合成耗时 ÷ 音频时长。小于 1 表示快于实时播放，是这个功能可用的最低要求。',
    );
    lines.push('');

    lines.push('## TTS 峰值内存（跑完全部语料）');
    lines.push('');
    lines.push(chart('cross-tts-memory.svg', '跨机器 TTS 峰值内存'));
    lines.push(
      table(
        ['机器', ...ttsModelIds],
        machines.map((machine) => [
          `\`${machine.id}\``,
          ...ttsModelIds.map((modelId) => {
            const hit = machine.tts.find((x) => x.model_id === modelId);
            return hit ? mib(hit.peak_rss_bytes) : '—';
          }),
        ]),
      ),
    );
    lines.push('');
    lines.push(
      '峰值内存会受模型、运行时和平台影响，并且**它决定这台机器跑不跑得动**：' +
        '把每台机器的峰值和「内存」一列对照，才能判断容量是否足够。',
    );
    lines.push('');
  }

  /* ------------------------------- LLM 速度 ------------------------------- */
  const llmModels = [
    ...new Set(
      machines.flatMap((item) =>
        ((item.llm?.models as Json[]) ?? []).map((x) => String(x.model)),
      ),
    ),
  ].sort();
  if (llmModels.length > 0) {
    lines.push('## LLM 生成吞吐（tokens/s，越高越快）');
    lines.push('');
    lines.push(chart('cross-llm-throughput.svg', '跨机器 LLM 吞吐'));
    lines.push(
      table(
        ['机器', ...llmModels],
        machines.map((machine) => [
          `\`${machine.id}\``,
          ...llmModels.map((model) => {
            const hit = ((machine.llm?.models as Json[]) ?? []).find(
              (x) => x.model === model,
            );
            return hit ? fixed(hit.median_tokens_per_second, 1) : '—';
          }),
        ]),
      ),
    );
    lines.push('');

    lines.push('## GPU 卸载比例（1 = 整个模型都在显存里）');
    lines.push('');
    lines.push(chart('cross-llm-gpu.svg', '跨机器 GPU 卸载'));
    lines.push(
      table(
        ['机器', ...llmModels],
        machines.map((machine) => [
          `\`${machine.id}\``,
          ...llmModels.map((model) => {
            const hit = ((machine.llm?.models as Json[]) ?? []).find(
              (x) => x.model === model,
            );
            return hit ? percent(hit.gpu_offload_ratio, 0) : '—';
          }),
        ]),
      ),
    );
    lines.push('');
    lines.push(
      '小于 100% 表示显存放不下、部分层回落到 CPU，吞吐会显著下降。' +
        '**这一列是判断「这台机器能带动多大模型」最直接的依据。**',
    );
    lines.push('');
  }

  /* ------------------------------- STT 速度 ------------------------------- */
  const sttModels = [
    ...new Set(
      machines.flatMap((item) => Object.keys((item.stt?.models as Json) ?? {})),
    ),
  ].sort();
  if (sttModels.length > 0) {
    lines.push(
      '## STT 转写速度（RTF，越低越快；不含准确率，同一批录音换机器内容不会变）',
    );
    lines.push('');
    lines.push(chart('cross-stt-rtf.svg', '跨机器 STT 转写速度'));
    lines.push(
      table(
        ['机器', ...sttModels],
        machines.map((machine) => [
          `\`${machine.id}\``,
          ...sttModels.map((model) => {
            const hit = ((machine.stt?.models as Json) ?? {})[model] as
              | Json
              | undefined;
            return hit?.mean_rtf !== undefined && hit?.mean_rtf !== null
              ? fixed(hit.mean_rtf, 2)
              : '—';
          }),
        ]),
      ),
    );
    lines.push('');
    lines.push(
      '只测转写耗时，不算 CER——同一批真人录音在任何机器上转写内容都不会变，' +
        '准确率结论看 [STT 真人评测](./stt-human-eval.md)，这里只回答「这台机器跑 whisper 快不快」。',
    );
    lines.push('');
  }

  lines.push('## 怎么读这份表');
  lines.push('');
  lines.push(
    [
      '- **速度差异**主要来自 CPU 单核性能（TTS、STT 都走 CPU）与 GPU 显存带宽（LLM）。',
      '- **内存/显存**还会受运行时与平台影响，不能假设跨机器不变；应把各机实测峰值和总量对照着看。',
      '- **GPU 卸载比例掉到 100% 以下**是最重要的信号：说明这台机器带不动这个模型，',
      '  此时吞吐的下降往往是数倍，而不是几个百分点。',
      '- 准确率不在这份表里。它取决于模型与提示词，换机器不会变；',
      '  相关结论见 [待办提取评测](./task-extraction-eval.md) 与 [LLM 横向扫描](./llm-model-sweep.md)。',
    ].join('\n'),
  );
  lines.push('');
  lines.push('## 各机器原始结果');
  lines.push('');
  for (const machine of machines) {
    lines.push(
      `- [\`${machine.id}\`](${machineResultsMarkdownLink(machine.id)})`,
    );
  }
  lines.push('');

  const target = path.join(DOCS, 'cross-machine-benchmark.md');
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(target, `${lines.join('\n').trimEnd()}\n`);
  process.stdout.write(
    `已汇总 ${machines.length} 台机器：\n${machines
      .map((item) => `  ${machineLabel(item)}`)
      .join('\n')}\n\n已生成 ${target}\n` +
      `图表由 npm run bench:charts 生成（会自动画出跨机器对比图）。\n`,
  );
}

main();
