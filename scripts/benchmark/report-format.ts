/**
 * 报告渲染的公共部件。
 *
 * 抽出来是因为报告已经不止一份（TTS / 待办提取 / Agent / LLM 横向扫描），
 * 数字格式必须完全一致 —— 同一个百分比在两份报告里显示成不同小数位，
 * 读者会以为是两次不同的测量。
 */

/* eslint-disable no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { benchmarkResultsRoot, PROJECT_ROOT } from './tts-paths';

export type Json = Record<string, any>;

export const RESULTS = benchmarkResultsRoot();
export const DOCS = path.join(PROJECT_ROOT, 'docs', 'testing');

export function readJson(file: string): Json | null {
  const full = path.join(RESULTS, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as Json;
}

export function mib(bytes: number | null | undefined): string {
  return bytes === null || bytes === undefined
    ? 'n/a'
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function fixed(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'n/a'
    : value.toFixed(digits);
}

export function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'n/a'
    : `${(value * 100).toFixed(digits)}%`;
}

export function table(header: string[], rows: (string | number)[][]): string {
  const separator = header.map(() => '---');
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/**
 * 引用一张图。图不存在就返回空串 —— 报告可以在没跑 bench:charts 时照常生成，
 * 不会留下一堆坏掉的图片链接。
 */
export function chart(file: string, alt: string): string {
  const full = path.join(DOCS, 'charts', file);
  if (!fs.existsSync(full)) return '';
  return `![${alt}](./charts/${file})\n`;
}
