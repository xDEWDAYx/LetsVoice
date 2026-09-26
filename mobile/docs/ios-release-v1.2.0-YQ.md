# SpeakSpace iOS v1.2.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.2.0` 是历史 iPhone 稳定版，基于团队仓库 `main` 封版。当前稳定顶版见 `ios-v1.4.0`；本记录保留用于回滚审计。它不发布到 App Store；组员可在 Mac 上使用 Xcode 覆盖安装，也可在 Windows 上使用 SideStore 和自己的 Apple Account 对公开 IPA 重新签名。

本版重点修复 Ask AI 根据当前笔记回答、会话持久化、Structured Note 可读结果，以及编辑弹窗与 iPhone 状态栏冲突。Android 不在本次验收范围内。

## 本版功能与修复

- Ask AI 把当前锁定笔记的完整 transcript 作为事实边界，改善中英文短问题、日期、人物与行动项的匹配。
- 等待本地模型时显示 spinner 和处理中状态，避免用户无反馈地等待。
- Ask AI 会话、用户问题和助手回复持久化到本地 SQLite；重新进入页面后可以继续历史对话，也可以主动创建新会话。
- Structured Note 按文本密度分段生成，检查模型停止原因与 JSON 完整性；截断或局部失败时会缩小批次重试并使用确定性降级结果。
- 统一使用安全区域感知的居中编辑弹窗，覆盖新建、重命名、编辑和 Move note 等流程；键盘出现时内容仍可滚动和关闭。
- 保留 v1.1.0 的主题、Home Task、TTS 朗读、暂停/续播和本地优先能力。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.2.0` |
| App version | `1.2.0` |
| iOS build | `3` |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.2.0.ipa` |
| IPA size | 33,781,462 bytes |
| SHA-256 | `e56c2ed5b4cf643cb515eb4d1cf1b51ee44a82eb068a8b1bae6bd083588e6061` |
| Offline JavaScript bundle | 4,390,559 bytes |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.2.0>

## 验证范围

- 自动测试覆盖 Ask AI 中英文 grounding、会话持久化、超时/停止原因处理、Structured Note 分批生成与安全弹窗布局。
- TypeScript、Lint、Expo Doctor、依赖安全审计和 Git diff 检查进入发布门。
- 中性 iPhoneOS Release 完整编译；验证最低系统、iPhone-only、arm64、离线 JavaScript bundle 和无签名公开分发包。
- IPA 通过 ZIP 完整性和 SHA-256 检查，且不包含 `_CodeSignature`、`embedded.mobileprovision`、其他 provisioning profile 或 `__MACOSX` 元数据。
- iPhone 16 Pro Max（iOS 27.0）使用同一源码的个人签名 Release 覆盖安装；设备清单确认 `1.2.0 (3)`，应用脱离 Metro 启动且进程存活。
- 覆盖安装后本地 Qwen 模型和 3 篇验收笔记仍在，复制出的 SQLite 数据库 `PRAGMA integrity_check` 返回 `ok`。
- 本轮针对 Ask AI、Structured Note 和编辑弹窗执行了真机定向回归；结果不替代 `ios-device-acceptance.md` 中尚未逐项填写的完整录音、导入与 SideStore 外部设备矩阵。
- 最终自动门结果为 60 passed、0 failed，TypeScript 和 quiet Lint 通过，Expo Doctor 21/21；生产依赖审计没有 high 或 critical 漏洞。

## 安装限制

- LLM、STT 和 TTS 模型不打入 IPA，首次使用时由用户在 AI 页面主动下载。
- SideStore 免费 Personal Team 签名通常需要每 7 天刷新；刷新前不要卸载 SpeakSpace。
- Release 验证器保留一条 Expo 生成的 ATS local-network 审计提示。当前应用不提供 Bonjour 或局域网发现，应用自有联网范围仍限于用户主动发起的模型目录和模型下载。
- `npm audit` 仍列出 12 个 Expo CLI/Xcode 工具链间接依赖 `uuid` 的 moderate 公告；建议的强制修复会降级到 Expo 46，因此本版没有执行破坏性的 `npm audit fix --force`。

## 回滚

上一稳定版保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.1.0>。不要为了回滚直接卸载当前 SpeakSpace；卸载会删除 iPhone 应用容器中的笔记、录音、Workspace、聊天和模型。需要回退时先备份本地数据，再评估使用同一 Bundle ID 覆盖安装。
