# SpeakSpace iOS v1.4.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.4.0` 是当前 iPhone 稳定顶版，基于团队仓库 `main` 封版。它不发布到 App Store；组员可在 Mac 上使用 Xcode 覆盖安装，也可在 Windows 上使用 SideStore 和自己的 Apple Account 对公开 IPA 重新签名。Android 不在本次发布验收范围内。

本版把 Home 日期、通知、PDF 分享、首次引导、字号、关联 Ask AI、生成进度、安全 Markdown、自动朗读和 Workspace 建议补到 iPhone，并为三类本地 AI 生成建立从排队开始计算的 deadline 与可取消 FIFO。iOS 用户界面只保留英语；多语言转录、STT、TTS 和内容处理能力继续保留。

## 本版功能与修复

- Home 日历聚合 Structured Note 中的 event、pending task 和 reminder；结构化时间为空时，会从 transcript 中提取有明确依据的日期，并与结构化结果按来源、日期和标题去重。
- 用户可在 Settings 主动开启 iOS 本地通知。系统只为未来的 current pending task 和明确 reminder 调度通知；修改、完成、删除或重新生成后会同步更新，点击通知回到来源 Note。
- Note detail 可把标题、transcript、Structured Note、Knowledge 和允许范围内的 Ask AI 内容导出 PDF，再打开 iOS share sheet；临时 PDF 在分享结束或失败后删除。
- 新增英语首次使用引导、可重新打开的操作指南，以及 Small、Default、Large 三档字体偏好；设置保存及其他等待点显示 spinner。
- Note detail 显示所有直接关联当前 Note 的 Ask AI conversation，可继续最近一条或创建新会话。
- Ask AI 显示准备上下文、排队、加载模型、生成、保存和停止阶段；模型回复以安全原生组件渲染有限 Markdown，用户看到的是排版后的正常文本。
- Settings 可选择是否自动朗读新保存的 Ask AI 回复，默认关闭；朗读文本会先移除 Markdown 排版字符。
- Workspace 在没有 Workspace 或仅有默认 `My Workspace` 时给出确定性名称建议，必须经用户确认才写入，不自动搬移 Note。
- Ask AI、Knowledge 和 Structured Note 的 deadline 分别为 90、120 和 180 秒，并覆盖排队、加载、推理和保存；排队中和运行中的请求都可取消，native work 退出前仍保持串行。
- 录音和音频导入先安全保存原始 Note，再进入 Structured Note 自动生成与审核；生成失败或取消不会丢失 transcript、录音路径或旧结果。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.4.0` |
| App version | `1.4.0` |
| iOS build | `5` |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.4.0.ipa` |
| IPA size | 34,231,895 bytes |
| SHA-256 | `67e57fd017faf9d43141f9fcb0cb9460c7d7e7b17dd588090a0626f27470bb0a` |
| Public IPA JavaScript bundle | 4,785,256 bytes |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.4.0>

公开 IPA 不包含开发者签名或 provisioning profile，供 SideStore 使用测试者自己的 Apple Account 重新签名。用于本机真机验收的 Personal Team 签名 `.app` 是同一源码的独立构建，不上传 GitHub。

## 验证范围

