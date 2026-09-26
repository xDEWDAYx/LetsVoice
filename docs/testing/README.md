# 测试与评测总览

这个目录下带「生成」标记的报告都由脚本生成，数据来自实际运行，不是手写的。
手写文档负责协议、方法和缺口清单；结论性分析会明确标为「手写分析」，并链接自动报告与
原始 JSON，不作为数据源的替代品。

## 先看这两份，再决定读哪份报告

1. **[datasets/README.md](./datasets/README.md)** —— 我们到底用了哪些测试集。
   每份测试集单独一个文件：多少条、怎么分类、开发集/保留集怎么拆、金标长什么样、
   机器可读源文件在哪。**测试集内容只在这里，不会在报告或协议文档里重复出现。**
2. **[test-coverage-gaps.md](./test-coverage-gaps.md)** —— 测过什么、没测过什么、为什么。

## 先分清两类测试

这是读下面这些报告最重要的一件事：

| | **跨机器会变** | **跨机器不会变** |
| --- | --- | --- |
| 测什么 | 速度、内存、显存、GPU 卸载 | 准确率、召回、假阳性 |
| 取决于 | 硬件 | 模型 + 提示词 + 语料 |
| 在新机器上要不要重跑 | **要** | 不要，几小时只会得到同样的数字 |
| 入口 | `npm run bench -- --machine <标签>` | `npm run bench:sweep` 等，只在主控机跑一次 |

在新机器上跑基准，看 **[multi-machine-benchmark-guide.md](./multi-machine-benchmark-guide.md)**；
Windows 双击根目录的 `一键跨机硬件测速.cmd`，macOS 双击
`一键跨机硬件测速-Mac.command`，细节也在那份文档里。

## 目录里有什么

```
README.md                          ← 你在这里，导航
test-coverage-gaps.md              手写  测过什么、没测过什么、为什么
multi-machine-benchmark-guide.md   手写  在新机器上跑基准的操作手册
manual-acceptance.md               手写  平台构建边界 + 安装包手工验收
stt-recording-protocol.md          手写  STT 人工录音怎么录（环境、语气、设备）

datasets/                          手写  测试集本身：条数、分类、金标、源文件位置
  README.md                        总览：四份测试集分别是什么、用在哪份报告
  tts-stt-shared-corpus.md         TTS 合成基准 / STT 真人录音共用的 36 条语料
  todo-extraction-corpus.md        待办提取语料，54 条
  agent-eval-corpus.md             Agent 评测语料，80 笔记 / 90 任务
  stt-human-recordings.md          STT 真人录音清单，56 段
  stt-human-recordings/            原始 .m4a 音频（56 个文件）

cross-machine-benchmark.md         生成  多机硬件对比总表
m2-pro-16gb-hardware-benchmark-conclusion.md
                                    手写分析  M2 Pro 16GB 全套硬件基准结论与建议
tts-model-benchmark-windows.md     生成  三个 TTS 模型的完整基准
stt-human-eval.md                  生成  真人 STT 准确率（tiny/base/small/large-v1）
llm-model-sweep.md                 生成  五个 LLM 横向扫描 + 逐模型调优
task-extraction-eval.md            生成  待办提取准确率
agent-end-to-end-eval.md           生成  Agent 端到端
retrieval-eval.md                  生成  检索质量（跳过 LLM，直接测混合检索）
jest-test-inventory.md             生成  Jest 全部用例清单

charts/                            全部由 bench:charts 生成

results/                            生成  各评测脚本的原始输出，报告和图表都从这里读
  <脚本名>.json                     每次运行覆盖同名文件；调优/消融实验的文件名带变体和子集
  wav/                              TTS 合成出的音频样本，供以后的人工听测使用
  machines/<机器标签>/              每台机器的跨机器基准结果，bench:aggregate 从这里读
```

标「生成」的文件**不要手工编辑** —— 下次运行对应命令会整份覆盖。要改内容改生成器
（`scripts/benchmark/make-reports.ts`、`sweep-report.ts`、`test-inventory.ts`、`aggregate-machines.ts`）。

`results/` 跟其他「生成」文件不一样的地方：它**提交进 git**，跟着仓库分享到 GitHub——
这是刻意的，测试结果需要所有人能看到，不能只留在跑测试那个人的本地缓存里。
重采样音频和 whisper 逐条输出也保留在 `results/` 中，确保整个 `docs/` 都能被复核。
下载的 TTS/STT 模型二进制文件体积太大（几百 MB 到近 1 GiB），不放进这里，
仍然留在系统缓存目录，见 [multi-machine-benchmark-guide.md](./multi-machine-benchmark-guide.md)。

## 报告索引

### 跨机器（换机器会变）

| 报告 | 回答的问题 | 对应图表 |
| --- | --- | --- |
| [cross-machine-benchmark.md](./cross-machine-benchmark.md) | 换台机器会快多少、够不够跑 | `cross-tts-rtf` `cross-tts-memory` `cross-llm-throughput` `cross-llm-gpu` |
| [m2-pro-16gb-hardware-benchmark-conclusion.md](./m2-pro-16gb-hardware-benchmark-conclusion.md) | M2 Pro 16GB 全套测试通过后应怎样选型、有哪些风险（手写分析） | 引用跨机总表与本机原始 JSON |
| [tts-model-benchmark-windows.md](./tts-model-benchmark-windows.md) | 三个 TTS 模型的速度、内存、可懂度 | `panel-tts-speed` `panel-tts-memory` `panel-tts-quality` |

