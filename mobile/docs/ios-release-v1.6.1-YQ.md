# LetsVoice iOS v1.6.1 稳定版记录

## 发布定位

`1.6.1` 是 LetsVoice 的产品名称更新版，只调整当前产品名称、界面文字、权限说明、文档与发布资产名称，不改变功能行为。发布渠道仍是团队 GitHub Release 与 SideStore，不是 App Store 或 EAS 发布。

## 兼容性边界

- App version：`1.6.1`
- iOS build number：`8`
- 最低系统：iOS 16.4
- 设备范围：iPhone only
- Bundle ID：`com.dhebhxh.speakspacelocalmobile`
- URL scheme、数据库名、通知 ID、仓库名和 package 名等既有小写技术标识保持不变

保留技术标识可让本版覆盖安装在既有 App 之上，并继续访问原有本地容器与深链。升级前仍建议备份重要内容；不要通过卸载旧版再安装的方式升级，因为 iOS 会删除应用本地数据。

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.6.1` |
| IPA | `LetsVoice-iOS-v1.6.1.ipa` |
| IPA 大小 | `34,368,738 bytes` |
| IPA SHA-256 | `37657ab606c42a5136d117029976dc3f08665b6990380dba013d815942da4ef5` |
| checksum 文件 SHA-256 | `845fdd2fc1f13b43286d237347e1046aef89d44856620bbcf08f6e20df7c67d5` |
| 内嵌 JS bundle | `5,136,091 bytes` |
| 设备二进制 | Mach-O arm64 |

## 验证记录

- `TZ=Europe/London npm test`：141 passed，0 failed。
- `npx tsc --noEmit`：通过。
- `npm run lint`：0 error；保留 12 个既有 React Hook dependency warning。
- Expo public config：`LetsVoice`、`1.6.1 (8)`、SDK 57、既有 Bundle ID 与 scheme 均符合预期。
- 干净 Expo Prebuild 与 CocoaPods：生成 `LetsVoice.xcworkspace`、`LetsVoice` scheme，共安装 127 个 Pod dependencies。
- iPhoneOS Release：unsigned arm64 构建通过；release verifier 通过，并确认安装包内显示名、版本、build number、最低 iOS 和 device family。
- iPhone 17 Pro / iOS 26.5 Simulator Release：构建、安装与直接启动通过，启动返回 PID 7215；Home 显示 `LETSVOICE-LOCAL`，不依赖 Metro。
- SideStore IPA：ZIP 完整性、archive root、签名与 provisioning 清理、Info.plist、arm64 架构、文件大小和 SHA-256 独立复核通过。
- Production audit：没有 high 或 critical，仍有 17 个 moderate 工具链依赖公告；未使用会改变 Expo 主版本的强制修复。

本机默认 Asia/Shanghai 时区运行测试时，有 5 个既有日期断言因测试基线采用欧洲时区而失败；在测试基线时区 Europe/London 下全量 141/141 通过。本次没有修改日期逻辑。

`expo install --check` 报告 11 个 Expo SDK 57 patch dependency 可更新，`expo-doctor` 因这些 patch 差异与两项远端元数据查询未达到全通过。为遵守“只改名称”的发布范围，本版没有顺带升级依赖。

本版没有卸载、覆盖或清理任何实体 iPhone 上的 App 与数据，也没有使用 iPhone Mirroring。实体设备签名安装没有在本轮重跑；SideStore 会由每位测试者自己的 Apple Account 重新签名。

## 回滚

上一稳定版本保留在 [`ios-v1.6.0`](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.0)。如需回滚，应先导出或备份重要本地内容；不要把卸载重装当作无损回滚。
