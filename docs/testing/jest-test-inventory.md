# Jest 自动化测试清单

生成时间：2026-09-01 17:21:26 · 生成方式：`npm run test:inventory`

这份清单由 Jest 的机器可读报告直接渲染，不是手写的。它回答的是「那 N 项测试到底是哪些」，任何人都可以复跑 `npm test` 核对。

## 总计

| 项目 | 数量 |
| --- | --- |
| 测试套件 | 76 |
| 套件通过 | 73 |
| 套件失败 | 0 |
| 套件跳过 | 3 |
| 测试用例 | 634 |
| 用例通过 | 560 |
| 用例失败 | 0 |
| 用例跳过 | 74 |

> 这些是**回归测试**：它们证明的是「改动之后既有功能没有被破坏」，不证明模型准确率。模型质量看 [待办提取评测](./task-extraction-eval.md) 和 [TTS 基准](./tts-model-benchmark-windows.md)。

## 按功能域

![按功能域的用例数](./charts/jest-by-area.svg)

| 功能域 | 套件 | 用例 | 通过 | 跳过 | 覆盖内容 |
| --- | --- | --- | --- | --- | --- |
| Agent 与检索 | 15 | 94 | 93 | 1 | Agent 循环、工具调用、笔记范围、混合检索与排序融合 |
| 任务与日程 | 9 | 188 | 134 | 54 | 待办提取、相对日期改写、周期展开、任务归属与提醒 |
| 模型与语音 | 8 | 32 | 32 | 0 | TTS 引擎与音色、模型激活与删除保护、转写与取消、运行时安装 |
| 数据与可靠性 | 13 | 62 | 43 | 19 | 数据迁移、导出、回收站、工作流与会话持久化 |
| 界面与交互 | 22 | 194 | 194 | 0 | 导航、弹窗、HUD、快捷键、引导教程、拖放与窄屏布局 |
| 主进程与系统 | 4 | 17 | 17 | 0 | 主进程 IPC、后台任务、启动流程与设置模式 |
| 其他 | 5 | 47 | 47 | 0 | 未归类 |

## 按套件

| 套件 | 功能域 | 用例 | 通过 | 失败 | 跳过 | 耗时 |
| --- | --- | --- | --- | --- | --- | --- |
| `src/__tests__/Accelerator.test.ts` | 界面与交互 | 12 | 12 | 0 | 0 | 0.2 s |
| `src/__tests__/App.test.tsx` | 界面与交互 | 1 | 1 | 0 | 0 | 16.9 s |
| `src/__tests__/BackgroundShortcuts.test.ts` | 界面与交互 | 18 | 18 | 0 | 0 | 11.2 s |
| `src/__tests__/BackNavigation.test.tsx` | 界面与交互 | 15 | 15 | 0 | 0 | 16.1 s |
| `src/__tests__/CloseConfirmDialog.test.tsx` | 界面与交互 | 8 | 8 | 0 | 0 | 1.4 s |
| `src/__tests__/HudLayout.test.ts` | 界面与交互 | 19 | 19 | 0 | 0 | 9.8 s |
| `src/__tests__/HudWindows.test.tsx` | 界面与交互 | 21 | 21 | 0 | 0 | 12.5 s |
| `src/__tests__/markdownAst.test.ts` | 界面与交互 | 27 | 27 | 0 | 0 | 9.8 s |
| `src/__tests__/MarkdownText.test.tsx` | 界面与交互 | 9 | 9 | 0 | 0 | 0.6 s |
| `src/__tests__/NoteInsightsPanel.test.tsx` | 界面与交互 | 2 | 2 | 0 | 0 | 11.9 s |
| `src/__tests__/OnboardingRoute.test.ts` | 界面与交互 | 4 | 4 | 0 | 0 | 0.4 s |
| `src/__tests__/OnboardingSteps.test.ts` | 界面与交互 | 12 | 12 | 0 | 0 | 0.3 s |
| `src/__tests__/RecordingReviewDialog.test.tsx` | 界面与交互 | 2 | 2 | 0 | 0 | 0.8 s |
| `src/__tests__/SettingsTourAnchors.test.tsx` | 界面与交互 | 2 | 2 | 0 | 0 | 0.8 s |
| `src/__tests__/ShortcutRecorder.test.tsx` | 界面与交互 | 7 | 7 | 0 | 0 | 1.5 s |
| `src/__tests__/TourClickDemo.test.tsx` | 界面与交互 | 7 | 7 | 0 | 0 | 1.1 s |
| `src/__tests__/TourDragDemo.test.tsx` | 界面与交互 | 6 | 6 | 0 | 0 | 5.3 s |
| `src/__tests__/TourHoverDemo.test.tsx` | 界面与交互 | 8 | 8 | 0 | 0 | 1.3 s |
| `src/__tests__/TourHudStage.test.tsx` | 界面与交互 | 9 | 9 | 0 | 0 | 5.3 s |
| `src/renderer/pages/ModelManager/components/ModelSelect.test.tsx` | 界面与交互 | 2 | 2 | 0 | 0 | 1.0 s |
| `src/renderer/pages/ModelManager/useModelManager.test.ts` | 界面与交互 | 1 | 1 | 0 | 0 | 1.0 s |
| `src/renderer/pages/Settings/components/HardwareSettingsPanel.test.tsx` | 界面与交互 | 2 | 2 | 0 | 0 | 2.0 s |
| `src/__tests__/isTranscriptionFileBusy.test.ts` | 模型与语音 | 9 | 9 | 0 | 0 | 0.2 s |
| `src/__tests__/TranscriptionAbort.test.ts` | 模型与语音 | 9 | 9 | 0 | 0 | 14.3 s |
| `src/__tests__/useTranscriptionController.test.tsx` | 模型与语音 | 1 | 1 | 0 | 0 | 11.7 s |
| `src/main/runtime/__tests__/RuntimeInstallSupport.test.ts` | 模型与语音 | 4 | 4 | 0 | 0 | 0.2 s |
| `src/main/tts/__tests__/TTSEngine.test.ts` | 模型与语音 | 1 | 1 | 0 | 0 | 0.2 s |
| `src/main/tts/__tests__/TTSInput.test.ts` | 模型与语音 | 2 | 2 | 0 | 0 | 0.3 s |
| `src/main/tts/__tests__/TTSModelManager.test.ts` | 模型与语音 | 3 | 3 | 0 | 0 | 0.6 s |
| `src/renderer/tts/TTSPlaybackPipeline.test.ts` | 模型与语音 | 3 | 3 | 0 | 0 | 0.3 s |
| `src/__tests__/HeaderMenuPosition.test.ts` | 其他 | 6 | 6 | 0 | 0 | 0.2 s |
| `src/__tests__/NoteCategory.test.ts` | 其他 | 8 | 8 | 0 | 0 | 0.3 s |
| `src/__tests__/NoteListFlash.test.tsx` | 其他 | 10 | 10 | 0 | 0 | 12.4 s |
| `src/__tests__/NoteListHeaderControls.test.tsx` | 其他 | 18 | 18 | 0 | 0 | 12.4 s |
| `src/__tests__/useRoutedNoteChat.test.ts` | 其他 | 5 | 5 | 0 | 0 | 0.3 s |
| `src/__tests__/CompletionDetector.test.ts` | 任务与日程 | 15 | 15 | 0 | 0 | 0.2 s |
| `src/__tests__/DailyReminder.test.tsx` | 任务与日程 | 4 | 4 | 0 | 0 | 11.3 s |
| `src/__tests__/DateContext.test.ts` | 任务与日程 | 19 | 19 | 0 | 0 | 0.2 s |
| `src/__tests__/RecurrenceExpander.test.ts` | 任务与日程 | 12 | 12 | 0 | 0 | 0.2 s |
| `src/__tests__/RelativeDateRewriter.test.ts` | 任务与日程 | 57 | 57 | 0 | 0 | 11.1 s |
| `src/__tests__/summarizeTodosByNote.test.ts` | 任务与日程 | 9 | 9 | 0 | 0 | 1.3 s |
| `src/__tests__/todoExtraction.eval.ts` | 任务与日程 | 54 | 0 | 0 | 54 | 0.0 s |
| `src/__tests__/TodoExtractionService.privacy.test.ts` | 任务与日程 | 4 | 4 | 0 | 0 | 9.9 s |
| `src/__tests__/TodoOwnershipFilter.test.ts` | 任务与日程 | 14 | 14 | 0 | 0 | 0.3 s |
| `src/__tests__/WorkspaceNoteCard.test.tsx` | 数据与可靠性 | 8 | 8 | 0 | 0 | 16.0 s |
| `src/i18n/locales/TrashLocales.test.ts` | 数据与可靠性 | 2 | 2 | 0 | 0 | 2.0 s |
| `src/main/audio/__tests__/RecordingStorageService.test.ts` | 数据与可靠性 | 2 | 2 | 0 | 0 | 5.4 s |
| `src/main/export/__tests__/NoteExport.test.ts` | 数据与可靠性 | 2 | 2 | 0 | 0 | 1.0 s |
| `src/main/export/__tests__/NoteExportRepository.electron.test.ts` | 数据与可靠性 | 1 | 0 | 0 | 1 | 0.0 s |
| `src/main/ipc/__tests__/WorkspaceStructuredNoteGeneration.test.ts` | 数据与可靠性 | 2 | 2 | 0 | 0 | 0.2 s |
| `src/main/startup/__tests__/UserDataMigration.test.ts` | 数据与可靠性 | 2 | 2 | 0 | 0 | 0.3 s |
| `src/main/trash/__tests__/TrashService.test.ts` | 数据与可靠性 | 18 | 0 | 0 | 18 | 0.0 s |
| `src/main/workflow/__tests__/WorkflowService.test.ts` | 数据与可靠性 | 3 | 3 | 0 | 0 | 0.4 s |
| `src/renderer/components/TrashCanButton.test.tsx` | 数据与可靠性 | 1 | 1 | 0 | 0 | 0.5 s |
| `src/renderer/components/TrashUndoToast.test.tsx` | 数据与可靠性 | 1 | 1 | 0 | 0 | 0.7 s |
| `src/renderer/pages/Settings/components/TrashSettingsPanel.test.tsx` | 数据与可靠性 | 5 | 5 | 0 | 0 | 15.4 s |
| `src/renderer/pages/Workspace/WorkspacePage.test.tsx` | 数据与可靠性 | 15 | 15 | 0 | 0 | 1.4 s |
| `src/__tests__/AudioUploadProgress.test.ts` | 主进程与系统 | 1 | 1 | 0 | 0 | 0.2 s |
| `src/__tests__/BackgroundRequests.test.tsx` | 主进程与系统 | 5 | 5 | 0 | 0 | 0.6 s |
| `src/__tests__/BackgroundSettingsSchema.test.ts` | 主进程与系统 | 6 | 6 | 0 | 0 | 0.5 s |
| `src/main/AI-module/__tests__/ActiveModelStateStore.test.ts` | 主进程与系统 | 5 | 5 | 0 | 0 | 0.3 s |
| `scripts/benchmark/agent-eval-scoring.test.ts` | Agent 与检索 | 4 | 4 | 0 | 0 | 0.4 s |
| `src/__tests__/AskAINotePreview.test.tsx` | Agent 与检索 | 1 | 1 | 0 | 0 | 1.0 s |
| `src/__tests__/AskAIRecentsActive.test.tsx` | Agent 与检索 | 3 | 3 | 0 | 0 | 2.9 s |
| `src/__tests__/NoteSearch.test.ts` | Agent 与检索 | 15 | 15 | 0 | 0 | 0.3 s |
| `src/__tests__/useActiveAgentRun.test.ts` | Agent 与检索 | 5 | 5 | 0 | 0 | 0.4 s |
| `src/main/agent/__tests__/AgentAllWorkspaceScope.test.ts` | Agent 与检索 | 8 | 8 | 0 | 0 | 0.4 s |
| `src/main/agent/__tests__/AgentExtractTodosTool.test.ts` | Agent 与检索 | 5 | 5 | 0 | 0 | 0.2 s |
| `src/main/agent/__tests__/AgentOrchestratorLoop.test.ts` | Agent 与检索 | 11 | 11 | 0 | 0 | 0.2 s |
| `src/main/agent/__tests__/AgentPrompt.test.ts` | Agent 与检索 | 14 | 14 | 0 | 0 | 0.3 s |
| `src/main/agent/__tests__/AgentSearchNotesTool.test.ts` | Agent 与检索 | 5 | 5 | 0 | 0 | 0.2 s |
| `src/main/ask-ai/__tests__/AskAIRecordTurn.test.ts` | Agent 与检索 | 4 | 4 | 0 | 0 | 0.9 s |
| `src/main/knowledge/__tests__/KnowledgeGenerationParsing.test.ts` | Agent 与检索 | 7 | 7 | 0 | 0 | 0.3 s |
| `src/main/recommendation/__tests__/GpuMerge.test.ts` | Agent 与检索 | 6 | 6 | 0 | 0 | 0.2 s |
| `src/main/semantic/__tests__/SemanticNoteSearch.test.ts` | Agent 与检索 | 2 | 1 | 0 | 1 | 0.5 s |
| `src/main/workflow/__tests__/KnowledgeTemplateNormalizer.test.ts` | Agent 与检索 | 4 | 4 | 0 | 0 | 0.3 s |

