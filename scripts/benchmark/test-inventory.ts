/**
 * 把 Jest 的运行结果渲染成测试清单。
 *
 * 「535 项自动化测试」这种说法本身没有信息量，别人无法核对。
 * 这个脚本把每个套件、每条用例、每条的状态和耗时全部列出来，
 * 并按功能域归类，报告里可以直接引用，也可以让人自己复跑核对。
 *
 *   npm run test:inventory            # 跑一遍 jest 再生成
 *   npm run test:inventory -- --from <jest-report.json>   # 复用已有结果
 *
 * 输出：docs/testing/jest-test-inventory.md
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PROJECT_ROOT } from './tts-paths';

type AssertionResult = {
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'pending' | 'todo' | 'skipped' | 'disabled';
  duration?: number | null;
  failureMessages?: string[];
};

type TestResult = {
  name: string;
  status: string;
  message?: string;
  startTime: number;
  endTime: number;
  assertionResults: AssertionResult[];
};

type JestReport = {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  success: boolean;
  startTime: number;
  testResults: TestResult[];
};

/** 功能域归类。按顺序匹配，第一个命中的规则生效。 */
const AREAS: { area: string; pattern: RegExp; blurb: string }[] = [
  {
    area: 'Agent 与检索',
    pattern:
      /(agent|semantic|knowledge|recommendation|NoteSearch|ask-ai|askai)/i,
    blurb: 'Agent 循环、工具调用、笔记范围、混合检索与排序融合',
  },
  {
    area: '任务与日程',
    pattern:
      /(dashboard|todo|Recurrence|RelativeDate|Completion|DateContext|Reminder|Ownership|summarizeTodos)/i,
    blurb: '待办提取、相对日期改写、周期展开、任务归属与提醒',
  },
  {
    area: '模型与语音',
    pattern:
      /(\/tts\/|\/llm\/|transcription|whisper|parakeet|runtime|\/stt\/|Transcription)/i,
    blurb: 'TTS 引擎与音色、模型激活与删除保护、转写与取消、运行时安装',
  },
  {
    area: '数据与可靠性',
    pattern:
      /(database|trash|export|workflow|workspace|migration|blob|storage|Storage|persist)/i,
    blurb: '数据迁移、导出、回收站、工作流与会话持久化',
  },
  {
    area: '界面与交互',
    pattern:
      /(renderer|components|pages|Tour|Hud|Onboarding|Navigation|Shortcut|Accelerator|Markdown|Dialog|Panel|Card|Layout|App\.test)/i,
    blurb: '导航、弹窗、HUD、快捷键、引导教程、拖放与窄屏布局',
  },
  {
    area: '主进程与系统',
    pattern: /(\/main\/|ipc|background|startup|settings|audio)/i,
    blurb: '主进程 IPC、后台任务、启动流程与设置模式',
  },
];

function classify(suitePath: string): string {
  const relative = path.relative(PROJECT_ROOT, suitePath).replace(/\\/g, '/');
  const hit = AREAS.find((item) => item.pattern.test(relative));
  return hit?.area ?? '其他';
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 从 jest 的套件报错文本里抓出第一条真正的错误行，去掉 ANSI 色码。 */
function firstErrorLine(message: string): string {
  const plain = message
    // eslint-disable-next-line no-control-regex
    .replace(/\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const hit =
    plain.find((line) => /error TS\d+|Cannot find|SyntaxError/.test(line)) ??
    plain.find((line) => !line.startsWith('●')) ??
    '未知错误';
  return hit.replace(/\|/g, '\\|').slice(0, 160);
}

const STATUS_MARKS: Record<string, string> = {
  passed: '✓',
  failed: '✗',
};

function statusLabel(status: string): string {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '失败';
  if (status === 'pending' || status === 'skipped' || status === 'disabled')
    return '跳过';
  if (status === 'todo') return '待办';
  return status;
}

function runJest(reportPath: string): void {
  process.stdout.write('正在运行 jest（这一步比较慢）…\n');
  // 直接调 jest 的 JS 入口，不走 npx：新版 Node 出于安全考虑禁止 spawn .cmd/.bat，
  // 走 npx.cmd 会以 status=null 静默失败，看不出原因。
  const jestEntry = path.join(
    PROJECT_ROOT,
    'node_modules',
    'jest',
    'bin',
    'jest.js',
  );
  if (!fs.existsSync(jestEntry)) {
    throw new Error(`找不到 jest 入口: ${jestEntry}`);
  }
  const result = spawnSync(
    process.execPath,
    [jestEntry, '--silent', '--json', `--outputFile=${reportPath}`],
    { cwd: PROJECT_ROOT, stdio: 'inherit' },
  );
  // jest 有失败用例时退出码非 0，但报告仍然写出来了，所以不在这里中断。
  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `jest 没有生成报告文件（退出码 ${result.status}${
        result.error ? `，${result.error.message}` : ''
      }）`,
    );
  }
}

