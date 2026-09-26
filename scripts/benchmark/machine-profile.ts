/**
 * 机器身份与硬件档案。
 *
 * 多台机器跑同一套基准时，最容易出的问题不是测不准，而是**结果混在一起分不清是哪台机**。
 * 之前所有结果平摊在一个目录里，换一台机器跑就直接覆盖 —— 和这个项目里已经踩过
 * 三次的「静默覆盖」是同一类问题，只是范围从「一次运行」扩大到「一台机器」。
 *
 * 所以每份结果都必须带机器指纹，而且结果按机器分目录存放。
 *
 * 机器 id 的取法：优先用人给的标签（`--machine <名字>`，例如 `m4-mac` / `3060-laptop`），
 * 这样汇总表里读得懂；没给标签时退回「主机名 + CPU 型号」的短哈希，保证同一台机器
 * 多次运行落到同一个 id，不同机器一定不同。
 */

/* eslint-disable no-restricted-syntax */

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { benchmarkResultsRoot } from './tts-paths';

export type GpuInfo = {
  name: string;
  memory_total_mib: number;
  driver_version: string;
} | null;

export type MachineProfile = {
  machine_id: string;
  label: string | null;
  captured_at: string;
  hostname_hash: string;
  os: string;
  arch: string;
  cpu_model: string;
  cpu_physical_cores: number | null;
  cpu_logical_cores: number;
  total_memory_bytes: number;
  gpu: GpuInfo;
  node_version: string;
  /** 便于在汇总表里一眼分类：有独立 GPU / 纯 CPU / Apple Silicon。 */
  accelerator_class: 'nvidia-gpu' | 'apple-silicon' | 'cpu-only';
};

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 主机名只存哈希：报告可能会公开，不必把机器名带出去。 */
function hashOf(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function readGpu(): GpuInfo {
  const result = spawnSync(
    'nvidia-smi',
    [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || !result.stdout) return null;
  const [name, memory, driver] = result.stdout
    .trim()
    .split('\n')[0]
    .split(',')
    .map((item) => item.trim());
  return {
    name,
    memory_total_mib: Number(memory),
    driver_version: driver,
  };
}

/** macOS 上 os.cpus() 报不出物理核数，用 sysctl 补；其他平台拿不到就留 null。 */
function physicalCores(): number | null {
  if (process.platform === 'darwin') {
    const result = spawnSync('sysctl', ['-n', 'hw.physicalcpu'], {
      encoding: 'utf8',
    });
    const value = Number(result.stdout?.trim());
    return Number.isFinite(value) ? value : null;
  }
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum',
      ],
      { encoding: 'utf8' },
    );
    const value = Number(result.stdout?.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/** 汇总表里靠这个字段分组，所以取值必须稳定、可穷举。 */
function classifyAccelerator(
  gpu: GpuInfo,
  isAppleSilicon: boolean,
): MachineProfile['accelerator_class'] {
  if (gpu) return 'nvidia-gpu';
  if (isAppleSilicon) return 'apple-silicon';
  return 'cpu-only';
}

export function captureMachineProfile(): MachineProfile {
  const label = flagValue('--machine') ?? process.env.BENCH_MACHINE ?? null;
  const cpuModel = os.cpus()[0]?.model?.trim() ?? 'unknown';
  const hostnameHash = hashOf(os.hostname());
  const gpu = readGpu();
  const isAppleSilicon = process.platform === 'darwin' && os.arch() === 'arm64';
  return {
    // 有标签就用标签：汇总表里 `3060-laptop` 比一串哈希可读得多
    machine_id: label ?? hashOf(`${os.hostname()}|${cpuModel}`),
    label,
    captured_at: new Date().toISOString(),
    hostname_hash: hostnameHash,
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpu_model: cpuModel,
    cpu_physical_cores: physicalCores(),
    cpu_logical_cores: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    gpu,
    node_version: process.version,
    accelerator_class: classifyAccelerator(gpu, isAppleSilicon),
  };
}

/** 本机结果目录：results/machines/<machine-id>/ */
export function machineResultsDir(profile: MachineProfile): string {
  return path.join(benchmarkResultsRoot(), 'machines', profile.machine_id);
}

export function writeMachineProfile(profile: MachineProfile): string {
  const dir = machineResultsDir(profile);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'machine.json');
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
  return file;
}

/** 一行摘要，跑基准时打在最前面，让人确认测的是哪台机。 */
export function describeMachine(profile: MachineProfile): string {
  const memory = (profile.total_memory_bytes / 1024 ** 3).toFixed(1);
  const cores = profile.cpu_physical_cores
    ? `${profile.cpu_physical_cores} 核 / ${profile.cpu_logical_cores} 线程`
    : `${profile.cpu_logical_cores} 线程`;
  const gpuFallback =
    profile.accelerator_class === 'apple-silicon'
      ? 'Apple Silicon 统一内存'
      : '无独立 GPU';
  const gpu = profile.gpu
    ? `${profile.gpu.name}（${profile.gpu.memory_total_mib} MiB）`
    : gpuFallback;
  return [
    `机器: ${profile.machine_id}${profile.label ? '' : '（未命名，建议加 --machine <标签>）'}`,
    `系统: ${profile.os} ${profile.arch}`,
    `CPU : ${profile.cpu_model}  ${cores}`,
    `内存: ${memory} GiB`,
    `GPU : ${gpu}`,
  ].join('\n');
}
