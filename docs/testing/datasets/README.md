# 测试集总览

这个目录只放**测试集本身是什么**——数据从哪来、有多少条、怎么分类、金标是什么样。
测试结果和结论在上一层 `docs/testing/` 的各份报告里，不在这里。

每个测试集的机器可读版本是权威来源，本目录下的对应文档只是给人看的说明，
两者不一致时以代码为准。

| 测试集 | 条数 | 用在哪份报告 | 机器可读源文件 |
| --- | --- | --- | --- |
| [TTS / STT 共用语料](./tts-stt-shared-corpus.md) | 36 | [TTS 基准](../tts-model-benchmark-windows.md)、STT 录音的原文来源 | [tts-corpus.json](../../../scripts/benchmark/tts-corpus.json) |
| [待办提取语料](./todo-extraction-corpus.md) | 54（开发集 22 / 保留集 32） | [待办提取评测](../task-extraction-eval.md) | [todo-extraction-corpus.ts](../../../scripts/benchmark/todo-extraction-corpus.ts) |
| [Agent 评测语料](./agent-eval-corpus.md) | 80 条笔记 / 90 个任务（开发集 45 / 保留集 45） | [Agent 端到端评测](../agent-end-to-end-eval.md)、[检索质量评测](../retrieval-eval.md) | [agent-eval-corpus.ts](../../../scripts/benchmark/agent-eval-corpus.ts) + [agent-eval-tasks-v2.ts](../../../scripts/benchmark/agent-eval-tasks-v2.ts) |
| [STT 真人录音](./stt-human-recordings.md) | 56 段真人朗读 | [STT 真人评测](../stt-human-eval.md) | [stt-recording-corpus.ts](../../../scripts/benchmark/stt-recording-corpus.ts) + [stt-human-recordings/](./stt-human-recordings/)（原始音频） |

## 都不是公开标准数据集

四份测试集全部是针对这个产品的场景手工构造的，不是 AISHELL、LibriSpeech 这类公开基准。
这样做的理由和代价都要说清楚：

- **理由**：产品要测的是会议记录、任务安排这类办公场景下的中英文混合语音笔记，
  公开数据集不覆盖这个场景组合（中英混合口语 + 待办语义 + 本地知识库检索）。
- **代价**：测试集本身没有经过第三方验证，规模也远小于公开基准（几十到一百条量级）。
  这一点在每份测试集自己的文档里都会重复一次，不指望读者只看这一页就记住。

## 开发集 / 保留集是什么、为什么要分

待办提取和 Agent 评测都有这个拆分，规则一样：

- **开发集（dev）**：调提示词、调脚手架期间反复看过、改过的那部分。分数天然偏乐观，
  只能当回归基线，不能当泛化能力的证据。
- **保留集（holdout）**：方案定稿之后才写、定稿之后没有再针对它调整过任何东西。
  这才是回答"这套流水线到底行不行"的那一半。

这个项目里两者的差距曾经很大：Agent 脚手架在 8 条早期开发集上做出「50% → 100%」的提升，
换到保留集直接掉到 36.7%。样本太小时，开发集上的"提升"本质是在拟合噪声，
这也是后来把开发集从 8 条扩到 45 条的原因，见 [Agent 评测语料](./agent-eval-corpus.md)。
