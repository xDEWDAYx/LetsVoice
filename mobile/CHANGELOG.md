# Changelog

本文件记录 LetsVoice Local Mobile 面向组内测试的稳定版本。iOS 安装包不发布到 App Store，二进制资产附在团队仓库对应的 GitHub Release 中。

## [1.6.2] - 2026-09-03

### Changed

- 首页品牌文字由 `LETSVOICE-LOCAL` 精确调整为 `LetsVoice`；其余界面、功能、样式与兼容标识保持不变。
- App version 更新为 `1.6.2`，iOS build number 更新为 `9`。

发布记录：[LetsVoice iOS v1.6.2](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.2)

## [1.6.1] - 2026-09-03

### Changed

- 将当前 App 的产品名称、界面文案、权限说明、本地 PDF 标记及 SideStore 发布资产统一为 LetsVoice。
- 保留现有 Bundle ID、URL scheme、数据库名、通知 ID、仓库名和 package 名等小写技术标识，确保 iOS 覆盖安装、深链和本地数据继续兼容。
- App version 更新为 `1.6.1`，iOS build number 更新为 `8`；本版不包含功能行为变更。

发布记录：[LetsVoice iOS v1.6.1](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.1)

## [1.6.0] - 2026-08-28

### Added

- 录音完成后使用当前本地 LLM 自动生成与桌面端规则一致的 Note 标题；没有可用模型或生成失败时立即保留带时间戳的可编辑标题，不阻塞保存。
- 原 Workspaces 底部入口升级为 Library，在同一页面内提供 Notes 与 Workspaces 两个一级视图；Notes 保留跨资源搜索、增量加载、置顶和未完成 Task 筛选。
- Library Notes 使用两个独立的 iOS 原生下拉胶囊筛选器，分别选择 All Notes、Pinned、Open Tasks 和 All Category、具体分类。

### Changed

- 暂停录音只停止继续采集音频；已进入本地 STT 队列的音频会继续完成推理并更新文本，队列排空后才允许恢复或结束录音。
- Finish 直接完成录音并打开 Save transcription，不再出现无实际作用的完成确认；保存弹窗使用关闭图标，弹窗与遮罩统一淡入淡出。
- Home 移除 Note 列表，把 Overview 收进紧凑入口，并按 Start transcription、Tasks、Calendar 的顺序突出核心流程。
- Note detail 的 Structured Note 标题与 Translate、Copy、Read 操作在竖直方向居中，并移除重复的说明文本。

### Fixed

- 修复真实 iPhone 转写中的中文日期空格、繁体字和名词型事件提醒可能被过滤的问题；“9 月 10 号开会，请提前 3 天提醒我”会稳定落到 9 月 7 日。
- 修复暂停时 iOS 原生录音 stop 没有可等待完成边界，导致最后一段缓冲音频与 STT 切片竞争的问题。
- 修复 Library 筛选器在真机上继承过宽容器并越过屏幕边界的问题；两个原生 Picker 现在按内容独立测量，不再嵌套外层筛选卡片。
- 修复无效或仅有月份精度的日期可能被 Calendar 或本地通知误解释为具体日期的问题。

发布记录：[SpeakSpace iOS v1.6.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.0)

## [1.5.0] - 2026-08-26

### Added

- Home 新增跨资源搜索，可同时命中 Note、Transcript、Structured Note、Knowledge 和关联 Ask AI conversation，并从结果直达相应内容。
- Home Note 列表和录音保存时的 Workspace 选择列表增加固定高度、分批加载、滚动与搜索，避免大量数据把后续内容顶出页面。
- 为跨资源搜索增加 SQLite schema v13 索引迁移，使用批量查询和内存缓存，避免逐 Note 的 N+1 查询。
- Calendar 只以尚未完成且有日期的 Task 作为数据源，并在有待办的日期显示主题色圆点。

### Changed

- iOS 的 Task 日期预处理移植 Windows 桌面端确定性规则：相对日期先按 Note 创建时的本地日期重写，再交给本地 LLM 提取，重新生成时不会随当天日期漂移。
- Workspace 列表、Workspace detail、Note detail、Settings 和 AI 管理页面重新整理信息层级与紧凑操作；重命名、删除、移动和导出等次要操作统一收纳或改为就地编辑。
- Expo SDK 57 相关依赖对齐到当前官方推荐 patch，并重新生成 iOS 原生工程、安装 CocoaPods 后复跑模拟器与真机 Release 构建。
- 所有受控弹窗支持点击背景关闭，文本 Close 改为图标；录音保存时的 Workspace 选择弹窗也沿用相同关闭规则。
- Structured Note 保留 Summary、Key points、Tasks 三类内容，移除低准确率的独立 Reminders 和 Calendar 分类；Translate、Copy、Read 改为同一行图标操作。
- 全局导航栏、状态栏、Calendar 和弹窗背景跟随 Light、Dark、System 主题；返回操作只显示图标，Settings 的外观选择改为紧凑单行分段控件。
- AI Management 移除重复的 Text-to-Speech Models 入口，只保留一个 TTS 管理项。

### Fixed

- 修复 iOS 与 Windows 对“周五”“下周三”“一周后”“月底”和提前提醒等表达计算出不同 Task 日期的问题。
- 修复主题切换后部分原生顶部区域或 Calendar 仍保留上一主题颜色的问题。
- 修复 Workspace 较多时标题、搜索框和新建入口随列表一起滚走，以及空 Workspace 同时出现两个 Create Note 入口的问题。
- 修复 Home 搜索只覆盖 Note 基本文本、精确结果可能被模糊匹配噪声淹没，以及旧异步结果覆盖新查询的问题。