## 全部用例

按套件分组，逐条列出。

### Agent 与检索

**`scripts/benchmark/agent-eval-scoring.test.ts`**（4 条）

- ✓ Agent evaluation scoring scores facts and first-search retrieval from the recorded tool trace
- ✓ Agent evaluation scoring fails a fluent answer that uses the forbidden draft value
- ✓ Agent evaluation scoring counts a repeated call even when the orchestrator blocks execution
- ✓ Agent evaluation scoring recovers ranked note ids from a production-truncated tool result

**`src/__tests__/AskAINotePreview.test.tsx`**（1 条）

- ✓ Ask AI note preview loads and displays the saved Structured Note

**`src/__tests__/AskAIRecentsActive.test.tsx`**（3 条）

- ✓ 最近会话里的当前会话 只有正在进行的那一条常亮
- ✓ 最近会话里的当前会话 用 aria-current 告诉读屏软件哪条是当前会话
- ✓ 最近会话里的当前会话 刚点了「新建会话」还没提问时，谁都不亮

**`src/__tests__/NoteSearch.test.ts`**（15 条）

- ✓ splitSearchTerms 按空白拆词并统一小写
- ✓ splitSearchTerms 空查询拆出空数组
- ✓ matchesAllTerms 每个词都要命中，不是命中任意一个
- ✓ matchesAllTerms 没有关键词时一律算命中
- ✓ buildSnippet 没搜索时就是开头一段
- ✓ buildSnippet 搜索时把窗口挪到命中词附近
- ✓ buildSnippet 短文本原样返回，不加省略号
- ✓ buildSnippet 关键词只在标题里、正文没有时，退回开头一段
- ✓ highlightSegments 把命中的词单独切出来
- ✓ highlightSegments 同一个词出现多次都要标出来
- ✓ highlightSegments 重叠的关键词合并成一段，不会切出交叉片段
- ✓ highlightSegments 没有关键词时原样返回一整段
- ✓ DashboardNoteItem.matchesSearch 多个词可以分别落在标题和正文上
- ✓ DashboardNoteItem.matchesSearch 有一个词落空就不算命中
- ✓ DashboardNoteItem.matchesSearch 也能按界面上显示的类型文案搜

**`src/__tests__/useActiveAgentRun.test.ts`**（5 条）

- ✓ useActiveAgentRun 卸载时取消正在跑的 run
- ✓ useActiveAgentRun 没有正在跑的 run 时卸载不发取消
- ✓ useActiveAgentRun abandonRun 取消并交还归属权
- ✓ useActiveAgentRun 取消失败不抛出，前端状态照样清干净
- ✓ useActiveAgentRun 同一次 run 不会被重复取消

**`src/main/agent/__tests__/AgentAllWorkspaceScope.test.ts`**（8 条）

- ✓ 不限定工作区（workspaceId 为 null）时的行为 normalizeAgentRequest 接受空工作区而不再报错
- ✓ 不限定工作区（workspaceId 为 null）时的行为 仍然拒绝非法的工作区 ID
- ✓ 不限定工作区（workspaceId 为 null）时的行为 read_note 在不限定工作区时可以读取任意工作区的笔记
- ✓ 不限定工作区（workspaceId 为 null）时的行为 有关联笔记时拒绝读取范围外的笔记
- ✓ 不限定工作区（workspaceId 为 null）时的行为 挂上的笔记成为检索范围，不返回其他笔记
- ✓ 不限定工作区（workspaceId 为 null）时的行为 挂上的笔记不会因为检索没命中就丢失
- ✓ 不限定工作区（workspaceId 为 null）时的行为 normalizeAgentRequest 会清洗挂载的笔记 ID
- ✓ 不限定工作区（workspaceId 为 null）时的行为 限定了工作区时仍然拒绝跨区读取

**`src/main/agent/__tests__/AgentExtractTodosTool.test.ts`**（5 条）

- ✓ createAgentExtractTodosTool 跑一次提取并把落库后的待办读回来
- ✓ createAgentExtractTodosTool 提取失败时仍返回库里已有的待办，并带上提示
- ✓ createAgentExtractTodosTool 拒绝无效的笔记 ID
- ✓ createAgentExtractTodosTool 限定了工作区时拒绝跨区提取
- ✓ createAgentExtractTodosTool 有关联笔记时拒绝给范围外的笔记提取待办

**`src/main/agent/__tests__/AgentOrchestratorLoop.test.ts`**（11 条）

