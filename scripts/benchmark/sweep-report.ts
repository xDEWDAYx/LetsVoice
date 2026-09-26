/**
 * 本地 LLM 横向扫描的报告。
 *
 * 单独成文件而不是塞进 make-reports.ts：这份报告的重点和其他几份不同 ——
 * 它要同时呈现准确率、推理代价和硬件占用，并且刻意强调**单一聚合指标会骗人**
 * （F1 高的模型可能同时在大量无任务文本上凭空造词）。
 */

/* eslint-disable no-restricted-syntax */

import path from 'path';
import {
  chart,
  fixed,
  Json,
  mib,
  percent,
  readJson,
  RESULTS,
  table,
} from './report-format';

export default function buildSweepReport(): string | null {
  const data = readJson('llm-sweep.json');
  if (!data) return null;
  const models = (data.models as Json[]).filter((item) => item.runtime);
  if (models.length === 0) return null;

  const scored = models.filter((item) => item.accuracy);
  const withAgent = models.filter((item) => item.agent);
  const byF1 = [...scored].sort(
    (a, b) => Number(b.accuracy.holdout_f1) - Number(a.accuracy.holdout_f1),
  );
  const byFalsePositive = [...scored].sort(
    (a, b) =>
      Number(a.accuracy.zero_task_false_positive_rate) -
      Number(b.accuracy.zero_task_false_positive_rate),
  );
  const byAgent = [...withAgent].sort(
    (a, b) =>
      Number(b.agent.holdout_case_pass_rate ?? b.agent.case_pass_rate) -
      Number(a.agent.holdout_case_pass_rate ?? a.agent.case_pass_rate),
  );
  const maxVram = Math.max(
    ...models.map((item) => Number(item.runtime.peak_gpu_memory_mib ?? 0)),
  );

  const lines: string[] = [];
  lines.push('# 本地 LLM 横向扫描');
  lines.push('');
  lines.push(
    `测试日期：${String(data.measured_at).slice(0, 10)} · 生成方式：\`npm run bench:sweep -- --with-agent\` → \`npm run bench:charts\` → \`npm run bench:report\``,
  );
  lines.push('');
  lines.push(
    '对本地优先的产品来说，选型不是「哪个模型最准」，而是**「在这台机器上，哪个模型在真实任务上够用」**。' +
      '所以这份报告把三件事放在一起看：准确率、推理代价、以及模型到底跑在 GPU 还是 CPU 上。',
  );
  lines.push('');

  lines.push('## 实验设置');
  lines.push('');
  const platform = (data.platform ?? {}) as Json;
  lines.push(
    table(
      ['项目', '值'],
      [
        ['GPU', String(data.gpu ?? 'n/a')],
        ['CPU', String(platform.cpu ?? 'n/a')],
        ['系统', String(platform.os ?? 'n/a')],
        ['内存', mib(platform.total_memory_bytes)],
        ['运行时', 'Ollama（应用自带）'],
        ['温度', '0.1'],
        ['轮数', `${data.rounds} 轮`],
        ['待办提取语料', String(data.corpus)],
        [
          'Agent 语料',
          withAgent[0]
            ? `80 条固定笔记、${withAgent[0].agent.task_count} 个任务 × ${withAgent[0].agent.rounds_run} 轮`
            : '80 条固定笔记',
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '**换模型时提示词、语料与判定规则一字未改**，因此 holdout 依然有效，五个模型之间可以直接横向比较。',
  );
  lines.push('');

  lines.push('## 总表');
  lines.push('');
  lines.push(
    table(
      [
        '模型',
        '参数',
        '吞吐 tok/s',
        '首 token',
        '峰值显存',
        'GPU 卸载',
        '待办 F1（holdout）',
        '零任务假阳性率',
        'Agent 完成率',
      ],
      models.map((item) => [
        `\`${item.model}\``,
        String(item.parameter_size ?? '?'),
        fixed(item.runtime.median_tokens_per_second, 1),
        `${Number(item.runtime.median_first_token_latency_ms ?? 0).toFixed(0)} ms`,
        `${item.runtime.peak_gpu_memory_mib ?? '?'} MiB`,
        percent(item.runtime.gpu_offload_ratio, 0),
        item.accuracy ? percent(item.accuracy.holdout_f1) : 'n/a',
        item.accuracy
          ? percent(item.accuracy.zero_task_false_positive_rate)
          : 'n/a',
        item.agent ? percent(item.agent.case_pass_rate) : 'n/a',
      ]),
    ),
  );
  lines.push('');

  lines.push('## GPU 与显存');
  lines.push('');
  lines.push(chart('llm-gpu-offload.svg', 'GPU 卸载比例与显存占用'));
  lines.push(
    [
      '「GPU 卸载比例」= Ollama `/api/ps` 报告的 `size_vram ÷ size`：1 表示整个模型都在显存里，',
      '小于 1 表示显存放不下、部分层回落到 CPU，吞吐会明显下降。显存数字由 `nvidia-smi` 采样交叉验证。',
      '',
      `**本轮五个模型全部 100% 跑在 GPU 上。** 占用最多的一个是 ${maxVram} MiB，` +
        '离 6144 MiB 的显存上限还有余量，因此没有观察到 CPU 回落。',
      '',
      '**这也意味着本轮测不出显存墙。** 五个模型都在 1.5B–3.8B、体积不超过 3 GB；',
      '要看到「模型大到放不进显存」的拐点，需要再加一个 7B 量级的模型。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 速度');
  lines.push('');
  lines.push(chart('llm-throughput.svg', '生成吞吐'));
  lines.push(chart('llm-first-token.svg', '首 token 延迟'));
  lines.push('');

  lines.push('## 准确率');
  lines.push('');
  lines.push(chart('llm-accuracy-by-size.svg', '准确率对比'));
  lines.push(chart('llm-accuracy-vs-speed.svg', '速度-精度帕累托'));
  if (byF1.length > 0) {
    lines.push(
      `按待办提取保留集 F1 排序：${byF1
        .map((item) => `\`${item.model}\` ${percent(item.accuracy.holdout_f1)}`)
        .join('、')}。`,
    );
    lines.push('');
  }

  lines.push('### 但 F1 会骗人：零任务假阳性率');
  lines.push('');
  lines.push(chart('llm-false-positive.svg', '零任务假阳性率'));
  lines.push(
    [
      '「零任务假阳性率」= 在「这段话里没有任何待办」的用例上，模型仍然产生了至少一条待办的比例。',
      '对待办应用来说，**凭空往用户清单里塞任务比漏掉一条更糟** —— 前者要用户逐条删，后者只是少一项。',
      '',
      '这一列会把 F1 的排名整个翻过来（按假阳性率从低到高）：',
      '',
      ...byFalsePositive.map(
        (item) =>
          `- \`${item.model}\`：假阳性率 **${percent(item.accuracy.zero_task_false_positive_rate)}**，F1 ${percent(item.accuracy.holdout_f1)}`,
      ),
      '',
      '**这正是单一聚合指标的危险之处**：F1 把「该抽的抽到了」和「不该抽的没抽」压成一个数，',
      '而这两类错误对用户的代价完全不同。选型时两个数必须一起看。',
    ].join('\n'),
  );
  lines.push('');

  if (byAgent.length > 0) {
    lines.push('## Agent：工具调用能力才是分水岭');
    lines.push('');
    lines.push(chart('llm-agent-tool-use.svg', '工具调用与完成率'));
    lines.push(chart('llm-agent-vs-todo.svg', '两类任务的表现对比'));
    lines.push(
      table(
        [
          '模型',
          'Agent 完成率（保留集）',
          'Agent 完成率（全部）',
          '事实覆盖率',
          '答案模式准确率',
          '平均工具调用',
          '平均模型轮数',
          '范围违规',
        ],
        byAgent.map((item) => [
          `\`${item.model}\``,
          item.agent.holdout_case_pass_rate !== null
            ? percent(item.agent.holdout_case_pass_rate)
            : 'n/a',
          percent(item.agent.case_pass_rate),
          percent(item.agent.fact_coverage),
          percent(item.agent.answer_mode_accuracy),
          fixed(item.agent.mean_tool_calls, 2),
          fixed(item.agent.mean_model_turns, 2),
          percent(item.agent.scope_violation_rate),
        ]),
      ),
    );
    lines.push('');
    lines.push(
      [
        '**平均工具调用次数几乎完全决定了 Agent 完成率**，而它与参数量无关：',
        '',
        ...byAgent.map(
          (item) =>
            `- \`${item.model}\`（${item.parameter_size ?? '?'}）：每任务调用工具 ${fixed(item.agent.mean_tool_calls, 2)} 次 → 保留集完成率 ${item.agent.holdout_case_pass_rate !== null ? percent(item.agent.holdout_case_pass_rate) : 'n/a'}`,
        ),
        '',
        '几乎不调用工具的模型只能凭上下文作答，检索不到的信息就编、或者干脆不答。',
        '**同一批模型在待办提取和 Agent 上的排名并不一致** —— 单步抽取做得好，不代表会用工具。',
        '选型必须按实际任务类型分别验证，不能用一个「模型能力」总分代替。',
      ].join('\n'),
    );
    lines.push('');
  }

  // 逐模型提示词调优：这一节回答的是「上一轮的排名有多少是提示词适配造成的」
  const tuning = readJson('llm-tuning-comparison.json');
  if (tuning) {
    const tuned = (tuning.models as Json[]).filter((item) => item.delta);
    const summary = tuning.summary as Json;
    lines.push('## 逐模型提示词调优');
    lines.push('');
    lines.push(
      [
        '上面的对比有一个致命前提：所有模型共用同一套为 `qwen2.5` 调过的提示词。',
        '于是「模型能力差」和「模型不适应这套提示词」分不开。这一节就是来消除它的。',
        '',
        '**实验设计**：',
        '',
        '- 六个提示词变体，都是在线上提示词上**追加**规则而不是重写（线上那份仍是唯一真实来源，追加内容可 diff）。',
        `- 变体的**选择只在开发集 22 条上做**，脚本里 \`--split dev\` 是写死的，命令行绕不过去。`,
        '- 保留集 32 条在调优期间**完全没有被读取**；选定后冻结，再用它同时评估对照臂和实验臂。',
        `- 选择准则明确写死：\`${String(tuning.selection_rule)}\`。`,
        '',
        '选择准则不单看 F1，是因为待办应用里凭空造任务比漏掉更糟；系数 0.5 是主观的，但它被写出来了，而不是藏在「综合表现最好」这种话里。',
      ].join('\n'),
    );
    lines.push('');
    lines.push(
      table(
        [
          '模型',
          '选定变体',
          '针对的问题',
          '保留集 F1',
          '保留集通过率',
          '零任务假阳性率',
        ],
        tuned.map((item) => [
          `\`${item.model}\``,
          `\`${item.chosen_variant}\``,
          String(item.variant_describe ?? '—'),
          `${percent(item.before.holdout_f1)} → ${percent(item.after.holdout_f1)}`,
          `${percent(item.before.holdout_case_pass_rate)} → ${percent(item.after.holdout_case_pass_rate)}`,
          `${percent(item.before.zero_task_false_positive_rate)} → ${percent(item.after.zero_task_false_positive_rate)}`,
        ]),
      ),
    );
    lines.push('');
    lines.push(chart('llm-tuning-effect.svg', '调优前后保留集 F1'));
    lines.push(chart('llm-tuning-false-positive.svg', '调优对假阳性的影响'));
    lines.push(chart('llm-dev-vs-holdout-gain.svg', '开发集与保留集涨幅对比'));
    lines.push('');
    lines.push('### 结果是混合的，这本身就是结论');
    lines.push('');
    lines.push(
      [
        `**${summary.model_count} 个模型里，保留集 F1 改善 ${summary.holdout_f1_improved} 个、退步 ${summary.holdout_f1_regressed} 个。**`,
        '逐模型调优**没有**普遍提升能力。三件事值得单独说：',
        '',
        '1. **只有 `granite4:micro-h` 是明确改善**：F1 +2.3 个点、用例通过率 +5.2 个点，' +
          '而零任务假阳性率从 54.5% 降到 9.1%。它原本的问题确实是提示词，不是能力。',
        '',
        `2. **有 ${summary.overfitted_to_dev} 个模型出现了对开发集的过拟合** —— 开发集 F1 涨了，保留集反而掉了。` +
          '`ministral-3` 是最典型的：开发集综合分涨了 0.091，保留集 F1 却掉了 1.6 个点、通过率掉了 7.3 个点。' +
          '**如果只报开发集的数字，这次调优看起来会是全面成功。**',
        '',
        '3. **有些问题提示词治不了**：`qwen2.5:1.5b` 的零任务假阳性率在全部六个变体下都卡在 63–67%，' +
          '一个都没降到可接受范围。那是能力边界，不是提示词问题。',
        '',
        '还有一个跨模型的观察：**同一段追加规则在不同模型上效果可以完全相反**。' +
          '`strict-empty+json-only` 在开发集上让 `granite4` 得 92.3%，却让 `qwen2.5:3b` 掉到 15.4% —— 77 个百分点的反向摆动。' +
          '这直接证实了「共用一套提示词的横向对比」确实混着「谁更像 qwen2.5」的成分。',
      ].join('\n'),
    );
    lines.push('');
  }

  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      `- 只覆盖 ${models.length} 个模型，全部在 1.5B–3.8B 区间、体积不超过 3 GB。这**不是尺寸曲线**，更接近同尺寸的跨架构对比。`,
      '- 没有 7B 及以上的模型，因此观察不到显存不足导致的 CPU 回落，也画不出「大到什么程度就不划算」的拐点。',
      '- 只在一台机器（RTX 3060 Laptop 6 GiB）上测。换显卡或纯 CPU 机器，速度与卸载结论都会变。',
      '- 待办提取的输入是干净文本，不含转写错误；真实链路上的表现会更差。',
      '- Agent 的 LLM Judge 未经人类校准，本表引用的是可复核的严格规则判分。',
      '- 逐模型提示词调优只试了 6 个变体、每个变体在开发集上跑 2 轮，**不是充分的提示词搜索**；某个模型仍可能存在没被试到的更好写法。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 可复现方法');
  lines.push('');
  lines.push('```bash');
  lines.push(
    'npm run bench:sweep -- --with-agent   # 速度 + 待办提取 + Agent，逐个模型串行',
  );
  lines.push(
    'npm run bench:llm                     # 只测速度、显存与 GPU 卸载',
  );
  lines.push('npm run bench:charts');
  lines.push('npm run bench:report');
  lines.push('```');
  lines.push('');
  lines.push(
    `原始 JSON：\`${path.join(RESULTS, 'llm-sweep.json')}\`、\`${path.join(RESULTS, 'llm-runtime.json')}\``,
  );
  lines.push('');
  return lines.join('\n');
}
