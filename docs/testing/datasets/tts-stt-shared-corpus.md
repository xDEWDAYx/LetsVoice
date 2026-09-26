# TTS / STT 共用语料：36 条

机器可读源文件：[tts-corpus.json](../../../scripts/benchmark/tts-corpus.json)

这批文本被两份评测复用：

- **TTS 合成基准**——三个模型把这 36 条文本合成成语音，测速度、内存、Whisper 回转录可懂度代理。见 [TTS 基准报告](../tts-model-benchmark-windows.md)。
- **STT 真人录音**——一位真人朗读者按这 36 条文本录音，测真实语音输入下的转写准确率。见 [STT 真人录音](./stt-human-recordings.md) 和 [STT 真人评测报告](../stt-human-eval.md)。

两边用同一批文本是刻意的：这样"合成语音回转录的 CER"和"真人朗读的 CER"才能在同一批内容上直接对比，
不用担心是文本本身难度不同造成的差异。

## 构成

| 语言 | 条数 |
| --- | --- |
| 中文 | 12 |
| 英文 | 12 |
| 中英混合 | 12 |

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| basic | 9 | 日常口语句 |
| numeric | 6 | 数字、百分比、金额、编号 |
| datetime | 5 | 日期与时间点 |
| proper-noun | 3 | 人名、地名 |
| acronym | 3 | 英文缩写（OKR、KPI、API 等） |
| technical | 4 | 技术黑话 |
| punctuation | 3 | 语气与标点（问号、感叹号、省略号） |
| long | 3 | 长文本（每种语言各一条，24–1196 字符不等） |

数字/日期类文本在 `tts-corpus.json` 里额外带 `asr_references` 字段——同一个数字可以有几种
可接受的书面写法（比如"12.5%"和"百分之十二点五"），回转录评分时取其中 CER 最低的一种，
避免把正字法差异算成识别错误。

## 全部 36 条