### 与机器无关（模型能力）

| 报告 | 回答的问题 | 能证明 | 不能证明 | 对应图表 |
| --- | --- | --- | --- | --- |
| [stt-human-eval.md](./stt-human-eval.md) | STT 转写真人语音准不准 | 单一说话人在 4 档 whisper 模型上的 CER 与内容覆盖率、噪音鲁棒性 | 多说话人、多口音下的表现；朗读者非英语母语，中英文差距里混了发音因素 | `panel-stt` |
| [llm-model-sweep.md](./llm-model-sweep.md) | 五个本地模型哪个够用 | 同一套语料下的准确率、假阳性、逐模型提示词适配效果 | 换提示词框架后的表现；只试了 6 个变体 | `llm-*` `panel-llm-*` |
| [task-extraction-eval.md](./task-extraction-eval.md) | 待办提取准不准 | 54 条验收用例上的 P/R/F1、日期准确率、假阳性率 | 真实录音上的表现（输入是干净文本） | `panel-todo` |
| [agent-end-to-end-eval.md](./agent-end-to-end-eval.md) | Agent 能不能把事办成 | 90 个任务上的完成率、工具轨迹、范围约束与终止行为 | 真实用户问题分布；Judge 未经人类校准 | `panel-agent` |
| [retrieval-eval.md](./retrieval-eval.md) | 混合检索算法本身准不准（不掺 LLM 会不会用它） | 跳过 LLM、直接用任务原文查询时的 Recall@K / MRR / nDCG | LLM 实际会不会调用检索、会不会拼查询词（那是 Agent 报告的检索一栏） | `panel-retrieval` |
| [jest-test-inventory.md](./jest-test-inventory.md) | 自动化测试到底有哪些 | 改动之后既有功能没被破坏 | 模型准确率、用户体验 | `jest-by-area` |

### 手工验收 / 手工协议

[manual-acceptance.md](./manual-acceptance.md) —— 跨平台构建边界与安装包验收步骤。
自动化测不到的只有这一块：**装完的包在真实系统上能不能用**。

[stt-recording-protocol.md](./stt-recording-protocol.md) —— STT 真人录音怎么录：
用什么设备、什么环境、什么语气。**录什么**（具体文本清单）在
[datasets/stt-human-recordings.md](./datasets/stt-human-recordings.md)。

## 命令速查

```bash
# —— 新机器上只需要这一条 ——
npm run bench -- --machine <标签>       # 跑完全部硬件基准并归档到本机目录
npm run bench:aggregate                 # 主控机上汇总所有机器
npm run bench:charts                    # 出图（含跨机器对比）

# —— 只在主控机跑一次的模型能力评测 ——
npm run bench:tts:fetch                 # 下载并校验三个 TTS 模型
npm run bench:tts:asr                   # Whisper 回转录算 CER
npm run bench:stt                       # 真人录音转写评测（需要先有录音，见 stt-recording-protocol.md）
npm run bench:todo                      # 待办提取评测
npm run bench:agent:seed                # 重建 Agent 评测库（80 笔记 / 90 任务）
npm run bench:agent                     # Agent 端到端
npm run bench:retrieval                 # 检索质量（跳过 LLM，直接测混合检索）
npm run bench:sweep -- --with-agent     # 五模型横向扫描
npm run test:inventory                  # Jest 清单
npm run bench:report                    # 渲染全部 Markdown 报告

# —— 优化实验（选择只在开发集做，保留集冻结）——
npm run bench:tune                      # 逐模型提示词调优
npm run bench:harness                   # 待办提取脚手架消融
npm run bench:agent:harness             # Agent 脚手架消融
npm run bench:tuning-diff               # 调优前后对比
```

## 三类测试的区别

**回归测试（`npm test`）** —— 断言式通过/失败。价值是「没有改坏」，数量多少不说明质量。

**模型评测（`bench:todo` / `bench:agent` / `bench:sweep` / `bench:stt`）** —— 有指标、有数据集、有基准环境。
关键是数据集怎么来的、拆没拆开发集与保留集、指标怎么定义——这些都在 [datasets/](./datasets/README.md) 里。

**硬件基准（`bench`）** —— 同一份工作负载在不同机器上跑，只比速度与资源。

## 已知缺口（摘要）

完整清单、每条的原因和做法见 **[test-coverage-gaps.md](./test-coverage-gaps.md)**：

- STT 真人评测只有单一说话人；待办提取的输入是干净文本，没引入 ASR 错误；
  Agent 未达可用水平（保留集最好 60.0%）；Agent 的 LLM Judge 未经人类校准；
  检索质量评测的查询词比真实用户提问更规整；TTS 音质只有回转录代理指标，没有人工 MOS；
  硬件基准已收集三台机器，但其中两台只有部分阶段数据，完整的全套结果仍只有一台。

这个项目反复踩到的五个坑（并行污染数据、内存指标定义错、小开发集骗人、结果文件静默覆盖、
语料扩容后旧结果不会自己失效）也写在 test-coverage-gaps.md 里，不在这里重复。