- ✓ 重复调用短路 同一工具同一参数第二次不再真正执行
- ✓ 重复调用短路 参数顺序不同但内容相同也算重复
- ✓ 重复调用短路 参数不同则照常执行
- ✓ 重复调用短路 一直重复也不会跑满预算后无话可说
- ✓ 最后一步强制作答 最后一轮不再向模型提供工具
- ✓ 最后一步强制作答 撞上限时给出的是真答案而不是模板话
- ✓ 运行状态回灌 每轮都带上剩余步数
- ✓ 运行状态回灌 第二轮把已调用过的工具列出来
- ✓ 运行状态回灌 最后一步明确告知不再有工具
- ✓ 未注册工具 调用不存在的工具不会崩，错误回灌给模型后继续
- ✓ 用户关联笔记上下文 首轮自动载入全部关联笔记，并且不开放全库搜索

**`src/main/agent/__tests__/AgentPrompt.test.ts`**（14 条）

- ✓ 分层系统提示词 文首写明冲突时按层级编号裁决
- ✓ 分层系统提示词 六个层级齐全且按序出现
- ✓ 分层系统提示词 每层都标出作用域
- ✓ 分层系统提示词 规则带层级编号，便于模型自我定位
- ✓ 分层系统提示词 L1 覆盖不可编造与不泄露推理
- ✓ 分层系统提示词 明确 L5 不能压过 L1
- ✓ 会话作用域层（L5） 不限定工作区时说明可检索全部笔记
- ✓ 会话作用域层（L5） 限定工作区时带上工作区编号
- ✓ 会话作用域层（L5） 挂上的笔记成为本轮明确范围
- ✓ 会话作用域层（L5） 没挂笔记时不留空行占位
- ✓ 运行状态回灌 普通轮次报出步数与剩余
- ✓ 运行状态回灌 列出已调用过的工具并要求不要重复
- ✓ 运行状态回灌 最后一步说明没有工具可用，必须作答
- ✓ 重复调用提示 说明没有再执行，并给出下一步选择

**`src/main/agent/__tests__/AgentSearchNotesTool.test.ts`**（5 条）

- ✓ createAgentSearchNotesTool（混合检索） 关键词命中时依然会跑语义检索，两路结果一起返回
- ✓ createAgentSearchNotesTool（混合检索） 两路都命中的笔记排在只命中一路的前面
- ✓ createAgentSearchNotesTool（混合检索） 语义检索不可用时退化为纯关键词，不抛错
- ✓ createAgentSearchNotesTool（混合检索） 两路都没结果时返回 none
- ✓ createAgentSearchNotesTool（混合检索） 有关联笔记时过滤掉语义检索返回的范围外结果

**`src/main/ask-ai/__tests__/AskAIRecordTurn.test.ts`**（4 条）

- ✓ AskAIService.recordTurn（智能体问答落库） 没有会话 id 时新建会话，并写入一问一答
- ✓ AskAIService.recordTurn（智能体问答落库） 带上会话 id 时追加到同一个会话，不再新建
- ✓ AskAIService.recordTurn（智能体问答落库） 把挂上的笔记记为来源，重复挂载不会写两次
- ✓ AskAIService.recordTurn（智能体问答落库） 空回答直接报错，不写入半条记录

**`src/main/knowledge/__tests__/KnowledgeGenerationParsing.test.ts`**（7 条）

- ✓ knowledge generation strict parsing always derives a summary from a non-empty transcript
- ✓ knowledge generation strict parsing accepts exact structured note content and preserves empty arrays
- ✓ knowledge generation strict parsing rejects prose, missing fields, and unknown fields
- ✓ knowledge generation strict parsing requires the task/action hierarchy and null time fields
- ✓ knowledge generation strict parsing keeps scenario section order and excludes structured note categories
- ✓ knowledge generation strict parsing keeps every built-in scenario precise and reusable
- ✓ knowledge generation strict parsing keeps stable section keys while localizing visible scenario copy

**`src/main/recommendation/__tests__/GpuMerge.test.ts`**（6 条）

- ✓ mergeGpuCandidates 把只有厂商名的兜底条目并进同厂商的具名显卡
- ✓ mergeGpuCandidates 兜底条目的驱动版本会补进具名条目的空字段
- ✓ mergeGpuCandidates 同厂商没有具名条目时，兜底条目自己成行
- ✓ mergeGpuCandidates 有真显卡时不列出虚拟显示适配器
- ✓ mergeGpuCandidates 一块真显卡都没有时保留虚拟适配器，避免面板空着
- ✓ mergeGpuCandidates 不同厂商的多块显卡各自成行

**`src/main/semantic/__tests__/SemanticNoteSearch.test.ts`**（2 条）

- ✓ SemanticNoteService complete note search guarantees an exact match from generated note content
- – SemanticNoteContentRepository collects every text source displayed inside a note（跳过）

**`src/main/workflow/__tests__/KnowledgeTemplateNormalizer.test.ts`**（4 条）

- ✓ KnowledgeTemplateNormalizer turns unsafe and duplicate section keys into stable unique keys
- ✓ KnowledgeTemplateNormalizer rejects a model response without two usable sections
- ✓ KnowledgeTemplateNormalizer asks the local model for exact JSON and sanitizes the response
- ✓ KnowledgeTemplateNormalizer requires normalized visible fields to follow the application language

### 任务与日程

**`src/__tests__/CompletionDetector.test.ts`**（15 条）

- ✓ isCompletedClause 认出明确的完成说法
- ✓ isCompletedClause 认出英文的完成说法
- ✓ isCompletedClause 光秃秃的「了」不算完成 —— 这是待办的常见语气
- ✓ isCompletedClause 未来 / 待办语气不算完成
- ✓ isCompletedClause 空白不算
- ✓ annotateCompletedClauses 只在已完成的句子后面补标记，原文不动
- ✓ annotateCompletedClauses 保留原有标点与顺序
- ✓ annotateCompletedClauses 没有完成句时一个字都不改
- ✓ annotateCompletedClauses 重复执行不会叠加标记
- ✓ annotateCompletedClauses 空输入原样返回
- ✓ isEntirelyCompleted 测试 #15：整段都是已完成的事 —— 应判定为零待办
- ✓ isEntirelyCompleted 混合内容不短路，交给模型判断
- ✓ isEntirelyCompleted 纯待办不会被误判
- ✓ isEntirelyCompleted 纯陈述 / 寒暄不算「全部已完成」，走原来的空数组路径
- ✓ isEntirelyCompleted 空输入不短路

**`src/__tests__/DailyReminder.test.tsx`**（4 条）

- ✓ 今日事项提醒 使用本地日期而不是 UTC 日期
- ✓ 今日事项提醒 只选当天标记，未完成与置顶事项排在前面
- ✓ 今日事项提醒 显示今日清单，支持稍后处理、查看仪表板与 Esc 关闭
- ✓ 今日事项提醒 每次启动或从托盘重新显示都会读取今日事项

**`src/__tests__/DateContext.test.ts`**（19 条）

- ✓ toLocalDateString 取本地日期，不受 UTC 换日影响
- ✓ toLocalDateString 月末和年末的补零正确
- ✓ 相对日期锚点 用户实测漏掉的三个日期都在表里
- ✓ 相对日期锚点 今天 / 明天 / 后天
- ✓ 相对日期锚点 本周以周一为起点
- ✓ 相对日期锚点 下周整体后移七天
- ✓ 相对日期锚点 周日当天不会被算进下一周
- ✓ 相对日期锚点 周一当天的本周一就是自己
- ✓ 相对日期锚点 跨月与跨年的月底 / 下月初
- ✓ 相对日期锚点 「一个月后」在月末会夹到有效日期
- ✓ buildDateReference 写明今天的星期，模型不必自己推算
- ✓ buildDateReference 明确要求查表而不是自己算
- ✓ buildDateReference 把失败案例里的对照行整行列出来
- ✓ normalizeDueDate 放行合法日期
- ✓ normalizeDueDate null / 空值回落到今天
- ✓ normalizeDueDate 挡掉不存在的日历日期
- ✓ normalizeDueDate 挡掉格式不对的输出
- ✓ normalizeDueDate 挡掉年份离谱的幻觉
- ✓ normalizeDueDate 允许近期的过去日期（补录已逾期事项）

**`src/__tests__/RecurrenceExpander.test.ts`**（12 条）

- ✓ normalizeRepeat 放行枚举值，大小写与空格不敏感
- ✓ normalizeRepeat 容忍模型的自然语言写法
- ✓ normalizeRepeat 空值与无法识别的值一律当作不重复
- ✓ expandOccurrences 不重复时只有一条
- ✓ expandOccurrences 每天：从起点开始逐日铺满
- ✓ expandOccurrences 每周五：每个周五都有一条，不只第一个
- ✓ expandOccurrences 工作日跳过周六周日
- ✓ expandOccurrences 每两周按 14 天推进
- ✓ expandOccurrences 每月保持同一号
- ✓ expandOccurrences 每月 31 号跳过没有 31 号的月份，而不是滑到下月 1 号
- ✓ expandOccurrences 默认展开范围有限，不会无休止铺下去
- ✓ expandOccurrences 日期非法时退化为单条，不抛异常

