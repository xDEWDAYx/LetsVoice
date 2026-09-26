# LetsVoice iOS v1.6.2 稳定版记录

## 发布定位

`1.6.2` 是首页品牌文字的精确修正版：只把 `LETSVOICE-LOCAL` 调整为 `LetsVoice`。其余界面、样式、功能行为和兼容标识保持不变。发布渠道仍为团队 GitHub Release 与 SideStore，不是 App Store 或 EAS 发布。

## 版本与兼容性

- App version：`1.6.2`
- iOS build number：`9`
- 最低系统：iOS 16.4
- 设备范围：iPhone only
- Bundle ID：`com.dhebhxh.speakspacelocalmobile`
- URL scheme、数据库名、通知 ID、仓库名和 package 名等既有小写技术标识保持不变

## 发布资产

| 项目 | 值 |
| --- | --- |
| Git tag | `ios-v1.6.2` |
| IPA | `LetsVoice-iOS-v1.6.2.ipa` |
| IPA 大小 | `33,081,366 bytes` |
| IPA SHA-256 | `d5568e676cf9efaa2f4f38fbff88c2e3ebfd13fdfd6bd2787a9067811481eaeb` |
| checksum 文件 SHA-256 | `4e92b334329b180129c52a7154febfbd267afee711f9559c47589025fb31f712` |
| 内嵌 JS bundle | `5,136,047 bytes` |
| 设备二进制 | Mach-O arm64 |

## 验证记录

- `TZ=Europe/London npm test`：142 passed，0 failed。
- `npx tsc --noEmit`：通过。
- `npm run lint`：0 error；保留 12 个既有 React Hook dependency warning。
- 品牌专项回归确认首页只显示精确大小写 `LetsVoice`，源码与发布 bundle 均不含 `LETSVOICE-LOCAL`。
- Expo public config：`LetsVoice`、`1.6.2 (9)`、SDK 57、既有 Bundle ID 与 scheme 均符合预期。
- 干净 Expo Prebuild 与 CocoaPods：生成 `LetsVoice.xcworkspace`、`LetsVoice` scheme，共安装 127 个 Pod dependencies。
- 签名 iPhoneOS Release：arm64 构建通过；release verifier 与 `codesign --verify --deep --strict` 通过。
- iPhone 17 Pro / iOS 26.5 Simulator Release：构建、安装与直接启动通过，启动返回 PID 61686；截图确认 Home 只显示 `LetsVoice`，布局与其他内容保持不变。
- iPhone 16 Pro Max / iOS 27.0 Beta：通过 USB 安装 `1.6.2 (9)` 并直接启动成功，CoreDevice 确认进程正在运行；没有卸载或清理设备数据。
- SideStore IPA：ZIP 完整性、archive root、签名与 provisioning 清理、Info.plist、arm64 架构、文件大小和 SHA-256 独立复核通过。

实体机使用 Xcode 26.6 与 iOS 26.5 SDK 构建，而手机运行 iOS 27.0 Beta；本轮 CoreDevice 构建、安装和启动均成功，但该工具链版本差异仍应在后续系统更新后复查。首次启动曾被 iOS 的开发者信任门阻止，用户在系统设置中明确信任现有 Personal Team 后启动成功。

## 回滚

上一稳定版本保留在 [`ios-v1.6.1`](https://github.com/dhebhxh/speakspace-local-mobile/releases/tag/ios-v1.6.1)。如需回滚，应先导出或备份重要本地内容；不要把卸载重装当作无损回滚。
