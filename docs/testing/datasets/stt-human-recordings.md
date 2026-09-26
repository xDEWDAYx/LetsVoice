# STT 真人录音：56 段

机器可读源文件：[stt-recording-corpus.ts](../../../scripts/benchmark/stt-recording-corpus.ts)（录音文件到原文的映射）
原始音频：[stt-human-recordings/](./stt-human-recordings/)（56 个 `.m4a` 文件，约 22 MiB）

朗读者：1 人，中文母语者。文本全部取自 [TTS / STT 共用语料](./tts-stt-shared-corpus.md) 的 36 条，
分三段录制，条件不同：

| 段 | 内容 | 条数 | 打分方式 |
| --- | --- | --- | --- |
| A | 安静环境，照原文逐字朗读 | 36 | 严格 CER |
| B | 看一眼原文合上后，用自己的话自然复述 | 12 | 仅内容覆盖率（不算 CER，复述不要求逐字一致） |
| C | 照原文逐字朗读，有轻度背景噪音（键盘声/风扇声） | 9 | 严格 CER |

朗读怎么读、录音条件怎么控制的完整协议，见 [STT 人工录音协议](../stt-recording-protocol.md)。
测出来的结果和结论见 [STT 真人评测报告](../stt-human-eval.md)。

## A 段：36 条（等于共用语料全集）

按共用语料的顺序全部朗读一遍，ID 与内容见 [TTS / STT 共用语料](./tts-stt-shared-corpus.md)。

## B 段：12 条（自然复述）

| ID | 语言 |
| --- | --- |
| `zh_basic_02` | 中文 |
| `zh_numeric_01` | 中文 |
| `zh_datetime_01` | 中文 |
| `zh_technical_01` | 中文 |
| `en_basic_02` | 英文 |
| `en_numeric_01` | 英文 |
| `en_datetime_01` | 英文 |
| `en_technical_01` | 英文 |
| `zh_en_mixed` | 中英混合 |
| `mixed_numeric_01` | 中英混合 |
| `mixed_datetime_01` | 中英混合 |
| `mixed_technical_01` | 中英混合 |

## C 段：9 条（有背景噪音，逐字朗读）

| ID | 语言 |
| --- | --- |
| `zh_short` | 中文 |
| `zh_proper_01` | 中文 |
| `zh_acronym_01` | 中文 |
| `en_short` | 英文 |
| `en_proper_01` | 英文 |
| `en_acronym_01` | 英文 |
| `mixed_basic_02` | 中英混合 |
| `mixed_proper_01` | 中英混合 |
| `mixed_acronym_01` | 中英混合 |

C 段的 9 条是 A 段 36 条里的一个子集（同一人读），这样才能在"安静 vs 有噪音"之间做同文本对比。

## 文件名到原文的映射是怎么确认的

录音 App 生成的文件名只是连续编号（`录音.m4a`、`录音 (2).m4a` ...），不带任何文本 ID。
映射关系不是按顺序猜的，而是用 whisper-large-v1 转写若干锚点文件、核对转写内容跟哪条原文对得上，
反推出来的完整映射，记录在 [stt-recording-corpus.ts](../../../scripts/benchmark/stt-recording-corpus.ts)
的 `VERIFIED_ANCHORS` 里。

其中一段录音（第 3 段）朗读者连着念完了两条文本才停止，映射表里对应两个 id，
评分时用拼接后的参考文本，不影响其余 55 段。

## 也用来测跨机器转写速度

这批录音除了测准确率，还被 [multi-machine-benchmark-guide.md](../multi-machine-benchmark-guide.md)
的 `stt` 硬件步骤复用：同一批音频在不同机器上转写，只看耗时（RTF），不重新算 CER——
换机器转写内容不会变，重新算 CER 只是浪费时间。

这批文件已经随 `docs/testing/datasets/stt-human-recordings/` 提交进 Git，
新机器克隆仓库后可以直接复用，不需要再手工拷贝。

## 已知局限

- **只有一位朗读者**，且是中文母语者，不能代表其他口音或非中文母语用户。
- **录音用手机自带 App 完成，不是应用内录音功能直接产出**，采样率、增益、降噪处理跟应用真实的
  麦克风采集路径不完全一致。
- **每条文本大多只录了一次**，个别识别失败可能是单次误读，不代表模型的系统性弱点。
- B 段的"自然复述"允不允许偏离原文没有量化标准，由朗读者自行判断"意思对得上"的程度。
