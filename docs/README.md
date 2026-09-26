# SpeakSpace Local 文档索引

项目总览：[English](../README.md) · [简体中文](../README.zh-CN.md)

根目录只保留项目级入口；设计决策、测试证据和历史过程统一放在这里。

## 当前工程文档

| 文档 | 用途 |
| --- | --- |
| [项目结构](./project-structure.md) | 目录职责、进程边界、路径别名和代码放置规则 |
| [移动端整合](./mobile-integration.md) | 双应用目录、移动端开发命令、独立检查与导入来源 |
| [测试与评测总览](./testing/README.md) | 所有基准、评测与报告的入口 |
| [测试集总览](./testing/datasets/README.md) | 每份测试集是什么、多少条、开发集/保留集怎么拆 |
| [跨机器基准](./testing/multi-machine-benchmark-guide.md) | 在新机器上一键跑硬件基准 |
| [TTS 平台构建与手工验收](./testing/manual-acceptance.md) | 跨平台构建边界与安装包验收步骤 |

## 历史与追踪

- [`changelog/`](./changelog/) 保存逐次开发日志。
- 当前架构和开发规则以根目录 [`README.md`](../README.md) 与
  [`AGENTS.md`](../AGENTS.md) 为准。

## 文件归类规则

- 产品介绍、快速开始和总体架构写入根 `README.md`。
- 可复现的测试报告和验收步骤放入 `testing/`。
- 每次开发过程记录放入 `changelog/`，不要在根目录新增临时日志。
- 已失效但仍有历史价值的过程记录放入 `changelog/`；无引用、无证据价值的草稿直接删除。
- 图片只有在当前文档实际引用时才进入仓库，并与使用它的文档放在同一主题目录。