**`src/__tests__/RelativeDateRewriter.test.ts`**（57 条）

- ✓ 用户实测失败的那句话 三个日期全部就地标注出来
- ✓ 用户实测失败的那句话 不动原句其余部分
- ✓ 星期几 裸周X：本周还没到就算本周
- ✓ 星期几 裸周X：本周已经过了就顺延到下周
- ✓ 星期几 裸周X：当天算已过，顺延到下周
- ✓ 星期几 用户实测：周四当天说「周四之前」应落在下周四
- ✓ 星期几 本周还没到的那天仍然算本周
- ✓ 星期几 「本周四」显式写本周时仍是今天
- ✓ 星期几 下周X 一律指下一周
- ✓ 星期几 本周X 指当前这一周
- ✓ 星期几 上周X 指上一周
- ✓ 星期几 下下周X 再往后推一周
- ✓ 星期几 下周X 不会被裸周X规则二次匹配
- ✓ 星期几 星期 / 礼拜 / 周7 等写法都认
- ✓ 日 / 月 / 周期 今明后昨前天
- ✓ 日 / 月 / 周期 大后天优先于后天匹配
- ✓ 日 / 月 / 周期 月底 / 下月初 / 下个月
- ✓ 日 / 月 / 周期 N 天后 / N 周后，中文数字和阿拉伯数字都认
- ✓ 日 / 月 / 周期 本周末指周六
- ✓ 英文 today / tomorrow / yesterday
- ✓ 英文 next / this + 星期几
- ✓ 英文 裸星期几沿用中文那套就近规则
- ✓ 英文 中英混杂
- ✓ 边界与幂等 空输入原样返回
- ✓ 边界与幂等 没有相对日期时一个字都不改
- ✓ 边界与幂等 重复执行不会叠加标注
- ✓ 边界与幂等 一句话里多个相对日期各自标注
- ✓ 边界与幂等 跨月跨年时正确进位
- ✓ 边界与幂等 数字串不会被当成日期
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 八月三十一号 —— 中文数字月日
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 整句三个日期现在全部标注
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 阿拉伯数字与中英混写
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 带年份时以年份为准
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 没写年份且日期已过很久时顺延到明年
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 刚过去不久的日期仍算今年
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 不存在的日期不做标注
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 「三号楼」这类不是日期，绝不能被标注
- ✓ 绝对日期（用户实测里 8/31 没生效的那条） 绝对日期不会被裸周X等规则切碎
- ✓ 模糊时间范围（测试 #4） 旬：上旬 / 中旬 / 下旬 取该区间最后一天
- ✓ 模糊时间范围（测试 #4） 年底 / 年初
- ✓ 模糊时间范围（测试 #4） 测试 #4 整句：三个时间点全部标注
- ✓ 周期性事项（测试 #5） 每天标成 daily，并给出首次日期
- ✓ 周期性事项（测试 #5） 每周五标成 weekly，首次落在最近的周五
- ✓ 周期性事项（测试 #5） 每周X 不会被裸周X规则切碎
- ✓ 周期性事项（测试 #5） 每月X号 / 每两周 / 每个工作日
- ✓ 周期性事项（测试 #5） 测试 #5 整句：两个周期任务各自标注，下周也解析出来
- ✓ 周期性事项（测试 #5） 重复执行不会叠加重复标注
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 以同句里前一个日期为基准往回推
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 提前一周按 7 天算
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 同句里有多个日期时取最近的那个作基准
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 句子里没有基准日期就不标注，不拿今天硬凑
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 跨句不借用上一句的日期
- ✓ 提前 N 天（相对另一个日期，测试 #6 / #7） 重复执行不会叠加
- ✓ 标注日期的兜底（模型漏抄 dueDate 时） 全文只有一个标注日期时能取出来
- ✓ 标注日期的兜底（模型漏抄 dueDate 时） 有多个不同日期时不猜，返回 null
- ✓ 标注日期的兜底（模型漏抄 dueDate 时） 一个日期都没标注时返回 null
- ✓ 标注日期的兜底（模型漏抄 dueDate 时） 重复标注也算同一个日期

**`src/__tests__/summarizeTodosByNote.test.ts`**（9 条）

- ✓ summarizeTodosByNote 没有待办的笔记不会出现在结果里
- ✓ summarizeTodosByNote 取最近一个还没到的日期作为主显
- ✓ summarizeTodosByNote 当天的待办算「还没到」，不算过期
- ✓ summarizeTodosByNote 全部过期时取最后一个，并标记为过期
- ✓ summarizeTodosByNote 同一天的多条待办只算一个日期
- ✓ summarizeTodosByNote 重复待办展开成 91 条也只显示一个日期加计数
- ✓ summarizeTodosByNote 按笔记分组，互不串味
- ✓ summarizeTodosByNote 没有关联笔记的待办直接忽略
- ✓ summarizeTodosByNote 带时间戳的日期只取前十位

**`src/__tests__/todoExtraction.eval.ts`**（54 条）

- – 待办提取评测 (qwen2.5:3b-instruct) #D01 [dev] 单条任务，绝对日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D02 [dev] 多条任务，混合日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D03 [dev] 口语相对时间（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D04 [dev] 模糊时间范围（上旬 / 年底）（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D05 [dev] 周期性事项（每天 + 每周五）（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D06 [dev] 事件日 + 提醒日（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D07 [dev] 截止日 + 提前量（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D08 [dev] 同一件事反复提（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D09 [dev] 抱怨式待办（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D10 [dev] 客户在等（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D11 [dev] 心里记挂（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D12 [dev] 极度含蓄（0 或 1 都可接受）（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D13 [dev] 被动委婉语气（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D14 [dev] 纯陈述，无任务（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D15 [dev] 已完成事项（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D16 [dev] 别人的任务（明说不管）（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D17 [dev] 数字干扰项（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D18 [dev] 有任务但没日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D19 [dev] 中英混杂（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D20 [dev] 强口语 / 改口（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D21 [dev] 极短输入（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #D22 [dev] 只有寒暄（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H01 [holdout] 带年份与不带年份的绝对日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H02 [holdout] 大后天 / 下下周（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H03 [holdout] 这周末的两件事（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H04 [holdout] 月底 / 下月初（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H05 [holdout] 一次列举五件事（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H06 [holdout] 每月某日 + 每两周（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H07 [holdout] 每个工作日（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H08 [holdout] 已完成与未完成混在一句（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H09 [holdout] 别人的任务与自己的任务混合（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H10 [holdout] 条件句，做与不做取决于对方（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H11 [holdout] 取消与推迟（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H12 [holdout] 订单号与金额干扰（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H13 [holdout] 通话寒暄（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H14 [holdout] 极短，带日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H15 [holdout] 极短，无日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H16 [holdout] 完整周会记录，含已完成项与周期项（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H17 [holdout] 中英混合，含无日期任务（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H18 [holdout] 疑问句形式的任务（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H19 [holdout] 转述他人要求，仍是自己的任务（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H20 [holdout] 改期，原日期不应保留（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H21 [holdout] 有空再做，无明确日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H22 [holdout] 跨年日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H23 [holdout] 节假日表述 + 绝对日期（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H24 [holdout] 同一天两个时间点（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H25 [holdout] 极度客气的请求（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H26 [holdout] 抱怨式，长期未处理（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H27 [holdout] 外部压力式待办（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H28 [holdout] 待确认事项（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H29 [holdout] 回邮件 + 前置确认（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H30 [holdout] 同一件事三种说法（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H31 [holdout] 纯数据同步（跳过）
- – 待办提取评测 (qwen2.5:3b-instruct) #H32 [holdout] 周期任务与一次性任务并存（跳过）

**`src/__tests__/TodoExtractionService.privacy.test.ts`**（4 条）

- ✓ TodoExtractionService 默认模式不外泄私人内容 模型返回非 JSON 时不把输出写进 console
- ✓ TodoExtractionService 默认模式不外泄私人内容 JSON 解析失败时不外泄（解析器报错自带原文片段）
- ✓ TodoExtractionService 默认模式不外泄私人内容 上游报错回显 prompt 时不外泄（prompt 内含笔记原文）
- ✓ TodoExtractionService 默认模式不外泄私人内容 显式打开 debug 时，原文只进日志文件、仍然不进 console

**`src/__tests__/TodoOwnershipFilter.test.ts`**（14 条）

