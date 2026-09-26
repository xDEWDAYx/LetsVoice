# SpeakSpace iOS v1.5.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.5.0` 是面向组内 iPhone 测试的当前稳定版，基于团队仓库 `main` 封版。它不提交 App Store；Mac 端可以用 Xcode 以同一 Bundle ID 覆盖安装，Windows 端可以从 GitHub Release 下载未签名 IPA，再由每位测试者用 SideStore 和自己的 Apple Account 重新签名。Android 不在本版开发或验收范围内。

本版的目标不是增加另一套移动端日程模型，而是收紧 iOS 的信息层级、长列表和弹窗交互，并修复与 Windows 桌面端不一致的 Task 日期确定逻辑。Structured Note 仍由本地 LLM 识别可执行任务；日期表达在进入模型前先由确定性规则按 Note 创建时间重写，使“周五”“下周三”“一周后”“月底”和提前提醒等表达不会因重新生成日期或模型自行计算星期而漂移。

## 本版实现与用户可见变化

- Home 新增本地跨资源搜索：Note 标题和 transcript、Structured Note、Knowledge 结果以及关联 Ask AI conversation 都可命中并回到对应内容。Note 列表和保存录音时的 Workspace 选择列表使用有上限的滚动容器、分批加载和搜索，不再让长列表无限撑高页面。
- Calendar 只显示尚未完成且具有有效日期的 Task；有任务的日期使用主题色圆点标记。低准确率的独立 Reminder 和 Calendar insight 分类不再呈现，也不会作为 Home 日历的数据源。
- Workspace 列表固定顶部标题、搜索和新建入口，只滚动下方列表。Workspace detail 重新组织 Notes、数量、更新时间及更多操作；空 Workspace 只保留一个加号入口。
- Note detail 把主要信息和常用动作重新分级：标题支持就地重命名，Move to Workspace、Export PDF 和 Move to Trash 收入更多菜单；播放、Ask AI 等动作使用一致的紧凑样式。Transcript、Insights、Knowledge 和 Ask AI Conversations 的下半部内容结构保持不变。
- Structured Note 的 Translate、Copy、Read 改为同一行 icon 操作；Summary、Key points、Tasks 使用内容切换语义和指示线，不再伪装成三个独立提交按钮。
- 所有受控弹窗支持点击背景关闭，Close 文本统一改为关闭 icon。返回按钮只保留返回图标；导航栏、状态栏、Calendar、弹窗和 Settings 的 Light、Dark、System 选择均跟随当前主题。
- AI Management 删除重复的 Text-to-Speech Models 入口。iOS 界面继续只提供英语；中文等语言仍可作为录音、转写和本地 AI 内容处理输入。

## 日期一致性修复的实现细节

Windows 端在 Task 提取前使用 `RelativeDateRewriter`，旧 iOS 则主要依赖 LLM 输出自然语言日期后再解析；两条管线并不等价。本版新增 `core-note-date-rewriter`，将桌面端规则移植为独立、无模型依赖的预处理层：一次性日期写成 `phrase(YYYY-MM-DD)`，周期任务写成 `phrase(YYYY-MM-DD, REPEAT=kind)`，Task prompt 要求模型复制该日期而不是重新计算。内部标注仅存在于送给模型的临时文本，保存前会从标题、描述和 action item 中移除，不会改写或污染用户原始 transcript。

相对日期的 reference 使用 Note 的 `createdAt` 对应本地日期，而不是用户后来点击 Regenerate 的当天。这样同一条 Note 多次生成会得到稳定结果。已经保存的旧 Structured Note 不会被后台静默修改；要应用新规则，需要在 Note 的 Insights 中主动 Regenerate。

搜索侧同步引入 SQLite schema v13 索引和批量查询，避免按每条 Note 分别读取 Structured Note、Knowledge 与 conversation 的 N+1 路径。搜索仍完全在本地完成，不上传用户内容，也没有为此引入新的 embedding 模型或远程服务。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.5.0` |
| App version | `1.5.0` |
| iOS build | `6` |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.5.0.ipa` |
| IPA size | 34,283,918 bytes |
| SHA-256 | `1d9b83bee57b9141d6d94cf34e84baa2f495327a77169e6ec452b52adb2e3596` |
| Public IPA JavaScript bundle | 4,878,210 bytes |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.5.0>

公开 IPA 不包含开发者签名、provisioning profile 或 macOS 归档元数据，仅供 SideStore 使用测试者自己的 Apple Account 重新签名。本机 Personal Team 签名 `.app` 由同一源码独立构建，只用于连接真机验收，不上传 GitHub。

## 发布前验证

