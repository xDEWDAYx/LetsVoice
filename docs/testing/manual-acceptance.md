# TTS 平台构建与手工验收

这份文档合并了原先的「平台构建说明」与「Windows 手工验收」两份 —— 它们本来就是同一件事的两半：
先在对的机器上构建，再在对的机器上验收。

自动化基准覆盖不到的部分只有这一块：**装完的安装包在真实系统上能不能用**。
速度、内存、可懂度这些见 [tts-model-benchmark-windows.md](./tts-model-benchmark-windows.md)。

## 一、平台构建

TTS 的原生依赖在 `npm install` 时按当前操作系统和 CPU 架构安装。**因此发布包必须在对应的构建机上生成**，
不能在 arm64 Mac 上交叉生成 x64 包，反之亦然。

| 目标 | 构建机 | 命令 |
| --- | --- | --- |
| macOS arm64 | Apple Silicon Mac | `npm install && npm run package` |
| macOS x64 | Intel Mac 或 x64 macOS runner | `npm install && npm run package` |
| Windows 10/11 x64 | Windows x64 | `npm install && npm run package` |

每个平台都要从干净的依赖目录开始构建，才能保证 `sherpa-onnx-node`、`onnxruntime-node`
和 `better-sqlite3` 都带上目标架构的原生文件。

Windows ARM64 不在当前承诺范围内。

## 二、手工验收（Windows 10/11 x64）

### 前置条件

- 在 Windows x64 机器上执行 `npm install`，确保原生依赖由该平台安装
- 用 `npm run package -- --win --x64` 生成安装包，并**安装该安装包**（不是跑开发模式）
- 系统里**不要**额外安装 Python、sherpa-onnx 或 ONNX Runtime —— 验收的正是「用户不需要装这些」

### 验收步骤

1. 打开「模型管理」，确认 TTS 下列出 Kokoro、MeloTTS、MOSS-TTS-Nano 三项
2. 分别下载三个模型，确认进度可见，下载完成后**不会自动切换**
3. 依次选择每个模型，用中文、英文、中英混合句各试听一次；音频应在**全部生成后**开始播放
4. 切换音色、切换到其他模型再切回，确认每个模型的音色选择**独立保存**
5. 重启应用，确认激活模型和该模型音色保持不变
6. 尝试删除当前激活的模型 —— 删除按钮应**禁用**；切换后删除旧模型应成功
7. **断网**后再次合成已下载的模型，确认不依赖网络
8. 记录三个模型的加载时间、合成时间、最高内存、音频是否正常，以及任何异常信息

### 通过条件

- 三个模型都无需用户安装 Python 或其他运行时
- Kokoro / MeloTTS 返回单声道，MOSS 返回 48 kHz 双声道，均可完整播放
- 任一模型加载或合成失败时**显示错误**，不会静默改用其他模型
- 应用重启、模型切换、删除保护、断网四个场景均符合上述行为

### 一个需要特别留意的点

自动化基准测出 MOSS-TTS-Nano 合成 1196 字的长文本需要约 **10 GiB** 内存
（详见 [TTS 基准](./tts-model-benchmark-windows.md) 的「峰值内存 vs 文本长度」一节）。
在 16 GiB 机器上验收时，第 3 步请**额外用一段 1000 字以上的长文本试一次**，确认不会 OOM。
短句试听是测不出这个问题的 —— macOS 那一轮就是因为只用了 3 条 40 字以内的短句而完全没发现。