- ✓ allowsOwnershipDrops（确定性闸门） 有明确甩手表述时才放行
- ✓ allowsOwnershipDrops（确定性闸门） 只是提到别人的名字不算甩手
- ✓ allowsOwnershipDrops（确定性闸门） 普通任务句一律不放行
- ✓ parseOwnershipVerdicts 解析标准格式
- ✓ parseOwnershipVerdicts 兼容模型多写一个 KEEP/DROP 字段
- ✓ parseOwnershipVerdicts 兼容全角竖线和拖在后面的解释
- ✓ parseOwnershipVerdicts 解析不出来的行保留该条
- ✓ parseOwnershipVerdicts 越界编号被忽略，不影响其它条目
- ✓ parseOwnershipVerdicts ALREADY_DONE / NOT_A_TASK 记录下来但不据此删除
- ✓ isSuspiciousVerdictSet（塌缩保护） 两三条全判成别人的活是正常的
- ✓ isSuspiciousVerdictSet（塌缩保护） 四条以上全删更像模型跑飞
- ✓ isSuspiciousVerdictSet（塌缩保护） 只要有保留项就不算塌缩
- ✓ buildOwnershipPrompt 候选按编号列出，原文原样带上
- ✓ buildOwnershipPrompt 明确写出「拿不准就 MINE」，倾向保留

### 模型与语音

**`src/__tests__/isTranscriptionFileBusy.test.ts`**（9 条）

- ✓ isTranscriptionFileBusy 空闲时不忙
- ✓ isTranscriptionFileBusy 语言检测进行中算忙（BUG-002 复现方式 A）
- ✓ isTranscriptionFileBusy 文件转写 job 处理中算忙（BUG-002 复现方式 B）
- ✓ isTranscriptionFileBusy 请求提交中算忙
- ✓ isTranscriptionFileBusy keeps file actions disabled while the selected audio is importing
- ✓ isTranscriptionFileBusy 实时分段转写中算忙
- ✓ isTranscriptionFileBusy job 已完成不再算忙
- ✓ isTranscriptionFileBusy Structured Note 生成默认不影响普通转写忙碌状态
- ✓ isTranscriptionFileBusy includeStructuredNote 打开后生成草稿算忙（工作台入口用）

**`src/__tests__/TranscriptionAbort.test.ts`**（9 条）

- ✓ 转写任务的归属 不认领别的 controller 发起的任务
- ✓ 转写任务的归属 自己发起的任务才跟着更新状态
- ✓ 转写任务的归属 别人的任务插进来也不会改掉自己的状态
- ✓ 放弃这一轮采集 取消主进程那边还在跑的任务
- ✓ 放弃这一轮采集 本地状态清空，忙碌标记跟着消失——不然录音按钮一直是灰的
- ✓ 放弃这一轮采集 放弃之后，原任务再广播状态也不会被认领回来
- ✓ 放弃这一轮采集 没有在跑的任务时不去调取消
- ✓ 放弃这一轮采集 取消失败也不抛出去：本地状态已经清干净了
- ✓ 完整转写后的 Structured Note 只把完整 transcript 交给 Structured Note 生成器并保留同一份草稿

**`src/__tests__/useTranscriptionController.test.tsx`**（1 条）

- ✓ useTranscriptionController controller identity switches away from the previous transcript as soon as the controller changes

**`src/main/runtime/__tests__/RuntimeInstallSupport.test.ts`**（4 条）

- ✓ RuntimeInstallSupport 只在 Windows 上开放自动安装
- ✓ RuntimeInstallSupport macOS / Linux 关闭自动安装并给出手动安装说明
- ✓ RuntimeInstallSupport 非 Windows 平台的提示里不出现 Windows 字样
- ✓ RuntimeInstallSupport 未知平台回退到通用说明

**`src/main/tts/__tests__/TTSEngine.test.ts`**（1 条）

- ✓ TTSEngine reuses one engine and disposes it when the selected model changes

**`src/main/tts/__tests__/TTSInput.test.ts`**（2 条）

- ✓ normalizeTTSInput uses the active model default speaker when none is supplied
- ✓ normalizeTTSInput rejects a speaker that is not in the active model

**`src/main/tts/__tests__/TTSModelManager.test.ts`**（3 条）

- ✓ TTSModelManager auto-activates the first downloaded model and persists the choice
- ✓ TTSModelManager keeps an explicit activation instead of falling back to the first model
- ✓ TTSModelManager refuses to delete the active model, then deletes it after switching

**`src/renderer/tts/TTSPlaybackPipeline.test.ts`**（3 条）

- ✓ splitTTSChunks 优先在自然句末切分并限制片段长度
- ✓ splitTTSChunks 没有标点的长文本也不会丢字
- ✓ playTTSChunks 播放当前片段时已经开始合成下一片

### 数据与可靠性

**`src/__tests__/WorkspaceNoteCard.test.tsx`**（8 条）

- ✓ 笔记卡片的标题行 播放、转 Word、转 PDF、日期、删除都在同一行，且按这个顺序
- ✓ 笔记卡片的标题行 删除按钮不再单独占一行页脚
- ✓ 笔记卡片的标题行 导出时只传笔记身份，由主进程读取完整内容
- ✓ 笔记卡片的标题行 点删除会把这条笔记报上去
- ✓ 录音播放 平时不占地方，点播放才展开播放条
- ✓ 录音播放 没有录音的笔记不显示播放按钮
- ✓ 内容区排版 没有 sub-note 时不渲染那一块，免得空占一格
- ✓ 内容区排版 有 sub-note 时才出现

**`src/i18n/locales/TrashLocales.test.ts`**（2 条）

- ✓ Trash interface translations keeps the Trash key set complete in both locales
- ✓ Trash interface translations translates shared confirmation buttons instead of using fallbacks

**`src/main/audio/__tests__/RecordingStorageService.test.ts`**（2 条）

- ✓ RecordingStorageService audio import streams a selected file into managed storage and reports real progress
- ✓ RecordingStorageService audio import imports an m4a file from a Windows-style Unicode folder name

**`src/main/export/__tests__/NoteExport.test.ts`**（2 条）

- ✓ 完整笔记导出 只接受有效的笔记、工作空间与格式
- ✓ 完整笔记导出 把每类笔记内容交给 Word 与 PDF 共用的完整档案版式

**`src/main/export/__tests__/NoteExportRepository.electron.test.ts`**（1 条）

- – 完整导出数据库聚合 一次读取转写、两类知识、子笔记、模板输出、待办与对话（跳过）

**`src/main/ipc/__tests__/WorkspaceStructuredNoteGeneration.test.ts`**（2 条）

- ✓ Workspace 保存笔记后自动生成 Structured Note 笔记落库后把已完成的 Structured Note 草稿绑定到 noteId
- ✓ Workspace 保存笔记后自动生成 Structured Note 普通手写笔记没有草稿时不写 Structured Note

**`src/main/startup/__tests__/UserDataMigration.test.ts`**（2 条）

- ✓ migrateLegacyUserData 从 SpeakSpace 目录迁移数据库、设置和模型激活状态
- ✓ migrateLegacyUserData 不覆盖新目录里已经存在的数据

**`src/main/trash/__tests__/TrashService.test.ts`**（18 条）

- – TrashService moves and restores the same note without changing its content state（跳过）
- – TrashService absorbs previously trashed notes into one workspace item（跳过）
- – TrashService returns a workspace when the search matches a contained note（跳过）
- – TrashService permanently deletes note attachments but preserves its conversation（跳过）
- – TrashService permanently deletes a workspace and its Notes but preserves conversations（跳过）
- – TrashService rejects irreversible deletion of an active item（跳过）
- – TrashService keeps filters isolated and orders all item types by trashed time（跳过）
- – 知识模板的回收站 移入回收站后保留模板和历史生成结果（跳过）
- – 知识模板的回收站 恢复后重新成为可用模板（跳过）
- – 知识模板的回收站 只有从回收站彻底删除时才级联删除历史输出（跳过）
- – 对话的回收站 移入回收站只打时间戳，消息一条不少（跳过）
- – 对话的回收站 已经在回收站里的不能再删一次（跳过）
- – 对话的回收站 回收站列表里能看到它，并带上消息条数（跳过）
- – 对话的回收站 按笔记 / 工作空间筛选时不会混进来（跳过）
- – 对话的回收站 搜索按会话名匹配（跳过）
- – 对话的回收站 恢复之后回到正常列表（跳过）
- – 对话的回收站 彻底删除会连消息一起清掉，不留孤儿（跳过）
- – 对话的回收站 没在回收站里的不能恢复、也不能彻底删除（跳过）

**`src/main/workflow/__tests__/WorkflowService.test.ts`**（3 条）

- ✓ WorkflowService scenario templates combines maintained built-ins with clearly identified custom templates
- ✓ WorkflowService scenario templates localizes maintained built-ins to the selected application language
- ✓ WorkflowService scenario templates normalizes a natural-language request before the repository receives it

**`src/renderer/components/TrashCanButton.test.tsx`**（1 条）

- ✓ TrashCanButton renders the animated SVG directly inside the centered button

**`src/renderer/components/TrashUndoToast.test.tsx`**（1 条）

