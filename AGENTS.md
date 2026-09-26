# SpeakSpace Local 工程约定

本文件适用于人工开发和自动化编码代理。目标是让改动保持小、可解释、可验证。

本仓库包含两个独立应用：根目录为 Electron 桌面端，`mobile/` 为 Expo / React Native 移动端。下文的进程、品牌、`userData` 和构建约定描述桌面端；移动端遵循 `mobile/AGENTS.md` 与其自身配置。两端保留独立的依赖和锁文件，不直接互相导入源码。根目录的 `npm test`、类型检查和 Lint 只检查桌面端；移动端使用 `npm run mobile:test`、`npm run mobile:typecheck` 和 `npm run mobile:lint`。修改整合入口时另运行 `npm run check:apps`。

## 1. 先定义范围

- 开始修改前写清可观察的完成条件；不把相邻重构混入当前任务。
- 优先修改现有模块。只有出现新的稳定职责边界时才新增目录或抽象。
- 不因“看起来没用”删除文件；先检查 Git 状态、全仓引用、运行入口和测试。
- 工作区可能存在未提交改动。未确认来源前，一律视为用户工作并保留。

## 2. 进程与依赖边界

- `src/main/` 负责 Electron、Node.js、数据库、文件系统、模型运行时和 IPC。
- `src/renderer/` 只负责界面与交互，通过 preload 暴露的类型化 API 访问系统能力。
- `src/shared/` 只放跨进程共享的纯类型和纯数据，不依赖 Node.js、Electron 或 DOM。
- Renderer 不得直接导入 `src/main/` 实现。新增能力应按“Service/Repository → IPC → preload → Renderer”接入。
- 页面专用组件放在对应 `pages/<Page>/components/`；只有被多个页面复用时才提升到公共目录。

## 3. 数据与删除

- 数据库变化必须兼容已有用户数据，并通过启动迁移完成；不得要求用户手工清库。
- Repository 负责持久化，UI 和 IPC 不直接拼写 SQL。
- 普通删除必须先进入回收站。只有回收站中的“永久删除”可以物理移除数据及其关联文件。
- 笔记能力变化要同时考虑转写、结构化笔记、场景知识、AI 会话、语义索引和导出内容。

## 4. 模型与本地数据

- STT、LLM、TTS 和 Embedding 模型按需下载到 Electron `userData`，不得提交到 Git 或塞入安装包。
- 模型下载、激活和运行状态由主进程统一管理；Renderer 不自行推断文件是否存在。
- 失败信息要包含可执行的恢复路径，并支持取消或重试长时间任务。

## 5. UI 与文本

- 品牌名固定为 `SpeakSpace Local`；其他用户可见文本必须走 i18n。
- 窄屏和竖屏布局不得依赖面板重叠。新增固定宽度时同步检查最小宽度、换行和滚动归属。
- 弹窗挂载到页面级遮罩层，打开时锁定背景滚动，并确保键盘焦点和关闭入口可用。
- 保持现有设计令牌、字号和间距体系，不在单个组件中另起一套视觉规则。

## 6. 验收顺序

1. 清理过生成物或 `release/app/dist/main/` 不存在时，先运行 `npm run build:main`；Jest 的前置检查依赖该产物。
2. 运行与改动最接近的测试。
3. 运行 `npm exec tsc -- --noEmit`。
4. 运行 `npm run lint`；若存在历史问题，至少保证本次修改没有新增错误。
5. 涉及主进程、preload、路由或打包配置时运行 `npm run build`。
6. 提交前运行 `git diff --check`，并确认安装包、模型、数据库和缓存未进入 Git。

## 7. 生成物

- `.erb/dll/`、`release/app/dist/` 和 `release/build/` 都可重新生成。
- `release/installers/` 只保存本地交付物，不进入版本控制。
- `.claude/`、`.impeccable/` 等工具状态不属于项目源码。
- 清理命令不得删除 `release/installers/`、用户数据库、录音或模型目录。