| # | ID | 语言 | 类别 | 字符数 | 文本 |
|---|-----|------|------|------|------|
| 1 | `zh_short` | 中文 | basic | 24 | 人工智能正在改变我们记录、整理和检索知识的方式。 |
| 2 | `zh_basic_02` | 中文 | basic | 31 | 今天的会议纪要我已经整理好了，稍后发到群里，大家有问题随时提。 |
| 3 | `zh_basic_03` | 中文 | basic | 29 | 麻烦你把打印机的墨盒换一下，另外会议室的白板笔也快没水了。 |
| 4 | `zh_numeric_01` | 中文 | numeric | 39 | 本季度营收同比增长百分之十二点五，达到三千四百八十万元，环比增长百分之三点七。 |
| 5 | `zh_numeric_02` | 中文 | numeric | 39 | 会议室改到三零一，参会十二人，预算控制在四千二百元以内，联系电话尾号三三七八。 |
| 6 | `zh_datetime_01` | 中文 | datetime | 40 | 请在二零二六年九月十五号下午三点半之前把材料交给我，最迟不能晚于十六号上午十点。 |
| 7 | `zh_datetime_02` | 中文 | datetime | 31 | 下周一到周五每天早上九点十五分开晨会，周五下午四点做双周复盘。 |
| 8 | `zh_proper_01` | 中文 | proper-noun | 28 | 张伟和李梦琪负责对接深圳分公司，王建国那边由陈晓芸跟进。 |
| 9 | `zh_acronym_01` | 中文 | acronym | 48 | 这次 OKR 评审要同时看 KPI 和 ROI，数据从 CRM 系统导出，走 API 接口同步。 |
| 10 | `zh_technical_01` | 中文 | technical | 38 | 我们用向量检索加上倒数排名融合来做混合召回，嵌入模型跑在本地的中央处理器上。 |
| 11 | `zh_punct_01` | 中文 | punctuation | 35 | 真的吗？这也太快了吧！不过……我还是有点担心，万一线上出问题怎么办呢？ |
| 12 | `zh_long_01` | 中文 | long | 315 | 这次评审我先把背景交代一下。上半年我们把语音笔记的转写链路整个重写了一遍，主要解决三个问题：一是长录音的内存占用过高，二是中英混合场景下的断句不稳定，三是任务提取会把别人的事情算到用户头上。重写之后，转写的峰值内存下降了大约四成，断句错误明显减少，任务归属也加了一道复核。下半年的重点会转到检索这一侧，我们打算把关键词检索和向量检索合并成一路混合召回，再用倒数排名融合来排序。这块的难点不在算法本身，而在于本地设备的算力有限，嵌入模型必须足够小，同时又不能牺牲中文的召回质量。另外还有一个容易被忽略的问题，就是用户的笔记数量增长以后，全库检索的延迟会明显上升，所以我们需要提前设计增量索引和缓存策略。以上是背景，接下来说具体方案。 |
| 13 | `en_short` | 英文 | basic | 70 | Local speech synthesis keeps private notes on the user's own computer. |
| 14 | `en_basic_02` | 英文 | basic | 99 | I will send the meeting summary right after this call, so please review it before tomorrow morning. |
| 15 | `en_basic_03` | 英文 | basic | 86 | Could you replace the printer cartridge, and grab some new whiteboard markers as well? |
| 16 | `en_numeric_01` | 英文 | numeric | 129 | Revenue grew twelve point five percent to thirty four point eight million dollars, while costs dropped three point seven percent. |
| 17 | `en_numeric_02` | 英文 | numeric | 125 | Room three zero one, twelve attendees, budget capped at four thousand two hundred dollars, extension three three seven eight. |
| 18 | `en_datetime_01` | 英文 | datetime | 126 | Please submit the documents before three thirty PM on September fifteenth, twenty twenty six, and no later than the sixteenth. |
| 19 | `en_datetime_02` | 英文 | datetime | 116 | Stand up runs Monday through Friday at nine fifteen in the morning, with a retrospective every other Friday at four. |
| 20 | `en_proper_01` | 英文 | proper-noun | 94 | Katherine Nguyen and Rajesh Patel will work with the Shenzhen office alongside Bjorn Andersen. |
| 21 | `en_acronym_01` | 英文 | acronym | 108 | The OKR review covers KPI and ROI. Export the data from the CRM and sync it through the REST API over HTTPS. |
| 22 | `en_technical_01` | 英文 | technical | 127 | We combine keyword retrieval with vector retrieval and merge both rankings using reciprocal rank fusion on the local processor. |
| 23 | `en_punct_01` | 英文 | punctuation | 106 | Really? That was fast! But, honestly, I am still a little worried. What if something breaks in production? |
| 24 | `en_long_01` | 英文 | long | 1196 | Let me set the context before we go into the details. In the first half of the year we rewrote the entire transcription pipeline for voice notes, mainly to solve three problems: memory pressure on long recordings, unstable sentence segmentation when Chinese and English are mixed in one utterance, and task extraction that assigned other people's action items to the user. After the rewrite, peak memory during transcription dropped by roughly forty percent, segmentation errors became far less frequent, and task ownership now goes through a second review pass. For the second half of the year we will shift our attention to retrieval. The plan is to merge keyword search and vector search into a single hybrid recall path, and then order the results with reciprocal rank fusion. The hard part is not the algorithm itself, but the limited compute budget on a local device: the embedding model has to stay small without sacrificing recall quality in Chinese. There is also a problem that is easy to overlook, which is that latency for a full library search grows noticeably once a user accumulates thousands of notes, so we need incremental indexing and a caching strategy well before that point. |
| 25 | `zh_en_mixed` | 中英混合 | basic | 61 | SpeakSpace Local 可以在本地运行 text to speech，并保护用户的 private notes。 |
| 26 | `mixed_basic_02` | 中英混合 | basic | 44 | 明天的 standup 我可能会晚点到，这个 sprint 的 retro 记得排一下。 |
| 27 | `mixed_basic_03` | 中英混合 | basic | 45 | 这个 feature 的 UI 我还要再 polish 一下，估计要到下周才能 ship。 |
| 28 | `mixed_numeric_01` | 中英混合 | numeric | 60 | 这次 A B test 的 conversion rate 提升了百分之十二点五，sample size 是三千四百人。 |
| 29 | `mixed_numeric_02` | 中英混合 | numeric | 45 | 内存占用从一千二百四十八 MiB 降到六百六十三 MiB，实时因子从一点三一降到零点六四。 |
| 30 | `mixed_datetime_01` | 中英混合 | datetime | 39 | deadline 是九月十五号下午三点半，记得提前把 slides 发到群里。 |
| 31 | `mixed_proper_01` | 中英混合 | proper-noun | 41 | Kevin 和张伟负责新人的 onboarding，Sarah 那边由李梦琪对接。 |
| 32 | `mixed_acronym_01` | 中英混合 | acronym | 52 | 把 PR review 完之后，CI 跑通就可以 merge 到 main 分支，然后触发 CD 部署。 |
| 33 | `mixed_technical_01` | 中英混合 | technical | 73 | 我们用 RRF 融合 keyword search 和 semantic search，embedding 模型跑在 CPU 上，不依赖 GPU。 |
| 34 | `mixed_technical_02` | 中英混合 | technical | 48 | Whisper 的 CER 在中英混合样本上明显偏高，说明 ASR 回转录只能当作低置信度代理。 |
| 35 | `mixed_punct_01` | 中英混合 | punctuation | 47 | 什么？这个 bug 居然还在！我记得上周就 fix 了啊……要不要再 rollback 一次？ |
| 36 | `mixed_long_01` | 中英混合 | long | 507 | 先同步一下这个 sprint 的进展。transcription pipeline 的 refactor 已经 merge 了，long recording 的 peak memory 下降了大约四成，中英混合场景下的 segmentation 也稳定了很多。任务提取那块我们加了一道 ownership review，专门解决把别人的 action item 算到用户头上的问题。下一步的重点是 retrieval：我们打算把 keyword search 和 vector search 合并成一路 hybrid recall，然后用 reciprocal rank fusion 做排序。难点不在算法，而在本地设备的算力预算，embedding model 必须足够小，同时中文的 recall 不能掉。另外还有一个容易被忽略的点，就是 note 数量涨到几千条以后，full library search 的 latency 会明显上升，所以 incremental index 和 cache 策略要提前设计好。这些是 high level 的方向，具体的 milestone 我会在 doc 里写清楚。 |

## 已知局限

- 语料本身来自会议记录、任务安排这类办公场景，不覆盖医疗、法律等术语密集场景。
- 长文本只有 3 条（每种语言一条），长文本失败率的样本量不足以下结论。
- 不是公开数据集，未经第三方验证；构造者对内容有主观选择。