- ✓ TrashUndoToast does not dismiss while an undo operation is still running

**`src/renderer/pages/Settings/components/TrashSettingsPanel.test.tsx`**（5 条）

- ✓ TrashSettingsPanel restores an item immediately and refreshes the count
- ✓ TrashSettingsPanel keeps a successful restore successful when only the badge refresh fails
- ✓ TrashSettingsPanel requires confirmation before permanently deleting a workspace
- ✓ TrashSettingsPanel shows templates in the same Trash and warns about saved outputs
- ✓ TrashSettingsPanel carries the onboarding anchor the tour points at

**`src/renderer/pages/Workspace/WorkspacePage.test.tsx`**（15 条）

- ✓ WorkspacePage renders an empty workspace using the detail hook note contract
- ✓ WorkspacePage renders existing notes using the detail hook note contract
- ✓ WorkspacePage 一键全选当前可见笔记，同时保留其他筛选结果中的选择
- ✓ WorkspacePage 当前可见笔记已全选时只取消它们，不清除筛选外的选择
- ✓ WorkspacePage 部分可见笔记被选择时向辅助技术报告混合状态
- ✓ WorkspacePage 笔记问答按钮和批量删除同在顶栏工具条里，且都带计数
- ✓ WorkspacePage 点笔记问答就带着选中的笔记跳到对话工作台
- ✓ WorkspacePage 批量删除按钮只在勾选之后出现
- ✓ WorkspacePage 点批量删除先弹确认框，不直接删
- ✓ WorkspacePage 确认之后才把选中的笔记逐条移入回收站
- ✓ WorkspacePage 取消就什么都不删
- ✓ WorkspacePage opens the manual note creation dialog
- ✓ WorkspacePage uses a content-sized dialog for workspace deletion confirmation
- ✓ 两个容器的版式 笔记装在自己的滚动容器里，和顶栏是并列的两块
- ✓ 两个容器的版式 空状态和提示也放在滚动容器里，不会挤在顶栏上

### 界面与交互

**`src/__tests__/Accelerator.test.ts`**（12 条）

- ✓ acceleratorFromChord 把按键变成 Electron 认的字符串，修饰键顺序固定
- ✓ acceleratorFromChord Ctrl 和 Cmd 都归一成 CommandOrControl，换平台不用重设
- ✓ acceleratorFromChord 只按修饰键时还没成型，返回 null 继续等主键
- ✓ acceleratorFromChord 没有修饰键的普通键不能当全局快捷键
- ✓ acceleratorFromChord 功能键可以单独使用
- ✓ acceleratorFromChord 方向键、回车、空格用 Electron 的写法
- ✓ isValidAccelerator 认可正常组合
- ✓ isValidAccelerator 挡掉空值、裸键和不认识的修饰键
- ✓ formatAccelerator Windows 上写成 Ctrl+Alt+D
- ✓ formatAccelerator macOS 上用符号且不带加号
- ✓ findDuplicateActions 同一个组合绑了两个动作时两边都算冲突
- ✓ findDuplicateActions 没绑的动作不算重复

**`src/__tests__/App.test.tsx`**（1 条）

- ✓ App 使用完整产品名渲染应用外壳

**`src/__tests__/BackgroundShortcuts.test.ts`**（18 条）

- ✓ ShortcutManager 把配置好的组合注册上，并报告每个的结果
- ✓ ShortcutManager 组合被别的程序占用时标成 conflict，而不是静默失败
- ✓ ShortcutManager 没绑的算 disabled，非法字符串算 invalid 且不去注册
- ✓ ShortcutManager 同一个组合绑两个动作时，后一个算冲突
- ✓ ShortcutManager 后台常驻关掉时一个都不注册
- ✓ ShortcutManager 重新应用时先撤掉旧的，不会把旧组合留在系统里
- ✓ ShortcutManager releaseAll 之后系统里不留任何注册
- ✓ decideCloseAction 已经在退出流程里就放行，否则关不掉
- ✓ decideCloseAction 没开托盘就只能退出——没有地方可最小化
- ✓ decideCloseAction 按用户选的行为走
- ✓ interpretClosePrompt 第一个按钮是最小化，勾了记住就写回 tray
- ✓ interpretClosePrompt 第二个按钮是退出；没勾记住就不改设置
- ✓ interpretClosePrompt 取消（含直接关掉对话框）什么都不做
- ✓ buildTrayMenuTemplate 菜单项齐全，快捷键作为提示写在标签里
- ✓ buildTrayMenuTemplate 没绑快捷键的项不显示提示
- ✓ 应用内弹窗给回来的选择 最小化到托盘＝隐藏窗口
- ✓ 应用内弹窗给回来的选择 勾了记住就把这次的选择写回设置
- ✓ 应用内弹窗给回来的选择 取消什么都不做——即使勾了记住也不该改设置

**`src/__tests__/BackNavigation.test.tsx`**（15 条）

- ✓ readBackPath 用跳转时留下的来源路径
- ✓ readBackPath 没有来源时退回默认页
- ✓ readBackPath 只认站内路径，站外地址一律不跟
- ✓ readBackPath 调用方可以指定自己的兜底页
- ✓ backLabelKey 认识的页面给出侧边栏里的名字
- ✓ backLabelKey 叫不出名字的路径返回 null，按钮就只写「返回」
- ✓ 工作空间详情页的返回按钮 从仪表板点进来就回仪表板，并写明回哪去
- ✓ 工作空间详情页的返回按钮 从设置页点进来就回设置页
- ✓ 工作空间详情页的返回按钮 直接打开（没有来源）时回工作空间列表
- ✓ RouteManager 记录来源 跳转时把当前页写进 state.from
- ✓ RouteManager 记录来源 不覆盖调用方自己带的 state
- ✓ RouteManager 记录来源 没告诉它当前在哪时，行为和以前一样
- ✓ 顶栏的工具条插槽 工具条渲染在元信息那一行里，而不是另起一块
- ✓ 顶栏的工具条插槽 整块顶栏在同一个吸顶容器里
- ✓ 顶栏的工具条插槽 不给工具条时那一格不渲染

**`src/__tests__/CloseConfirmDialog.test.tsx`**（8 条）

- ✓ 关窗询问弹窗 平时不存在，主进程来请求时才出现
- ✓ 关窗询问弹窗 别的后台请求不会误弹出来
- ✓ 关窗询问弹窗 三个选项分别把语义值回传给主进程
- ✓ 关窗询问弹窗 勾了「记住」就一起传上去
- ✓ 关窗询问弹窗 每次重新打开都从「不记住」开始
- ✓ 关窗询问弹窗 Esc 等于取消：不关窗也不改设置
- ✓ 关窗询问弹窗 点遮罩取消，点弹窗本体不算
- ✓ 关窗询问弹窗 默认焦点落在推荐项上，回车即可确认

**`src/__tests__/HudLayout.test.ts`**（19 条）

- ✓ 浮窗落点 统计和待办贴右下角，留出边距
- ✓ 浮窗落点 录音条水平居中、靠屏幕下方，不挡住手上的活
- ✓ 浮窗落点 工作区比录音条还矮时顶到上沿，不会跑出画面
- ✓ 浮窗落点 工作区有上偏移时（比如任务栏在顶部）也贴的是工作区下沿
- ✓ 浮窗落点 按工作区算，不会压在任务栏上
- ✓ 浮窗落点 副屏有偏移时也落在那块屏幕上
- ✓ 浮窗落点 屏幕比浮窗还窄时收缩到屏幕内，不会跑到画面外
- ✓ 浮窗落点 三种浮窗各有自己的尺寸
- ✓ 统计环 四项都算出来，比例按各自的参考基数归一
- ✓ 统计环 超过基数就填满，不会画出转两圈的环
- ✓ 统计环 异常数值当作 0，不让 NaN 画到 svg 上
- ✓ 统计环 dasharray 的两段加起来正好是周长
- ✓ 统计环 大数字压缩，环里塞得下
- ✓ 待办浮窗的筛选 只留今天和明天
- ✓ 待办浮窗的筛选 已完成的不占位置
- ✓ 待办浮窗的筛选 重复待办展开出的同名同日记录只留一条
- ✓ 待办浮窗的筛选 跨月也能算对明天
- ✓ 待办浮窗的筛选 月末当天也能取到明天那组
- ✓ 待办浮窗的筛选 toDateKey 按本地时区补零

**`src/__tests__/HudWindows.test.tsx`**（21 条）

