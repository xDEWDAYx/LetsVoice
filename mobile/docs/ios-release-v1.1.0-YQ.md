# SpeakSpace iOS v1.1.0 稳定版发布记录（YQ）

## 发布定位

`ios-v1.1.0` 是历史 iPhone 稳定版，基于已合入团队仓库 `main` 的主题、Task 和本地 TTS 功能封版。当前稳定顶版见 `ios-v1.4.0`；本记录保留用于回滚审计。它不发布到 App Store；团队成员使用 SideStore 和自己的 Apple Account 对 IPA 重新签名。

## 本版功能

- Settings 支持 Light、Dark 和跟随系统主题，选择结果可持久化。
- Home 展示完整待办列表，可完成、展开已完成分组并恢复为待办。
- AI 回复与 Knowledge/Structured Note 内容支持本地 TTS 朗读。
- TTS 支持暂停、保持当前位置和续播；本地推理任务按顺序协调。
- 保留 v1.0.0 的 iPhone-only、本地录音转写、音频导入、Workspace、模型管理和 Ask AI 能力。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.1.0` |
| App version | `1.1.0` |
| iOS build | `2` |
| Minimum iOS | `16.4` |
| Target | iPhone arm64 only |
| IPA | `SpeakSpace-iOS-v1.1.0.ipa` |
| IPA size | 33,759,216 bytes |
| SHA-256 | `565b3893b0681fe80c54e2fc9e877424c99c93591c3890f82ad21cf7dc060df8` |

安装入口：<https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.1.0>

## 验证范围

- 自动测试、TypeScript、Lint 和 Expo Doctor。
- 中性 iPhoneOS Release 全量编译及包内版本、架构、最低系统、离线 JS bundle 检查。
- IPA ZIP 完整性、SHA-256 和签名材料移除检查。
- iPhone 16 Pro Max（iOS 27.0）上覆盖安装个人签名的同源码 Release；设备清单确认 `1.1.0 (2)`，冷启动后进程存活，验证最终包可脱离 Metro 运行。
- 版本封板前的同一功能源码已通过真机 XCUITest，覆盖主题切换、Task 完成/恢复、TTS 合成、播放、暂停和续播。
- `npm audit --omit=dev --audit-level=high`，不允许 critical/high 漏洞进入发布门。

Windows + SideStore 的安装与七天刷新仍需要每位测试者使用自己的 Apple Account 完成。模型不打入 IPA，首次运行后由用户在 AI 页面主动下载。

## 回滚

旧版保留在 <https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.0.0>。不要为了回滚直接卸载已有 SpeakSpace；卸载会删除当前 iPhone 应用容器中的笔记、录音、Workspace、聊天和模型。需要回退时先备份本地数据，并使用相同 SideStore 安装记录评估覆盖安装。
