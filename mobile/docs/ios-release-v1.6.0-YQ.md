# SpeakSpace iOS v1.6.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.6.0` 是面向组内 iPhone 测试的当前稳定版，基于团队仓库 `main` 封版。它不提交 App Store；Mac 端可以用 Xcode 以同一 Bundle ID 安装，Windows 端可以从 GitHub Release 下载未签名 IPA，再由每位测试者使用 SideStore 和自己的 Apple Account 重新签名。Android 不在本版开发或验收范围内。

本版围绕一次完整的“录音 → 实时转写 → 保存 Note → 查看 Task”链路收口。核心目标是让暂停只影响音频采集而不截断已录内容的转写，让录音完成后自动得到可用标题，并把 Notes、Workspaces、Tasks 与 Calendar 放到更清晰的信息层级中。它也补上了真实 iPhone 中文转写中日期空格、繁体字和名词型会议提醒的边界。

## 本版实现与用户可见变化

- 暂停录音后不再停止已有音频的本地 STT 推理。界面先显示 `Paused · Completing transcript…`，继续接收并展示已录内容，队列排空后改为 `Transcript up to date`；排空期间 Resume 与 Finish 暂时禁用，避免切片状态竞争。
- Finish 直接完成录音，不再出现冗余确认。空 transcript 仍会明确提示无法保存，关闭已经完成的 Save transcription 弹窗仍需要确认永久丢弃，保留真正有数据损失风险的保护。
- Save transcription 打开时立即填入时间戳 fallback 标题，并在本地 LLM 可用时按桌面端同一提示词生成短标题。用户一旦开始编辑，迟到的模型结果不会覆盖手动输入；没有模型或推理失败也不影响保存。
- 原 Workspaces 底部入口改为 Library，但底部仍保持四个选项卡：Home、Library、AI、Settings。Library 内部使用 Notes / Workspaces 两个一级视图，避免增加第五个底部入口。
- Home 不再直接承载 Note 列表；Overview 收进顶部紧凑按钮和弹窗，主体顺序固定为 Start transcription、Tasks、Calendar。删除了 Overview 弹窗和 Home 底部的重复说明文本。
- Library Notes 保留 Note、Structured Note、Knowledge 与 Ask AI 的本地跨资源搜索、分类、Pinned、Open Tasks 和分批加载；筛选改为同一行两个独立 SwiftUI 原生胶囊菜单 `All Notes` 与 `All Category`，不再嵌套外层卡片。
- Note detail 删除 Structured Note 下的 `Summary, key points, and tasks.`，并让标题在 Translate、Copy、Read 三个操作按钮的竖直高度上居中。
- `SafeAreaModal` 从 slide 改为 fade，遮罩不再跟随卡片从底部升起或一起向下滚走。

## 暂停与转写排空的实现

旧逻辑在暂停时调用 `RealtimeTranscriber.nextSlice()`，但这个方法只保证当前切片进入 `whisper.rn` 队列，不保证队列中的本地推理已经完成。同时，`@fugood/react-native-audio-pcm-stream` 的 iOS `stop` 原生桥接没有 Promise 返回值，JavaScript 的 `await stop()` 不能建立“AudioQueue 已同步停止并排空缓冲”的可靠边界。这两个异步层叠加后，暂停状态可能先于最后一段文字到达界面。

本版新增幂等 postinstall patch，把 iOS `stop` 改为 Promise bridge，并只在 `AudioQueueStop(..., true)`、buffer 释放和 queue dispose 完成后 resolve。如果依赖源码结构变化，patch 会明确失败而不是静默跳过。`flushCurrentTranscriptionSlice` 随后调用 `nextSlice()`，再等待 `processingPromise`、`transcriptionQueue` 和 `isTranscribing` 同时进入空闲状态。录音页面将“采集已暂停”和“已录文本仍在完成”拆成两个 UI 状态，避免把暂停错误解释为取消推理。

自动回归既覆盖可控 fake queue，也直接实例化当前锁定版本的 `whisper.rn` `RealtimeTranscriber`，验证一个已开始处理的 slice 与 pause 时强制生成的最终 slice 都在排空 Promise resolve 前产生文本。另有结构回归固定 native stop patch、postinstall 接线和页面 busy 状态。

## 自动标题与本地推理协调