- ✓ 统计浮窗 四个环各显示一项数据
- ✓ 统计浮窗 看完自动淡出并关窗
- ✓ 统计浮窗 取数失败时给一句话，而不是空白窗
- ✓ 待办浮窗 只列今天和明天：逾期的、更远的、已完成的都不占位置
- ✓ 待办浮窗 今天排在明天前面
- ✓ 待办浮窗 浮窗被再次呼出时重新取数，不会显示上一次的旧列表
- ✓ 待办浮窗 点一条就把主界面调出来，浮窗收起
- ✓ 录音浮窗 只有取消、波纹、完成三件，不显示时长和文字
- ✓ 录音浮窗 录音出错时波纹转红，并给读屏软件一句话
- ✓ 录音浮窗 勾＝完成：请求主进程收尾并走转录流程
- ✓ 录音浮窗 叉＝取消：丢掉这段，不走转录
- ✓ 录音浮窗 取消在左、完成在右
- ✓ 录音浮窗 不自动关闭——录音期间必须一直看得见
- ✓ 统计环的边界情况 数值为 0 时不画圆头小点，否则看着像「有一点点」
- ✓ 录音条的结构 内层那一行不能和外层窗口壳同名
- ✓ 待办浮窗的快捷操作 勾掉一条：立刻从列表消失，并写回数据库
- ✓ 待办浮窗的快捷操作 置顶一条：状态写回数据库，并排到本组最前
- ✓ 待办浮窗的快捷操作 再点一次取消置顶
- ✓ 待办浮窗的快捷操作 点标题仍然是打开主界面，不会误触发这两个操作
- ✓ 浮窗的自动消失 鼠标停在上面就不倒计时
- ✓ 浮窗的自动消失 鼠标移开之后重新从头计时

**`src/__tests__/markdownAst.test.ts`**（27 条）

- ✓ 行内标记 把 **文本** 解析为加粗，这是模型最常输出的标记
- ✓ 行内标记 支持 __加粗__ 与 *斜体* / _斜体_
- ✓ 行内标记 ***三星号*** 同时加粗和倾斜
- ✓ 行内标记 支持删除线和行内代码
- ✓ 行内标记 行内代码里的星号不再当成标记
- ✓ 行内标记 反斜杠转义的星号原样显示
- ✓ 行内标记 单独的星号不会被吃掉
- ✓ 行内标记 未闭合的标记退化为纯文本，不吞掉后面的内容
- ✓ 行内标记 词中间的下划线不当成斜体（snake_case）
- ✓ 行内标记 解析链接，并把标题部分丢掉
- ✓ 行内标记 危险协议的链接降级为纯文本，不生成可点击元素
- ✓ 行内标记 嵌套标记按层级解析
- ✓ 行内标记 段落内的换行保留为软换行
- ✓ 块级结构 解析各级标题
- ✓ 块级结构 解析无序列表，星号列表不会被误判成斜体
- ✓ 块级结构 解析有序列表并保留起始序号
- ✓ 块级结构 解析任务列表的勾选态
- ✓ 块级结构 解析嵌套列表
- ✓ 块级结构 解析围栏代码块并保留语言与原始缩进
- ✓ 块级结构 未闭合的代码块也能渲染（流式输出被截断时常见）
- ✓ 块级结构 代码块内部的 # 和 - 不被当成标题或列表
- ✓ 块级结构 解析引用块
- ✓ 块级结构 解析分隔线，且不与列表符号混淆
- ✓ 块级结构 解析表格与列对齐
- ✓ 块级结构 空白输入产出空数组，渲染端据此显示占位内容
- ✓ 块级结构 纯口语转写原样成段，不会凭空多出标记
- ✓ 块级结构 混合文档保持块顺序

**`src/__tests__/MarkdownText.test.tsx`**（9 条）

- ✓ MarkdownText 渲染 把 **文本** 渲染成真正的加粗元素，而不是显示星号
- ✓ MarkdownText 渲染 渲染列表、标题和代码块
- ✓ MarkdownText 渲染 渲染表格
- ✓ MarkdownText 渲染 链接以 _blank 打开，交给主进程转到系统浏览器
- ✓ MarkdownText 渲染 内容里的 HTML 只当字面量显示，不会真的建元素
- ✓ MarkdownText 渲染 script 标签同样不会被执行或建元素
- ✓ MarkdownText 渲染 伪协议（javascript 等）链接不会渲染成可点击链接
- ✓ MarkdownText 渲染 内容为空时显示传入的占位内容
- ✓ MarkdownText 渲染 纯文本转写原样显示，不引入多余元素

**`src/__tests__/NoteInsightsPanel.test.tsx`**（2 条）

- ✓ NoteInsightsPanel scenario templates shows built-in and custom templates together and sends the custom identity
- ✓ NoteInsightsPanel scenario templates opens template management as a dialog on the current page

**`src/__tests__/OnboardingRoute.test.ts`**（4 条）

- ✓ 工作空间引导路由 普通步骤直接使用声明的路由，不读取工作空间
- ✓ 工作空间引导路由 有工作空间时打开最近的一个详情页
- ✓ 工作空间引导路由 空工作空间 时返回 null，让引导安全略过详情
- ✓ 工作空间引导路由 读取失败 时返回 null，让引导安全略过详情

**`src/__tests__/OnboardingSteps.test.ts`**（12 条）

- ✓ 引导步骤与文案 每一步的标题、描述、提示都有中英文
- ✓ 引导步骤与文案 id 不重复——它同时是 React key 和进度定位
- ✓ 引导步骤与文案 每一步都写了路由，往回退时才能把页面也带回去
- ✓ 引导步骤与文案 不打光的步骤必须居中，否则卡片会飘在左上角
- ✓ 引导步骤与文案 把 27 个逐控件步骤合并成 15 个主题步骤
- ✓ 引导步骤与文案 要摆实物浮窗的那几步，聚光灯得打在浮窗上
- ✓ 引导步骤与文案 示例待办的文案中英文都在——库是空的新用户看到的就是它
- ✓ 引导步骤与文案 设置页里指到面板的那几步，必须带上 ?section= 把那一栏打开
- ✓ 引导步骤与文案 后台常驻和快捷键合并指向同一个设置内容区
- ✓ 引导步骤与文案 工作空间首页总会讲，详情步骤只在有工作空间时进入
- ✓ 引导步骤与文案 要跑真实联动的那一步，卡片得钉在角上
- ✓ 引导步骤与文案 同一页的步骤是连着走的，不来回跳页

**`src/__tests__/RecordingReviewDialog.test.tsx`**（2 条）

- ✓ 录音复核弹窗的 Structured Note Summary 直接展示 Structured Note 草稿里的 Summary
- ✓ 录音复核弹窗的 Structured Note Summary Structured Note 尚未完成时不能提前保存

**`src/__tests__/SettingsTourAnchors.test.tsx`**（2 条）

- ✓ 设置面板上的引导锚点 后台面板上下两块被同一个合并步骤覆盖
- ✓ 设置面板上的引导锚点 设置总览一步同时覆盖导航和智能助理面板

**`src/__tests__/ShortcutRecorder.test.tsx`**（7 条）

- ✓ 快捷键录制 平时显示当前组合的可读写法
- ✓ 快捷键录制 点一下进入录制态，按下组合就报上去
- ✓ 快捷键录制 只按修饰键时继续等，不会误提交
- ✓ 快捷键录制 Esc 取消录制，原来的组合不变
- ✓ 快捷键录制 Backspace 解绑
- ✓ 快捷键录制 没绑时显示「未设置」，也不显示解绑按钮
- ✓ 快捷键录制 被占用时把状态喊出来给读屏软件

**`src/__tests__/TourClickDemo.test.tsx`**（7 条）

- ✓ 引导里的双击演示 落点和容器都在，才画出指针、水波和详情面板
- ✓ 引导里的双击演示 指针从旁边摸过来，不是凭空贴在卡片上
- ✓ 引导里的双击演示 面板贴着容器右边缘，宽度跟真的那一栏一样夹在 250–330 之间
- ✓ 引导里的双击演示 窗口很窄时面板也不会缩得没法看
- ✓ 引导里的双击演示 容器不在页面上就整个不画
- ✓ 引导里的双击演示 落点找不到就退回这一步打光的那个元素
- ✓ 引导里的双击演示 演示指的那个东西，双击它真的会打开详情

**`src/__tests__/TourDragDemo.test.tsx`**（6 条）

- ✓ 引导里的拖拽演示 起点终点都在，才画出飞行的卡片和落点
- ✓ 引导里的拖拽演示 终点不在页面上就整个不画
- ✓ 引导里的拖拽演示 起点找不到就退回这一步打光的那个元素
- ✓ 引导里的拖拽演示 笔记栏很窄时，卡片也不许飞出屏幕左边
- ✓ 引导里的拖拽演示 那一步确实配了拖拽演示，指的是笔记卡片和对话区
- ✓ 引导里的拖拽演示 起点那个选择器，在笔记库里认得出一张真能拖的卡片

**`src/__tests__/TourHoverDemo.test.tsx`**（8 条）