function main(): void {
  const provided = flagValue('--from');
  const reportPath =
    provided ?? path.join(os.tmpdir(), 'speakspace-jest-report.json');
  if (!provided) runJest(reportPath);

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as JestReport;
  const suites = report.testResults
    .map((suite) => ({
      relative: path.relative(PROJECT_ROOT, suite.name).replace(/\\/g, '/'),
      area: classify(suite.name),
      durationMs: suite.endTime - suite.startTime,
      status: suite.status,
      message: suite.message ?? '',
      assertions: suite.assertionResults,
    }))
    .sort(
      (a, b) =>
        a.area.localeCompare(b.area) || a.relative.localeCompare(b.relative),
    );

  const areas = [...AREAS.map((item) => item.area), '其他'].filter((area) =>
    suites.some((suite) => suite.area === area),
  );

  const lines: string[] = [];
  lines.push('# Jest 自动化测试清单');
  lines.push('');
  lines.push(
    `生成时间：${new Date(report.startTime).toISOString().slice(0, 19).replace('T', ' ')} · ` +
      '生成方式：`npm run test:inventory`',
  );
  lines.push('');
  lines.push(
    '这份清单由 Jest 的机器可读报告直接渲染，不是手写的。它回答的是「那 N 项测试到底是哪些」，' +
      '任何人都可以复跑 `npm test` 核对。',
  );
  lines.push('');

  lines.push('## 总计');
  lines.push('');
  lines.push('| 项目 | 数量 |');
  lines.push('| --- | --- |');
  lines.push(`| 测试套件 | ${report.numTotalTestSuites} |`);
  lines.push(`| 套件通过 | ${report.numPassedTestSuites} |`);
  lines.push(`| 套件失败 | ${report.numFailedTestSuites} |`);
  lines.push(`| 套件跳过 | ${report.numPendingTestSuites} |`);
  lines.push(`| 测试用例 | ${report.numTotalTests} |`);
  lines.push(`| 用例通过 | ${report.numPassedTests} |`);
  lines.push(`| 用例失败 | ${report.numFailedTests} |`);
  lines.push(`| 用例跳过 | ${report.numPendingTests + report.numTodoTests} |`);
  lines.push('');
  lines.push(
    '> 这些是**回归测试**：它们证明的是「改动之后既有功能没有被破坏」，' +
      '不证明模型准确率。模型质量看 [待办提取评测](./task-extraction-eval.md) 和 ' +
      '[TTS 基准](./tts-model-benchmark-windows.md)。',
  );
  lines.push('');

  const brokenSuites = suites.filter(
    (suite) => suite.status === 'failed' && suite.assertions.length === 0,
  );
  if (brokenSuites.length > 0) {
    lines.push('## 编译失败的套件');
    lines.push('');
    lines.push(
      '这些套件**一条用例都没跑起来**（通常是 TypeScript 编译错误）。' +
        '它们不会体现在用例级的失败数里 —— 只看「失败 0」会误判为全绿。',
    );
    lines.push('');
    lines.push('| 套件 | 错误 |');
    lines.push('| --- | --- |');
    for (const suite of brokenSuites) {
      lines.push(
        `| \`${suite.relative}\` | ${firstErrorLine(suite.message)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 按功能域');
  lines.push('');
  // 图由 make-charts.ts 从本文件解析出的表格再生成，所以先出表格、后有图。
  if (
    fs.existsSync(
      path.join(PROJECT_ROOT, 'docs/testing/charts/jest-by-area.svg'),
    )
  ) {
    lines.push('![按功能域的用例数](./charts/jest-by-area.svg)');
    lines.push('');
  }
  lines.push('| 功能域 | 套件 | 用例 | 通过 | 跳过 | 覆盖内容 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const area of areas) {
    const subset = suites.filter((suite) => suite.area === area);
    const assertions = subset.flatMap((suite) => suite.assertions);
    const blurb = AREAS.find((item) => item.area === area)?.blurb ?? '未归类';
    lines.push(
      `| ${area} | ${subset.length} | ${assertions.length} | ${
        assertions.filter((item) => item.status === 'passed').length
      } | ${
        assertions.filter(
          (item) => item.status !== 'passed' && item.status !== 'failed',
        ).length
      } | ${blurb} |`,
    );
  }
  lines.push('');

  lines.push('## 按套件');
  lines.push('');
  lines.push('| 套件 | 功能域 | 用例 | 通过 | 失败 | 跳过 | 耗时 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const suite of suites) {
    lines.push(
      `| \`${suite.relative}\` | ${suite.area} | ${suite.assertions.length} | ${
        suite.assertions.filter((item) => item.status === 'passed').length
      } | ${suite.assertions.filter((item) => item.status === 'failed').length} | ${
        suite.assertions.filter(
          (item) => item.status !== 'passed' && item.status !== 'failed',
        ).length
      } | ${(suite.durationMs / 1000).toFixed(1)} s |`,
    );
  }
  lines.push('');

  lines.push('## 全部用例');
  lines.push('');
  lines.push('按套件分组，逐条列出。');
  lines.push('');
  for (const area of areas) {
    lines.push(`### ${area}`);
    lines.push('');
    for (const suite of suites.filter((item) => item.area === area)) {
      lines.push(`**\`${suite.relative}\`**（${suite.assertions.length} 条）`);
      lines.push('');
      if (suite.assertions.length === 0) {
        lines.push('- （套件被跳过，未产生用例）');
      } else {
        for (const assertion of suite.assertions) {
          const mark = STATUS_MARKS[assertion.status] ?? '–';
          lines.push(
            `- ${mark} ${assertion.fullName.replace(/\|/g, '\\|')}${
              assertion.status === 'passed'
                ? ''
                : `（${statusLabel(assertion.status)}）`
            }`,
          );
        }
      }
      lines.push('');
    }
  }

  const target = path.join(
    PROJECT_ROOT,
    'docs',
    'testing',
    'jest-test-inventory.md',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${lines.join('\n').trimEnd()}\n`);
  process.stdout.write(
    `已生成 ${target}\n套件 ${report.numTotalTestSuites}，用例 ${report.numTotalTests}` +
      `（通过 ${report.numPassedTests}，失败 ${report.numFailedTests}，跳过 ${
        report.numPendingTests + report.numTodoTests
      }）\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${(error as Error)?.stack ?? error}\n`);
  process.exitCode = 1;
}