- 在版本与 build number 更新后复跑全部 Node 回归：88 passed、0 failed。覆盖 Home 日期合并和 transcript fallback、本地通知 planner、安全 Markdown、Workspace 建议、AI deadline/FIFO 取消、PDF 隐私和临时文件清理、spinner、英语界面以及既有录音、Ask AI、Structured Note、Knowledge、Trash、搜索和周期 Task 规则。
- TypeScript 通过；Lint 为 0 error、12 warnings；Expo dependency check 无待更新项；Expo Doctor 为 21/21。
- `npm audit --omit=dev --audit-level=high` 没有 high 或 critical，保留 13 个来自 Expo CLI、config plugin、Xcode/ngrok 工具链传递依赖 `uuid` 的 moderate 公告。强制修复会把 Expo 降到不兼容的旧版，因此本次不执行 `npm audit fix --force`。
- 从干净 Expo Prebuild 和 CocoaPods 安装分别构建未签名与 Personal Team 签名的 iPhoneOS Release，两个 `xcodebuild` 均以退出码 0 完成。
- 自动 Release verifier 确认包内版本 `1.4.0 (5)`、最低 iOS 16.4、`UIDeviceFamily = [1]`、arm64、离线 JavaScript bundle 和预期签名状态；签名包另外通过 `codesign --verify --deep --strict`，entitlement 不含 `aps-environment`。
- 公开 IPA 通过 ZIP 完整性、归档结构、独立 SHA-256 和签名材料扫描；其中没有 `_CodeSignature`、`embedded.mobileprovision`、其他 provisioning profile 或 `__MACOSX` 元数据。
- 同一业务源码在版本元数据更新前已于 iPhone 16 Pro Max 执行本轮 Release XCUITest：Structured Note spinner、Calendar Intents、transcript 日期 fallback、Home 去重 agenda 和回到来源 Note 的完整流程为 1/1 通过，用时 62.337 秒；独立干净启动用例也为 1/1 通过，确认首屏及操作为英语。
- 最终 `1.4.0 (5)` Personal Team 签名包覆盖安装到同一台 iPhone 16 Pro Max（iOS 27.0 beta），设备应用清单只检测到一个正式 SpeakSpace，应用脱离 Metro 启动成功且进程存活。
- 覆盖安装后复制设备 SQLite 复检：schema v12，`PRAGMA integrity_check = ok`，`PRAGMA foreign_key_check` 无记录；所有 Note、Workspace、conversation、Structured Note、Knowledge、Task 和偏好测试数据均为 0，STT、LLM、TTS 模型配置各保留 1 条 active 记录。

> Evidence:
> - Source: `tests/selected-ios-features.test.mjs`, `tests/ios-parity-features.test.mjs`, `tests/ask-ai-reliability.test.mjs`, `scripts/verify-ios-release.mjs`, `scripts/package-ios-sidestore.mjs`, `docs/ios-port-development-YQ.md`
> - Method: Node 全量回归、TypeScript、Lint、Expo dependency/doctor、安全审计、干净 Prebuild、未签名和签名 Release 构建、IPA 解包与校验和复算、XCUITest 真机触控、最终版本覆盖安装、进程和 SQLite 检查
> - Confidence: High；本轮主链和最终安装包已在真机验证，但外部 Windows SideStore 环境、通知在所有 Focus/静音组合下的到点展示，以及每一种 share-sheet 目标仍需对应环境实测

## 安装与已知边界

- LLM、STT 和 TTS 模型不打入 IPA，首次使用时由用户在 AI 页面主动下载；模型下载需要网络并应保持 App 在前台。
- SideStore 免费 Personal Team 签名通常需要每 7 天刷新。刷新前不要卸载 SpeakSpace；卸载会让 iOS 删除本地容器。
- 本地通知需要用户授权；iOS Focus、静音和通知设置仍决定实际展示与声音。Calendar event 不会默认创建通知。
- Transcript 日期 fallback 只用于 Home 展示，不把推断时间写回 Structured Note，也不据此自动创建通知。
- Markdown 只实现安全有限子集；HTML、远程图片和非 HTTPS 链接不作为可执行或可点击内容。
- PDF 是单 Note 快照，不嵌入录音；多 Note Ask AI conversation 只列元数据，不导出其他 Note 的消息正文。
- Workspace 建议使用确定性规则，不等同于桌面端更深的 LLM 语义归类。
- 测试手机为 iOS 27.0 beta，而构建机为 Xcode 26.6 / iPhoneOS SDK 26.5。设备工具偶尔打印与真实锁定状态不一致的 passcode 日志；最终构建、安装、启动和设备状态检查均成功。

## 回滚

上一稳定版 `ios-v1.3.0` 及其资产继续保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.3.0>。不要为了回滚直接卸载当前 SpeakSpace；先导出或备份重要本地数据，再评估使用同一 Bundle ID 覆盖安装。schema 迁移只保证向前升级，旧版不保证理解 v1.4.0 之后写入的新数据。
