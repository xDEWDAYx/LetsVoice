# 在一台新机器上跑基准

## 推荐：Windows / macOS 双击运行

Windows 直接双击仓库根目录的 **`一键跨机硬件测速.cmd`**；macOS 在 Finder 中双击
**`一键跨机硬件测速-Mac.command`**。两者都会询问机器标签和测速范围，自动处理依赖检查、
Ollama 启动、硬件基准和 ZIP 打包。除 Node.js LTS 外，不需要手工拼命令。

如果 macOS 提示脚本没有执行权限，在仓库根目录运行一次：

```bash
chmod +x 一键跨机硬件测速-Mac.command scripts/benchmark/run-cross-machine-benchmark-macos.sh
```

下面的命令行步骤保留给需要定制运行范围或排查环境问题的开发者。

## 零、先准备这台机器

`npm run bench` 是一条命令，但它需要仓库、依赖和模型都就位。按你想测什么，选一档：

### A 档：只要 LLM 速度与 GPU（约 10 分钟准备，2 分钟出结果）

想知道「这台机器带不带得动模型、多快」，走这一档就够了。
**不需要原生依赖**，LLM 探针只用 Node 内置模块。

```bash
git clone <仓库地址> && cd speakspace
npm ci --ignore-scripts          # 跳过 Electron 下载与原生模块重建，快很多
# 启动 Ollama（用应用自带的那个，或系统装的 ollama 都行）
ollama serve &
# 模型不用自己拉：bench 会自动补齐固定的那 5 个（约 10 GiB，只下缺的）
npm run bench -- --machine <标签> --only llm
```

### B 档：完整基准（准备 20–40 分钟，跑 6–8 小时）

> 全量 STT 是大头：16 个 whisper 模型跑同一批录音，较快的机器就要约 5 小时，
> 外加首次约 18 GiB 的模型下载。这是为了让每台机器都有完整的一列，
> 不想等就用 `--only` 挑步骤，或 `npm run bench:stt -- --models tiny,small` 单跑几档。

要 TTS 的速度和内存曲线，就得装原生依赖（`sherpa-onnx-node`、`onnxruntime-node`）。

```bash
git clone <仓库地址> && cd speakspace
npm install                      # 会下载 Electron 并重建原生模块，比较慢
npm run bench:tts:fetch          # 下载三个 TTS 模型，约 910 MiB，带 sha256 校验
ollama serve &                   # LLM 那步需要
npm run bench -- --machine <标签>
```

`bench:tts:fetch` 从 GitHub Releases 和 HuggingFace 拉模型，那台机器要能访问这两个域名。
拉不动的话可以从已有机器把模型目录整个拷过去，路径见文末「结果目录在哪」里 `models/` 那部分说明。

### 标签怎么起

**每台机器一个唯一且稳定的标签**，汇总表靠它区分：`3060-laptop`、`m4-mac`、`office-nuc`、`server-xeon`。
不要两台机器用同一个标签 —— 后拷回来的会覆盖先拷回来的。

## 一条命令

```bash
npm run bench -- --machine <这台机器的标签>
```

标签自己起，能认出是哪台就行：`3060-laptop`、`m4-mac`、`office-nuc`、`server-xeon`。
**一定要给标签** —— 不给的话会退回主机名哈希，汇总表里读不出是哪台机。

它会做四件事：

1. 采集机器指纹（CPU、核心数、内存、GPU、显存、驱动版本、系统）
2. 串行跑完所有**对硬件敏感**的基准
3. 把结果收进 `results/machines/<标签>/`
4. 打印结果目录路径

跑完把那个目录整个拷回主控机的同一路径下，然后在主控机上：

```bash
npm run bench:aggregate   # 生成跨机器总表
npm run bench:charts      # 生成跨机器对比图
```

## 跑之前

**别的事都停下。** 速度和内存是时间敏感量，并行会让数据直接作废 ——
本仓库实测过：并行跑一次 `tsc`，Kokoro 的 RTF 从 0.79 掉到 4.4，整轮数据报废。

