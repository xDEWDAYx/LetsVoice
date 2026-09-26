# SpeakSpace iOS v1.3.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.3.0` 是上一版 iPhone 稳定版，基于团队仓库 `main` 封版。当前稳定顶版见 `ios-v1.4.0`；本记录保留用于回滚审计。它不发布到 App Store；组员可在 Mac 上使用 Xcode 覆盖安装，也可在 Windows 上使用 SideStore 和自己的 Apple Account 对公开 IPA 重新签名。Android 不在本次发布验收范围内。

本版把桌面端已经稳定的内容管理和知识工作流移植到 iPhone，同时针对小屏幕、本地模型上下文和设备存储做了明确简化：搜索不依赖 Embedding，Ask AI 最多选择三篇 Note，聊天页不展示来源列表，周期 Task 只实现五种确定规则。

## 本版功能与修复

- Settings 增加统一 Trash，覆盖 Note、Workspace、Ask AI conversation 和 custom Knowledge template；普通删除可撤销、恢复或永久删除。
- Home、Workspace detail 和 Search 支持长按进入多选模式，可原子执行批量 Move、Trash、Pin All 和 Unpin All。
- Ask AI 支持同时选择 1–3 篇 Note，按 Note 均衡取证；内容超出上下文时尽量生成带边界的 best-effort answer。
- AI Management 增加自定义 Knowledge template；每次成功生成保存不可变历史快照，编辑或删除模板不会改写旧结果。
- Note 保存 transcript 后自动分类，用户仍可手动修改；分类筛选覆盖 meeting、personal、idea、learning、general 和 uncategorized。
- Search 使用标题、transcript、Structured Note 和 Knowledge result 构建本地 corpus，支持关键词与有限字符错拼，不下载或维护 Embedding 模型。
- Task 支持置顶，以及 daily、weekdays、weekly、biweekly 和 monthly 五种滚动周期；完成当前 occurrence 后只生成下一个有效 occurrence。
- 数据库升级到 schema v10，为 Trash、分类、Knowledge 历史和周期 Task 增加字段、表和索引。
- Expo SDK 57 相关包对齐到官方推荐 patch，重新执行 Prebuild、Pods 同步和 Release 构建。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.3.0` |
| App version | `1.3.0` |
| iOS build | `4` |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.3.0.ipa` |
| IPA size | 33,867,585 bytes |
| SHA-256 | `7088d98be6f2cffe8328b01b7dc1d2e2ca6be0541a9bdd0784ba18a8f464e3f5` |
| Offline JavaScript bundle | 4,588,301 bytes |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.3.0>

## 验证范围

- 自动测试覆盖四类 Trash、恢复刷新、批量事务、自动分类、模糊搜索、Knowledge 历史、三 Note Ask AI 和周期 Task；最终结果为 71 passed、0 failed。
- TypeScript 通过，Expo Doctor 为 21/21，Expo 依赖检查无待更新项，Lint 为 0 error、16 warnings，Git diff 检查通过。
- 从干净 Expo Prebuild 和 123 个 CocoaPods 依赖构建中性 iPhoneOS Release；Xcode 的 139-target dependency graph 最终 `BUILD SUCCEEDED`。
- Release verifier 确认最低 iOS 16.4、`UIDeviceFamily = [1]`、arm64、离线 JavaScript bundle、无后台模式、无 Bonjour 声明，并保留一条 Expo ATS local-network 审计提示。
- IPA 通过 ZIP 完整性和独立 SHA-256 复算；归档中没有 `_CodeSignature`、`embedded.mobileprovision`、其他 provisioning profile 或 `__MACOSX` 元数据，包内版本为 `1.3.0 (4)`。
- 同一源码的 Personal Team 签名 Release 通过自动 verifier 和 `codesign --verify --deep --strict`，随后通过 Xcode 工具链覆盖安装到 iPhone 16 Pro Max；设备应用清单确认版本为 `1.3.0 (4)`，应用可脱离 Metro 启动。
- 功能封版前，同一业务源码在 iPhone 16 Pro Max 上执行一条完整 Release XCUITest，真实操作 Search、批量选择、三 Note Ask AI、Settings Trash、自定义模板、分类筛选、周期 Task 与 Knowledge 历史；140.056 秒内 1/1 通过。
- `1.3.0 (4)` 覆盖安装并启动后再次复制 SQLite，确认 schema v10、`PRAGMA integrity_check = ok`、`PRAGMA foreign_key_check` 无记录；最终保留 4 Notes、2 Workspaces、1 个三 Note conversation、1 个 template、1 个 Knowledge result 和 3 Tasks，Trash 与临时 pin 均为 0。

> Evidence:
> - Source: `tests/ios-parity-features.test.mjs`, `tests/ask-ai-reliability.test.mjs`, `scripts/verify-ios-release.mjs`, `scripts/package-ios-sidestore.mjs`, `docs/ios-port-development-YQ.md`
> - Method: Node 自动测试、Expo 依赖检查、干净 Prebuild、未签名 Release 验证、IPA archive/校验和检查、Xcode 真机 UI 流程、签名 Release 覆盖安装和测试后 SQLite 检查
> - Confidence: High；Windows + SideStore 的真实安装和七天 Refresh 仍需组员在外部设备完成

## 安装限制

- LLM、STT 和 TTS 模型不打入 IPA，首次使用时由用户在 AI 页面主动下载。
- SideStore 免费 Personal Team 签名通常需要每 7 天刷新；刷新前不要卸载 SpeakSpace。
- Search 是确定性关键词和有限错拼匹配，不等同于桌面 Embedding 的语义召回。
- Ask AI 最多选择三篇 Note；本地模型回答和模板草稿质量受设备模型能力限制。
- `npm audit --omit=dev --audit-level=high` 没有 high/critical 项，但 Expo CLI、config plugin 和 ngrok 的传递依赖仍报告 12 个 moderate；强制修复会把 `expo-splash-screen` 降到与 Expo SDK 57 不兼容的 55.x，因此本版不执行 `npm audit fix --force`。

## 回滚

上一稳定版保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.2.0>。不要为了回滚直接卸载当前 SpeakSpace；卸载会删除 iPhone 应用容器中的笔记、录音、Workspace、聊天和模型。需要回退时先备份本地数据，再评估使用同一 Bundle ID 覆盖安装。