标题提示词逐字对齐桌面端 Studio：只输出标题本身，跟随内容语言，中文少于 20 个字符、英文少于 8 个词。输入最多使用 transcript 前 2,000 个字符；输出只取第一行，去除包裹引号和结尾标点，并限制为 80 个字符。生成使用当前激活的本地 LLM，不上传 transcript，也不把模型打入 IPA。

`NoteTitleGenerationService` 作为 `note-title` 操作进入现有 `LocalLlmCoordinator` FIFO，复用 Ask AI / Translation 的短任务 context 与 cache 生命周期，避免同时创建第二个 native llama context。Save transcription 弹窗先显示确定性的本地时间 fallback，因此标题推理不是保存的前置条件；request id 与 `noteNameEditedRef` 同时防止弹窗已关闭、下一次录音已开始或用户已编辑时写入过期结果。

## Task 日期与日历边界

v1.5.0 已把桌面端确定性日期标注层移植到 iOS；本版针对真机实际 transcript `我9月10號有一場工作會議請你麻煩提前3天 提醒我` 补齐三项边界：绝对日期与提前量允许转写插入空格；繁体 `號／會議` 继续归一；显式提醒中的具体名词事件在没有“参加”等动作动词时仍视为可执行 Task。内部日程词、提醒请求和 filler 被剥离后必须剩余具体中英文主题，避免把只有“提醒我”的空句误恢复为 Task。

固定 reference 为 2026-08-26 时，`9 月 10 号开会，请提前 3 天提醒我` 会先标注为 `9 月 10 号(2026-09-10)…提前 3 天(2026-09-07)…`，最终 Task 的 actionable date 为 2026-09-07。Calendar 与通知规划器同时增加严格 ISO 前缀和真实年月日检查；只有月份精度、无效日期或任意可被 `Date` 宽松解析的文本不会再变成具体日程。

## 信息架构与原生筛选器

Notes 从 Home 移入 Library 后，没有复制第二套查询逻辑；原跨资源搜索、destination 去重、分类、置顶、Open Tasks 和每批 20 条的增量加载集中到 `LibraryNotesPane`。Home 只负责录音入口、全局 Task 和 Calendar，Overview 只按需展示统计卡，从而减少首屏的细节密度。

Library 的两个筛选器使用 Expo SDK 57 `@expo/ui/swift-ui` `Picker`，每个 Picker 都拥有独立 `Host`，并使用 `matchContents`、`pickerStyle("menu")`、`buttonStyle("bordered")`、`buttonBorderShape("capsule")` 和 `controlSize("small")`。这里没有外层筛选卡、固定屏幕宽度或菜单内再嵌套二级菜单；真机与模拟器会各自按原生内容尺寸计算，解决旧实现只在真机上横向越界的问题。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.6.0` |
| App version | `1.6.0` |
| iOS build | `7` |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.6.0.ipa` |
| IPA size | 33,085,602 bytes |
| SHA-256 | `88c3d27422c7b8012a3f5029a310ba2aad883ba0002bde4eab4caf6894af597c` |
| Public IPA JavaScript bundle | 5,136,121 bytes |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.0>

公开 IPA 不包含开发者签名、provisioning profile 或 macOS 归档元数据，仅供 SideStore 使用测试者自己的 Apple Account 重新签名。本机 Personal Team 签名 `.app` 由同一源码构建，只用于连接真机验收，不上传 GitHub。

## 发布前验证