依赖缺了会自动跳过，不会报错中断：

| 依赖 | 缺了会跳过 | 怎么装 |
| --- | --- | --- |
| TTS 模型 | TTS 的三项基准 | `npm run bench:tts:fetch`（约 910 MiB，按应用内 catalog 下载并校验 sha256） |
| Ollama 在跑 | LLM 吞吐与 GPU | 启动应用自带的 `runtimes/llm/bin/ollama serve`，`OLLAMA_MODELS` 指向应用模型目录 |
| LLM 模型（固定 5 个） | LLM 吞吐与 GPU | **不用手动拉**，`npm run bench` 会自动补齐（约 10 GiB，只下缺的）；也可单独跑 `npm run bench:llm:fetch` |
| whisper 运行时 + STT 模型（全部 16 个） | STT 转写速度 | **不用手动装**，`npm run bench` 会自动补齐（约 18 GiB，只下缺的）；也可单独跑 `npm run bench:stt:fetch`，走的是应用自己的安装逻辑 |
| STT 录音文件 | STT 转写速度 | 已随仓库保存在 `docs/testing/datasets/stt-human-recordings/` |
| `nvidia-smi` | 显存与驱动信息 | 无 N 卡时自动降级，不影响其他指标 |

## 默认跑什么、不跑什么

**跑**（这些换机器会变）：

| 步骤 | 测什么 | 大约耗时 |
| --- | --- | --- |
| `tts` | 三个 TTS 模型 × 36 条语料 × 3 次，P50/P95 RTF、峰值内存、信号有效性 | 40–90 min |
| `tts-memory` | 连续合成时 RSS 是否累积（强制 GC 后采样） | 20–40 min |
| `tts-length` | 峰值内存随文本长度的变化，决定最低内存门槛 | 10–20 min |
| `llm` | **固定 5 个模型**的 tokens/s、首 token 延迟、显存、**GPU 卸载比例** | 2 min/模型，约 10 min |
| `stt` | **目录里全部 16 个** whisper 模型转写同一批真人录音的 RTF（**不算 CER**） | tiny 约 1.5 min，small 约 7 min，medium 约 20 min，large 各约 38 min；**合计约 5 小时**（CPU 推理，体积越大越不成比例地慢） |

> **为什么 LLM 和 STT 的模型集合是固定的**：跨机器要回答的是「**同一个**模型换台机器
> 快多少、显存放不放得下」。早期版本测的是「这台机器上恰好装了什么」，结果 LLM 那边
> 一台机器只有 1 个模型、另一台 2 个、第三台 5 个；STT 那边一台只有 `small`、
> 另一台 3 档、开发机 13 档。`cross-llm-gpu.svg` 和 `cross-stt-rtf.svg` 里一大半柱子
> 是空的，根本没法对读。
>
> 现在集合**直接取自应用自己的模型目录**（`config/llm-catalog.json`、
> `config/stt-catalog.json`），即 LLM 全部 5 个、whisper 全部 16 个，
> 由 `scripts/benchmark/llm-benchmark-models.ts` 和 `stt-benchmark-models.ts` 读出来。
> 缺的由 bench 自动补齐，并且跑的时候用 `--models` 钉住——只装不钉还不够，
> 机器上多装了别的模型同样会让某台机器多出几列。
>
> 目录里新增模型时，跨机器基准会自动跟着测，不需要改基准脚本。
> 唯一被排除的是 `parakeet-tdt-0.6b-v2-int8`：它是 sherpa-onnx 引擎、不是 `.bin`，
> `bench:stt` 跑的是 whisper-cli，测不了它，下载了也不会多出一根柱子。
>
> 想只测部分模型，用 `npm run bench:llm -- --models a,b` 或
> `npm run bench:stt -- --models a,b` 单独跑，不影响跨机器表。

