# 项目结构

## 顶层

```
assets/            应用图标、entitlements
config/            模型目录（llm-catalog.json / stt-catalog.json）
mobile/            独立 Expo / React Native 应用（依赖、原生模块、测试、资源与文档）
docs/              文档
  README.md         文档索引与归类规则
  archive/         已完成阶段的历史方案与迁移记录
  changelog/       历次改动记录（原 log/）
  testing/         测试说明
scripts/           开发/验证脚本，不参与打包
  benchmark/       TTS 基准测试脚本
  smoke/           冒烟脚本（npm run smoke:tts）
  dev/             本地数据库种子脚本
src/               应用源码
.erb/              Electron/Webpack 构建配置与脚本（沿用 ERB 目录名）
release/app/       打包侧 package.json、原生依赖和生成后的应用代码
release/build/     electron-builder 临时产物，可重新生成且不提交
release/installers/ 本地验收后的安装包，不提交
```

## src/ 的三段划分

下文的 `src/`、路径别名和进程边界均指根目录的桌面端。`mobile/src/` 使用自己的 Expo 配置、依赖及别名，不直接引用桌面端源码。移动端开发与检查入口见[移动端整合指南](./mobile-integration.md)。

```
src/main/          主进程：Node/Electron 侧，可以用 fs、child_process、electron
src/renderer/      渲染进程：浏览器侧，只能通过 preload 暴露的 IPC 访问系统能力
src/shared/        两边都能引用的东西，不得依赖任何 Node 或 DOM API
```

### src/shared

```
entities/          领域对象（Note、Workspace、Subnote…），纯数据类
models/            Model 基类
types/             跨进程契约类型
```

**规则：渲染进程不得 import `src/main` 下的任何文件。** 唯一例外是
`src/renderer/preload.d.ts` 取 `ElectronHandler` —— 那是 IPC 桥本身的类型。

这条规则由 ESLint 的 `no-restricted-imports` 强制（见 `.eslintrc.js` 的
overrides）。之前渲染层有 32 处直接 import 主进程实现文件，其中
`RuntimeStatusService` 顶层就 `import fs from 'fs'`，只是靠 TypeScript 的
类型擦除才没在打包时炸掉。

需要在两侧共用一个类型时：把它放进 `src/shared/types/`，主进程侧文件
按需 re-export，这样主进程原有的 import 路径不用动。

完整的修改、删除、国际化和验收约定见根目录 `AGENTS.md`。

## 路径别名

`tsconfig.json` 的 `paths` 定义，webpack 经 `tsconfig-paths-webpack-plugin`
自动镜像，jest 经 `package.json` 的 `moduleNameMapper` 对齐：

```
@shared/*     src/shared/*
```

跨进程共享代码用 `@shared/*`；main 和 renderer 各自内部仍用相对路径。

## src/main 的分组

按能力域平铺，每个目录一个职责：

```
ipc/               各功能的 IPC 注册入口
database/          DatabaseManager、BlobStorage 与 repositories/
AI-module/         模型管理（LLM / STT / TTS 的 Model 与 Manager）
llm/               Ollama 运行时与本地对话
transcription/     Whisper / Parakeet 转写
tts/               语音合成运行时与引擎
semantic/          嵌入与语义检索
recommendation/    硬件探测与模型推荐
runtime/           下载、解压、进程调用等运行时基础设施
agent/ ask-ai/     Agent 与问答
workflow/ workspace/ dashboard/ export/ audio/ settings/ startup/
```

## src/renderer 的分组

```
pages/<Page>/      页面：Page.tsx + Page.css + 本页 hooks/controller + components/
layout/            应用外壳（MainLayout、Sidebar）
components/        跨页面复用的小部件
styles/            tokens / effects / motion / components 四层，由 App.css 汇总
router/            路由表
settings/ onboarding/ tts/   跨页面的功能模块
```