- ✓ 引导里的日历联动演示 指针走到那一天，真的把弹窗打开了
- ✓ 引导里的日历联动演示 接着停到弹窗里的待办上，报出它所属的笔记——右边就是靠这个滚过去的
- ✓ 引导里的日历联动演示 一轮走完会收手重来，不会停在最后一条上不动
- ✓ 引导里的日历联动演示 翻到下一步时必须松手，否则弹窗会一直挂在页面上
- ✓ 引导里的日历联动演示 那天没待办就不硬演，直接进入下一轮
- ✓ 引导里的反向联动演示 停在日期药丸上，把那条笔记的日期报给日历——日历就是靠这个闪的
- ✓ 引导里的反向联动演示 接着走下一行，报的是另一条笔记的日期
- ✓ 引导里的反向联动演示 翻到下一步时松手，日历上的闪烁得停下来

**`src/__tests__/TourHudStage.test.tsx`**（9 条）

- ✓ 引导里的实物浮窗 引导用的选择器能找到它——找不到就只剩一张飘着的卡片
- ✓ 引导里的实物浮窗 stats：摆的是真浮窗的卡片，尺寸也跟真窗口一样
- ✓ 引导里的实物浮窗 todos：摆的是真浮窗的卡片，尺寸也跟真窗口一样
- ✓ 引导里的实物浮窗 record：摆的是真浮窗的卡片，尺寸也跟真窗口一样
- ✓ 引导里的实物浮窗 统计环显示的是用户自己的数据，不是示例
- ✓ 引导里的实物浮窗 待办列的是今天和明天的真待办
- ✓ 引导里的实物浮窗 库里还是空的时候退回示例，而不是给新用户看一句「没有待办」
- ✓ 引导里的实物浮窗 演示归演示：点了不会真勾掉待办，也不会真去停录音
- ✓ 引导里的实物浮窗 演示浮窗不碰 is-hud —— 那个类会把整个主界面刷成透明

**`src/renderer/pages/ModelManager/components/ModelSelect.test.tsx`**（2 条）

- ✓ ModelSelect concurrent operations disables only the model already downloading
- ✓ ModelSelect concurrent operations shows progress for the matching model row

**`src/renderer/pages/ModelManager/useModelManager.test.ts`**（1 条）

- ✓ useModelManager concurrent downloads runs different models concurrently, deduplicates the same model, and tracks progress by id

**`src/renderer/pages/Settings/components/HardwareSettingsPanel.test.tsx`**（2 条）

- ✓ HardwareSettingsPanel shows hardware-matched STT and LLM recommendations
- ✓ HardwareSettingsPanel invalidates the hardware cache before recalculating recommendations

### 主进程与系统

**`src/__tests__/AudioUploadProgress.test.ts`**（1 条）

- ✓ audio upload progress publishes byte progress, then transcribes the managed copy

**`src/__tests__/BackgroundRequests.test.tsx`**（5 条）

- ✓ 托盘 / 快捷键请求的落地 navigate 请求直接跳页
- ✓ 托盘 / 快捷键请求的落地 开始录音先跳到工作台——录音引擎只在那个页面里
- ✓ 托盘 / 快捷键请求的落地 连按两次带的时间戳不同，第二次才会再次触发
- ✓ 托盘 / 快捷键请求的落地 停止 / 取消不跳页：能录音就说明工作台已经挂着了
- ✓ 托盘 / 快捷键请求的落地 不认识的消息一律忽略

**`src/__tests__/BackgroundSettingsSchema.test.ts`**（6 条）

- ✓ 后台设置的读写 老配置里没有 background 时补上默认值，而不是判定整份设置无效
- ✓ 后台设置的读写 保留用户存下的合法配置
- ✓ 后台设置的读写 null 表示用户特意解绑，不能被默认值盖回去
- ✓ 后台设置的读写 非法的快捷键字符串当作未绑定，不让整份设置作废
- ✓ 后台设置的读写 无效的关窗行为回落到默认
- ✓ 后台设置的读写 保存后能原样读回来

**`src/main/AI-module/__tests__/ActiveModelStateStore.test.ts`**（5 条）

- ✓ ActiveModelStateStore.resolveActiveModelId 没人选过时自动选中第一个已下载的模型并落盘
- ✓ ActiveModelStateStore.resolveActiveModelId 已保存的选择仍然可用时原样沿用
- ✓ ActiveModelStateStore.resolveActiveModelId 已保存的模型被删掉后改选其余已下载的
- ✓ ActiveModelStateStore.resolveActiveModelId 列表为空时保持原选择不变
- ✓ ActiveModelStateStore.resolveActiveModelId 从来没选过且没有已下载模型时返回 null，且不写文件

### 其他

**`src/__tests__/HeaderMenuPosition.test.ts`**（6 条）

- ✓ 表头下拉的落点 默认挂在按钮正下方，留一点缝
- ✓ 表头下拉的落点 下方放不下就翻到按钮上方
- ✓ 表头下拉的落点 窗口太矮时贴上边缘，至少让前几项看得见
- ✓ 表头下拉的落点 靠右的按钮不让菜单探出右边缘
- ✓ 表头下拉的落点 菜单至少和按钮一样宽
- ✓ 表头下拉的落点 永远不会算出负坐标

**`src/__tests__/NoteCategory.test.ts`**（8 条）

- ✓ parseCategory 接受模型只吐一个词的理想输出
- ✓ parseCategory 容忍模型加的前后缀
- ✓ parseCategory 输出里出现多个分类词时不猜，交回未分类
- ✓ parseCategory 完全不着边的输出返回 null
- ✓ buildCategoryPrompt 长转录只送开头一段，避免拖慢一次纯分类的调用
- ✓ DashboardCategory.resolveKey 直接认模型落库的 key
- ✓ DashboardCategory.resolveKey 旧数据里的中文分类并到新 key，简繁都认
- ✓ DashboardCategory.resolveKey 空值和不认识的值都退回未分类

**`src/__tests__/NoteListFlash.test.tsx`**（10 条）

- ✓ 日历日期联动笔记列表 只闪烁当天有待办的那条笔记
- ✓ 日历日期联动笔记列表 没有悬停日期时谁都不闪
- ✓ 日历日期联动笔记列表 日期上没有任何待办时也不闪
- ✓ 命中的笔记不在可视范围内时的边缘提示 行被滚到表头上方时，顶部边缘发光
- ✓ 命中的笔记不在可视范围内时的边缘提示 行在下方看不见时，底部边缘发光
- ✓ 命中的笔记不在可视范围内时的边缘提示 行本来就看得见时，两条边都不发光
- ✓ 命中的笔记不在可视范围内时的边缘提示 被表头挡住一半仍算看得见，不必提示
- ✓ 弹窗里悬停单条待办 收窄成只闪这一条，同一天的其它笔记不再跟着闪
- ✓ 弹窗里悬停单条待办 把那一行滚进视野，并且不出上下边缘提示线
- ✓ 弹窗里悬停单条待办 要闪的行本来就看得见时，不做多余的滚动

**`src/__tests__/NoteListHeaderControls.test.tsx`**（18 条）

- ✓ 表头里的搜索 平时不占地方，点了列名才出输入框
- ✓ 表头里的搜索 输入的内容报给上层做筛选
- ✓ 表头里的搜索 按 Esc 收起输入框，已输入的词仍挂在列名旁边
- ✓ 表头里的类型筛选 点类型列出下拉，选中的项报给上层
- ✓ 表头里的类型筛选 点别处会关掉下拉
- ✓ 清除筛选 没有筛选时不出现
- ✓ 清除筛选 一键把搜索词和类型都恢复成默认
- ✓ 更聪明的搜索交互 按 / 直接唤起搜索，不用先去点列名
- ✓ 更聪明的搜索交互 Ctrl+F 也能唤起
- ✓ 更聪明的搜索交互 已经在输入框里打字时，/ 不被抢走
- ✓ 更聪明的搜索交互 点到别处就收起搜索框（叉号已经去掉了）
- ✓ 更聪明的搜索交互 命中的词在行里高亮出来
- ✓ 表头的视觉重量 列名触发器跳过全局按钮外观，不然表头看着像塞了几个按钮
- ✓ 表头的视觉重量 下拉项和清除按钮同样不套全局按钮外观
- ✓ 表头的视觉重量 列名是可下划线的文字节点，图标只是旁边的弱提示
- ✓ 类型下拉不被表格容器裁掉 用 fixed 定位并带上算好的坐标——absolute 会被滚动容器裁没
- ✓ 类型下拉不被表格容器裁掉 表格滚动时收起，免得菜单悬在半空
- ✓ 类型下拉不被表格容器裁掉 再点一次列名收起下拉

**`src/__tests__/useRoutedNoteChat.test.ts`**（5 条）

- ✓ 带着笔记跳进对话工作台 开新对话、挂上笔记、自动问出第一句
- ✓ 带着笔记跳进对话工作台 问完就清掉路由 state，重渲染不会再问一遍
- ✓ 带着笔记跳进对话工作台 笔记库还没加载完就先等着，加载完再问
- ✓ 带着笔记跳进对话工作台 没有跳转请求时什么都不做
- ✓ 带着笔记跳进对话工作台 笔记已经不在了：清掉请求，但不问一个空上下文