- 全量 Node 回归为 122 passed、0 failed；覆盖日期重写、Task 否定与恢复规则、主题与导航、弹窗背景关闭、Workspace/Note 交互、跨资源搜索、长列表边界、Calendar task dots 以及既有录音、AI、Trash 和通知逻辑。
- `npx tsc --noEmit` 通过；ESLint 为 0 error、12 个既有 React Hook dependency warning；`git diff --check` 通过。
- Expo SDK 57 的 14 个 patch 差异使用 `npx expo install --fix` 对齐；`npx expo install --check` 返回依赖已是推荐版本，`npx expo-doctor` 为 21/21。
- `npm audit --omit=dev --audit-level=high` 没有 high 或 critical，仍报告 13 个 Expo CLI、config plugin、Xcode/ngrok 工具链经 `uuid` 带入的 moderate 公告。`npm audit fix --force` 会降级或破坏当前 Expo 57 依赖，因此不用于本次发布。
- 从干净的 Expo Prebuild 和 CocoaPods 环境分别完成未签名 iPhoneOS Release、签名 iPhoneOS Release 和 iOS Simulator Release；三个 `xcodebuild` 均以退出码 0 完成。编译输出中的 warning 来自第三方 native 依赖、重复 `-lc++` 及未声明 outputs 的 build phase，没有编译错误。
- iPhone 17 Pro / iOS 26.5 模拟器安装并启动最终 `1.5.0 (6)` Release，冷启动后 Home 正常显示，深色状态栏和页面背景一致。
- Personal Team 签名包通过 `codesign --verify --deep --strict` 和项目 Release verifier；版本为 `1.5.0 (6)`、最低 iOS 16.4、`UIDeviceFamily = [1]`，entitlement 不含 `aps-environment`。连接的 iPhone 16 Pro Max 设备清单只返回一个同 Bundle ID 的 `1.5.0 (6)`，覆盖安装成功。
- 覆盖安装后的 CoreDevice 自动启动复检被 iOS 明确以 `Locked` 拒绝，因为设备在发布步骤中重新锁屏；因此本版的最终运行时证据采用同一源码的模拟器 Release 冷启动，真机证据限定为签名、版本清单和覆盖安装，不把锁屏失败描述成应用崩溃或已经完成的真机端到端测试。
- 公开 IPA 通过 `unzip -t`、独立 SHA-256 复算和 archive entry 扫描；根目录只有 `Payload/`，没有 `_CodeSignature`、`embedded.mobileprovision`、其他 `.mobileprovision` 或 `__MACOSX`。

> Evidence:
> - Source: `CHANGELOG.md`, `app.json`, `package.json`, `src/services/core-note-date-rewriter.ts`, `src/services/core-note-time.ts`, `src/services/core-note-insight-service.ts`, `src/services/home-calendar-items.ts`, `src/repositories/note-repository.ts`, `src/database/migrations/note-search-index-migration.ts`, `tests/*.test.mjs`, `scripts/verify-ios-release.mjs`, `scripts/package-ios-sidestore.mjs`
> - Method: Node/TypeScript/Lint/Expo 质量门、安全审计、确定性日期固定 reference 回归、干净 Prebuild、未签名与签名真机 Release、模拟器 Release 冷启动、IPA 解包和校验和复算、CoreDevice 安装与版本清单检查
> - Confidence: High；日期规则、构建产物、模拟器冷启动和真机覆盖安装有直接证据；最终真机自动启动受设备锁屏限制，本地小模型对任意口语 Task 的召回率也不可能由确定性日期层保证

## 已知边界与回滚

- 日期规则解决的是“已识别 Task 应落在哪一天”的确定性差异，不代表本地 LLM 可以 100% 从所有随意口语中识别出 Task。识别结果仍取决于原文是否表达了明确、可执行且未完成的承诺。
- 已保存的旧 Structured Note 不自动重算；需要用户在 Insights 中 Regenerate。Calendar 只为 pending Task 显示圆点，已完成或没有有效日期的项目不会显示。
- LLM、STT 和 TTS 模型不打入 IPA，需要在 AI 页面由用户主动下载。模型下载会联网并应保持 App 在前台；笔记、录音、Workspace、聊天和推理继续保存在设备本地。
- 本轮没有在真实 Windows + SideStore 环境重新签名安装，也没有把模拟器自动回归冒充为任意设备上的完整本地 LLM 端到端准确率测试。
- 真机运行 iOS 27.0 beta，而本机为 Xcode 26.6 / iOS 26.5 SDK。当前 CoreDevice、DDI、签名和安装链路可用，但 Apple beta 或 Xcode 更新后需要重新跑真机验收。
- 免费 Personal Team / SideStore 签名通常需要每 7 天刷新。刷新或覆盖安装前不要卸载 SpeakSpace；卸载会让 iOS 删除本地容器。

上一稳定版 `ios-v1.4.0` 及其 Release 资产继续保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.4.0>。若需要回滚程序版本，应先导出或备份重要数据，再评估使用同一 Bundle ID 覆盖安装；数据库迁移只保证向前升级，旧版不保证理解 v1.5.0 写入的新 schema 或数据。