**默认不跑**（这些换机器不会变）：待办提取准确率、Agent 端到端、STT 的 CER/内容覆盖率。
它们取决于模型和提示词（或者对 STT 来说，取决于同一份音频和同一个模型），不取决于硬件
—— 在每台机器上重跑几小时只会得到同样的数字。待办/Agent 准确率要跑：
`npm run bench -- --machine <标签> --with-accuracy`；STT 准确率本来就该只在一台机器上
跑一次，见 [STT 真人评测](./stt-human-eval.md)，不需要额外的开关。

## 只补缺的那几步（省时间）

已经测过的机器不必从头再跑一遍。用 `--only` 挑步骤：

```bash
npm run bench -- --machine <标签> --only llm,stt
```

步骤 id：`tts`、`tts-memory`、`tts-length`、`llm`、`stt`。
Windows 一键脚本对应有 `-Mode stt` 和 `-Mode llm-stt` 两个模式（菜单里的 [4] [5]），
`-Mode stt` 连 Ollama 都不会启动。

**这样做是安全的**：本机结果目录里，没被选中的步骤的结果文件不会被动。
被选中但**跳过或失败**的步骤，旧文件也会原样留着——早期版本不是这样，
「只补 `--only llm` 却忘了开 Ollama」会把这台机器已有的 `llm-runtime.json` 删掉，
现在只有真正跑成功的步骤才会覆盖自己那份旧数据。

怎么知道哪台机器缺什么：`npm run bench:aggregate` 生成的表里，`—` 就是缺的格子。

## 汇总产物

`npm run bench:aggregate` 生成 [cross-machine-benchmark.md](./cross-machine-benchmark.md)，包含：

- 机器清单（CPU / 核心 / 内存 / GPU / 类别）
- TTS 合成速度跨机器对比，带 RTF = 1 可用下限参考线
- TTS 峰值内存对比（配合各机内存判断「扛不扛得住」）
- LLM 吞吐对比
- **GPU 卸载比例对比** —— 判断「这台机器能带动多大模型」最直接的依据
- STT 转写速度对比（不含准确率）

`npm run bench:charts` 生成对应的跨机器图（机器数 ≥ 2 时才画）。

## 常见问题

**结果目录在哪？**
固定在仓库内：`docs/testing/results/machines/<机器标签>/`，跟代码放在一起，
**不受 `TTS_BENCHMARK_ROOT` 影响**——这样结果才能直接 `git add`、提交、推到 GitHub 给所有人看。
下载的 TTS 模型二进制文件不在这里，那部分体积太大不适合进仓库，仍然在系统缓存目录
（Windows `%LOCALAPPDATA%\SpeakSpace-TTS-Benchmark\models\`，macOS/Linux 同名 `models/`）。

**同一台机器跑两次会怎样？**
覆盖自己那份，不影响其他机器的目录。

**在容器或沙箱里跑，结果找不到？**
先看命令最后打印的绝对路径。正常情况下应该落在仓库的 `docs/testing/results/` 下；
如果不是，说明沙箱把 `PROJECT_ROOT` 解析到了别处，以打印出来的路径为准。

**结果占多大地方，提交前要注意什么？**
JSON 数据本身很小，但 TTS 基准会把合成出来的 WAV 音频也存进 `docs/testing/results/wav/`
（几个模型跑下来上百 MB），是刻意保留的——为了以后能直接拿这些音频做人工听测评分，
不是需要清理的冗余文件。为保持整个 `docs/` 可复核，重采样音频和 whisper 逐条输出也跟随
测试报告一起提交；模型权重和运行时仍然只保存在用户目录，不进入 Git。

**新机器上 STT 步骤被跳过了？**
whisper 运行时和全部 16 个模型现在由 `npm run bench` 自动安装，正常情况下不需要手动准备。
还是被跳过的话，多半是 56 段真人录音不在
`docs/testing/datasets/stt-human-recordings/`（这批文件不一定跟着分发到每台机器），
或者自动安装失败了——单独跑 `npm run bench:stt:fetch` 能看到具体是哪一档没装上。
依赖缺失时 `stt` 会自动跳过（不报错）。这一步只影响转写**速度**——CER 不受影响，
因为它不在跨机器测试范围内。