- 最终版本元数据上的全量 Node 回归为 139 passed、0 failed；新增覆盖录音 pause queue drain、真实 `whisper.rn` 排空、iOS stop patch、自动标题、Library 信息架构、两个原生筛选器、真实中文会议提醒、严格 Calendar 与 notification 日期输入。
- `npx tsc --noEmit` 通过；ESLint 为 0 error、12 个既有 React Hook dependency warning；`git diff --check` 通过。
- `npx expo install --check` 返回 dependencies up to date；`npx expo-doctor` 为 21/21；生成配置确认 SDK 57、App `1.6.0`、iOS build `7`、iPhone-only 与最低 iOS 16.4。
- `npm audit --omit=dev --audit-level=high` 没有 high 或 critical，仍报告 13 个 Expo CLI、config plugin、Xcode/ngrok 工具链经 `uuid` 带入的 moderate 公告。`npm audit fix --force` 会降级到不兼容的 Expo，因此不用于本版。
- 从干净 Expo Prebuild 和 CocoaPods 环境分别完成 Personal Team 签名 iPhoneOS Release 与 iOS Simulator Release；两次构建均为 0 error、3 warning。warning 来自重复 `-lc++`、Swift job discovery 输出及 Expo Dev Launcher build phase 未声明 outputs，没有业务源码编译错误。
- 签名 iPhoneOS `.app` 通过 `codesign --verify --deep --strict` 和项目 verifier；产物为 arm64、`1.6.0 (7)`、最低 iOS 16.4、`UIDeviceFamily = [1]`，包含 5,136,121-byte 离线 JavaScript bundle。
- iPhone 17 Pro / iOS 26.5 模拟器安装最终 Release 后，使用 Bundle ID 直接冷启动而不是依赖 Expo deep link；启动返回 PID 58869，Home 可见顺序为录音、Tasks、Calendar，底部为四个选项卡。
- 连接的 iPhone 16 Pro Max 已先卸载旧 App，并在设备清单确认同 Bundle ID 不存在后全新安装 `1.6.0 (7)`。卸载最后一个 Personal Team App 后，首次自动启动被 iOS 明确以开发者 profile 需要重新信任为由拒绝；用户在设备设置中重新信任后，最终 App 启动成功，CoreDevice 进程清单确认 PID 26718 正在运行。这个过程区分了系统信任门与应用运行结果。
- 公开 IPA 通过 `unzip -t`、独立 SHA-256 复算和全部 archive entry 扫描；归档根只有 `Payload/`，没有 `_CodeSignature`、`embedded.mobileprovision`、其他 `.mobileprovision` 或 `__MACOSX`。归档内 Info.plist 再次确认为 `1.6.0 (7)`、iPhone-only、最低 iOS 16.4。

> Evidence:
> - Source: `CHANGELOG.md`, `app.json`, `package.json`, `src/app/transcription.tsx`, `src/services/realtime-transcription-drain.ts`, `scripts/patch-audio-pcm-stream-ios-stop.mjs`, `src/services/note-title.ts`, `src/services/note-title-generation-service.ts`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/library.tsx`, `src/components/library-notes-pane.tsx`, `src/services/core-note-insight-generation-policy.ts`, `tests/*.test.mjs`, `scripts/verify-ios-release.mjs`, `scripts/package-ios-sidestore.mjs`
> - Method: diff 与敏感材料审计、Node/TypeScript/Lint/Expo 质量门、安全审计、真实转写 fixed-reference 回归、干净 Prebuild、签名真机 Release、模拟器 Release 冷启动、真机清装、IPA 解包和 checksum 复算，以及发布后的 GitHub 回读
> - Confidence: High；自动回归、签名产物、模拟器可见启动、真机清装与启动进程、公开 IPA 有直接证据；任意自然口语的本地 LLM Task 召回率仍不能由确定性日期层保证

## 已知边界与回滚

- 暂停会等待已录音频的 STT 队列排空，因此极慢设备或很长的最终 slice 可能在短时间内保持 `Completing transcript…`；这是为了不丢最后一段文字，而不是继续录音。
- 自动标题需要已下载并激活的本地 LLM；否则使用时间戳 fallback。标题生成失败不会阻止用户编辑或保存 Note。
- 已保存的旧 Structured Note 不自动重算；需要用户在 Insights 中主动 Regenerate 才会应用本版补齐的真机转写边界。
- LLM、STT 和 TTS 模型不打入 IPA，需要在 AI 页面由用户主动下载。模型下载会联网并应保持 App 在前台；笔记、录音、Workspace、聊天和推理继续保存在设备本地。
- 本轮没有在真实 Windows + SideStore 环境重新签名安装，也没有把模拟器自动回归冒充为任意真机上的完整本地 LLM 端到端准确率测试。
- 真机运行 iOS 27.0 beta，而本机为 macOS 26.6.2、Xcode 26.6 / iOS 26.5 SDK。当前 CoreDevice、DDI、签名和安装链路可用，但系统 beta 或 Xcode 更新后需要重新跑真机验收。
- 免费 Personal Team / SideStore 签名通常需要每 7 天刷新。刷新或覆盖安装前不要卸载有重要数据的 SpeakSpace；卸载会让 iOS 删除本地容器。本次清装是按测试要求主动执行，设备上的旧测试数据已被删除。

上一稳定版 `ios-v1.5.0` 及其 Release 资产继续保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.5.0>。若需要回滚程序版本，应先导出或备份重要数据，再评估使用同一 Bundle ID 覆盖安装；不要用卸载回滚保留中的真实数据。