发布记录：[SpeakSpace iOS v1.5.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.5.0)

## [1.4.0] - 2026-08-26

### Added

- Home 日历同时展示 Structured Note 中的事件、待办截止日期和提醒；结构化时间缺失时可从原始 transcript 提取有明确依据的日期，并避免同日重复。
- Task 和 Reminder 支持 iOS 本地通知，点击通知可回到来源 Note；权限由用户主动开启，修改、完成或删除后会重新同步通知计划。
- Note detail 支持导出 PDF 并打开 iOS 系统分享面板；单 Note 导出不会泄露关联多 Note 对话的正文。
- 新增英语首次使用引导、可重新打开的操作指南和字体大小设置；iOS 界面只提供英语。
- Note detail 显示关联的 Ask AI 对话并允许继续；Ask AI 新增安全 Markdown 渲染、阶段进度、自动朗读开关和可见 spinner。
- Workspace 在空白或默认命名场景提供确定性名称建议，须由用户确认后才会应用。

### Changed

- Ask AI、Structured Note 和 Knowledge 使用从请求进入队列即开始计算的硬 deadline，并支持安全取消排队中或正在运行的本地推理。
- 新录音或导入音频先保存原始 Note，再自动进入 Structured Note 生成与审核；生成失败不会丢失 transcript 或录音路径。
- iOS 用户界面统一为英语，同时继续支持多语言 transcript、STT、TTS 和内容处理。

### Fixed

- 修复原有 Ask AI 90 秒配置没有覆盖排队、模型加载和保存阶段的问题，并保证取消后本地推理仍保持 FIFO 串行状态。
- 修复 Structured Note 未给出时间戳时 Home 无法显示原文明确日期，以及 fallback 与结构化日程重复的问题。
- 修复模型输出中的 Markdown 标记可能作为原始符号显示给用户的问题；HTML、脚本、远程图片和非 HTTPS 链接不会成为可执行内容。

发布记录：[SpeakSpace iOS v1.4.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.4.0)

## [1.3.0] - 2026-08-24

### Added

- Settings 新增统一 Trash，覆盖 Note、Workspace、Ask AI conversation 和自定义 Knowledge template，并支持恢复与永久删除。
- Home、Workspace 和 Search 新增长按多选，可批量移动、移入 Trash、置顶和取消置顶。
- Ask AI 支持同时选择最多三篇 Note，自定义 Knowledge template 支持结构草稿、编辑和不可变生成历史。
- Note 保存后自动分类并允许手动修改；搜索使用本地关键词与有限错拼匹配，不需要下载 Embedding 模型。
- Task 支持置顶，以及 daily、weekdays、weekly、biweekly 和 monthly 五种滚动周期。

### Changed

- 多 Note Ask AI 按 Note 均衡分配上下文，内容较长时优先给出有边界的 best-effort answer；聊天界面不显示来源列表。
- 删除流程由立即删除改为 soft delete；永久删除在事务内处理关联数据，再清理音频文件。
- Expo SDK 57 依赖对齐到官方推荐 patch，并重新同步 CocoaPods 和真机 Release 构建。

### Fixed

- 修复批量操作部分成功时可能留下不一致状态的问题，整批操作现在在同一 SQLite 事务内提交或回滚。
- 修复单 Note 与多 Note 会话可能错误恢复到不同来源集合的问题。
- 修复周期 Task 完成后重复生成、遗漏工作日跳转或恢复到错误 occurrence 的边界情况。

发布记录：[SpeakSpace iOS v1.3.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.3.0)

## [1.2.0] - 2026-08-24

### Added

- Ask AI 等待本地模型回复时显示处理中状态，并将会话和消息持久化到本地 SQLite。
- 新增统一的 `SafeAreaModal`，让新建、重命名、编辑、移动等编辑弹窗默认位于安全区域内的屏幕中央。
- Structured Note 生成增加停止原因识别、JSON 完整性检查、分段重试和确定性降级路径。

### Changed

- Ask AI 直接使用当前锁定笔记的 transcript 作为回答依据，增强中英文问题的证据抽取和短问题匹配。
- 本地 LLM 的上下文与输出预算按 Ask AI 和 Structured Note 场景分别配置；Structured Note 的 token 上限从旧值提高，并同时限制批次长度，避免只提高上限造成等待时间和内存占用失控。
- 日期与时间解析支持更多英文表达和 24 小时制写法。

### Fixed

- 修复笔记中存在答案时 Ask AI 仍返回“信息不足”的误判。
- 修复较长 Structured Note 输出在 JSON 中途被截断后显示“unreadable result”的问题。
- 修复 Move note 及其他编辑弹窗可能顶到 iPhone 状态栏的问题。
- 修复跨页面返回后 Ask AI 对话消失的问题。

发布记录：[SpeakSpace iOS v1.2.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.2.0)

## [1.1.0] - 2026-08-23

- 新增 Light、Dark、System 主题偏好。
- Home 展示完整 Task 列表并支持完成和恢复。
- AI、Structured Note 和 Knowledge 内容支持本地 TTS 朗读、暂停和续播。

发布记录：[SpeakSpace iOS v1.1.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.1.0)

## [1.0.0] - 2026-08-21

- 首个组内 iPhone 稳定版，包含本地录音转写、音频导入、笔记、Workspace、模型管理和 Ask AI 基础能力。

发布记录：[SpeakSpace iOS v1.0.0](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.0.0)
