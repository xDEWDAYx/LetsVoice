// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webUtils,
} from 'electron';
import type { TranscriptionSource } from '@shared/types/TranscriptionTypes';
import type {
  AudioImportProgress,
  AudioImportProgressEvent,
} from '@shared/types/AudioTypes';
import type {
  ScenarioTemplateSelection,
  StructuredNoteDraft,
} from '@shared/types/KnowledgeGenerationTypes';
import type {
  TrashActionTarget,
  TrashListQuery,
} from '@shared/types/TrashTypes';
import type { ModelDownloadProgressEvent } from '@shared/types/ModelManagementTypes';
import { AgentEvent, AgentRunRequest } from './agent/AgentTypes';

export type Channels = 'ipc-example';

let audioImportSequence = 0;

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },

  // speakspace-local
  modelManagement: {
    getModelList(modelType: string) {
      return ipcRenderer.invoke('ModelManagement:getModelList', modelType);
    },

    downloadModel(modelType: string, modelId: string) {
      return ipcRenderer.invoke(
        'ModelManagement:downloadModel',
        modelType,
        modelId,
      );
    },

    onDownloadProgress(
      listener: (progress: ModelDownloadProgressEvent) => void,
    ) {
      const wrapped = (
        _event: IpcRendererEvent,
        progress: ModelDownloadProgressEvent,
      ) => listener(progress);
      ipcRenderer.on('ModelManagement:downloadProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('ModelManagement:downloadProgress', wrapped);
      };
    },

    deleteModel(modelType: string, modelId: string) {
      return ipcRenderer.invoke(
        'ModelManagement:deleteModel',
        modelType,
        modelId,
      );
    },

    activateModel(modelType: string, modelId: string) {
      return ipcRenderer.invoke(
        'ModelManagement:activateModel',
        modelType,
        modelId,
      );
    },
  },

  // 文件选择和路径解析由 preload/main 提供，Renderer 不获得 Node 文件系统权限。
  audio: {
    pickFile() {
      return ipcRenderer.invoke('Audio:pickFile');
    },
    getPathForFile(file: File) {
      return webUtils.getPathForFile(file);
    },
    getDuration(filePath: string) {
      return ipcRenderer.invoke('Audio:getDuration', filePath);
    },
    saveRecording(data: ArrayBuffer, mimeType: string) {
      return ipcRenderer.invoke('Audio:saveRecording', data, mimeType);
    },
    importRecordingFile(
      filePath: string,
      onProgress?: (progress: AudioImportProgress) => void,
    ) {
      audioImportSequence += 1;
      const requestId = `${Date.now()}-${audioImportSequence}`;
      const progressListener = (
        _event: IpcRendererEvent,
        rawProgress: unknown,
      ) => {
        if (typeof rawProgress !== 'object' || rawProgress === null) return;
        const progress = rawProgress as Partial<AudioImportProgressEvent>;
        if (progress.requestId !== requestId) return;
        if (
          typeof progress.transferredBytes !== 'number' ||
          typeof progress.totalBytes !== 'number' ||
          typeof progress.percent !== 'number'
        ) {
          return;
        }
        onProgress?.({
          transferredBytes: progress.transferredBytes,
          totalBytes: progress.totalBytes,
          percent: progress.percent,
        });
      };
      ipcRenderer.on('Audio:importProgress', progressListener);
      return ipcRenderer
        .invoke('Audio:importRecordingFile', filePath, requestId)
        .finally(() => {
          ipcRenderer.removeListener('Audio:importProgress', progressListener);
        });
    },
    discardRecording(relativePath: string) {
      return ipcRenderer.invoke('Audio:discardRecording', relativePath);
    },
  },

  // 单次转写接口先用于功能接线；任务进度、取消和重试由后续 job API 提供。
  transcription: {
    run(source: TranscriptionSource) {
      return ipcRenderer.invoke('Transcription:run', source);
    },
    detectLanguage(source: TranscriptionSource) {
      return ipcRenderer.invoke('Transcription:detectLanguage', source);
    },
    start(source: TranscriptionSource) {
      return ipcRenderer.invoke('Transcription:start', source);
    },
    liveRun(data: ArrayBuffer, mimeType: string) {
      return ipcRenderer.invoke('Transcription:liveRun', data, mimeType);
    },
    get(jobId: string) {
      return ipcRenderer.invoke('Transcription:get', jobId);
    },
    cancel(jobId: string) {
      return ipcRenderer.invoke('Transcription:cancel', jobId);
    },
    retry(jobId: string) {
      return ipcRenderer.invoke('Transcription:retry', jobId);
    },
    onStatus(listener: (job: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, job: unknown) => listener(job);
      ipcRenderer.on('Transcription:status', wrapped);
      return () => {
        ipcRenderer.removeListener('Transcription:status', wrapped);
      };
    },
    onPartial(listener: (payload: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, payload: unknown) =>
        listener(payload);
      ipcRenderer.on('Transcription:partial', wrapped);
      return () => {
        ipcRenderer.removeListener('Transcription:partial', wrapped);
      };
    },
  },

  workflow: {
    getKnowledgeTemplateList() {
      return ipcRenderer.invoke('Workflow:getKnowledgeTemplateList');
    },

    getScenarioTemplateList(language: 'zh' | 'en' = 'en') {
      return ipcRenderer.invoke('Workflow:getScenarioTemplateList', language);
    },

    getKnowledgeTemplateById(id: number) {
      return ipcRenderer.invoke('Workflow:getKnowledgeTemplateById', id);
    },

    createKnowledgeTemplate(
      name: string,
      prompt: string,
      language: 'zh' | 'en' = 'en',
    ) {
      return ipcRenderer.invoke(
        'Workflow:createKnowledgeTemplate',
        name,
        prompt,
        language,
      );
    },

    updateKnowledgeTemplate(
      id: number,
      name: string,
      prompt: string,
      language: 'zh' | 'en' = 'en',
    ) {
      return ipcRenderer.invoke(
        'Workflow:updateKnowledgeTemplate',
        id,
        name,
        prompt,
        language,
      );
    },

    deleteKnowledgeTemplate(id: number) {
      return ipcRenderer.invoke('Workflow:deleteKnowledgeTemplate', id);
    },

    // 操作方法：选择一篇已有笔记和一个模板后调用生成；结果会自动保存。
    getKnowledgeOutputs(noteId: number) {
      return ipcRenderer.invoke('Workflow:getKnowledgeOutputs', noteId);
    },

    generateKnowledgeOutput(noteId: number, templateId: number) {
      return ipcRenderer.invoke(
        'Workflow:generateKnowledgeOutput',
        noteId,
        templateId,
      );
    },
  },

  knowledge: {
    get(noteId: number) {
      return ipcRenderer.invoke('Knowledge:get', noteId);
    },
    generateStructuredNote(noteId: number) {
      return ipcRenderer.invoke('Knowledge:generateStructuredNote', noteId);
    },
    generateStructuredNoteDraft(transcript: string) {
      return ipcRenderer.invoke(
        'Knowledge:generateStructuredNoteDraft',
        transcript,
      );
    },
    generateScenario(
      noteId: number,
      selection: ScenarioTemplateSelection,
      language: 'zh' | 'en' = 'en',
    ) {
      return ipcRenderer.invoke(
        'Knowledge:generateScenario',
        noteId,
        selection,
        language,
      );
    },
    toggleTask(noteId: number, taskId: string, completed: boolean) {
      return ipcRenderer.invoke(
        'Knowledge:toggleTask',
        noteId,
        taskId,
        completed,
      );
    },
  },

  // 通用外观设置通过主进程持久化，renderer 只调用此安全接口。
  settings: {
    get() {
      return ipcRenderer.invoke('Settings:get');
    },
    update(settings: {
      fontSize: 'small' | 'medium' | 'large';
      theme: 'light' | 'dark' | 'system';
    }) {
      return ipcRenderer.invoke('Settings:update', settings);
    },
  },

  // 智能推荐只返回本机硬件摘要和本地分类建议，不执行自动下载或改名。
  recommendation: {
    getModels(sttModels: unknown[], llmModels: unknown[]) {
      return ipcRenderer.invoke(
        'Recommendation:getModels',
        sttModels,
        llmModels,
      );
    },
    getWorkspace() {
      return ipcRenderer.invoke('Recommendation:getWorkspace');
    },
    /**
     * 显卡探测结果在主进程里是缓存的（探测一次要好几秒）。
     * forceRefresh 只给设置页那个「重新检测」按钮用，
     * 普通页面加载一律走缓存。
     */
    getSystemProfile(forceRefresh = false) {
      return ipcRenderer.invoke(
        'Recommendation:getSystemProfile',
        forceRefresh,
      );
    },
  },

  // 运行时状态为只读汇总；下载和删除仍由各模型管理接口单独处理。
  runtime: {
    getStatus() {
      return ipcRenderer.invoke('Runtime:getStatus');
    },
    // 开工前检查：先启动 Ollama 再读状态，避免把「还没启动」误判成「没装」。
    getReadiness() {
      return ipcRenderer.invoke('Runtime:getReadiness');
    },
    installWhisper() {
      return ipcRenderer.invoke('Runtime:installWhisper');
    },
    installOllama() {
      return ipcRenderer.invoke('Runtime:installOllama');
    },
    installTTS() {
      return ipcRenderer.invoke('Runtime:installTTS');
    },
    installFfmpeg() {
      return ipcRenderer.invoke('Runtime:installFfmpeg');
    },
    uninstall(target: string) {
      return ipcRenderer.invoke('Runtime:uninstall', target);
    },
    onInstallProgress(listener: (progress: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on('Runtime:installProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('Runtime:installProgress', wrapped);
      };
    },
    onOllamaInstallProgress(listener: (progress: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on('Runtime:installOllamaProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('Runtime:installOllamaProgress', wrapped);
      };
    },
    onFfmpegInstallProgress(listener: (progress: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on('Runtime:installFfmpegProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('Runtime:installFfmpegProgress', wrapped);
      };
    },
    onTTSInstallProgress(listener: (progress: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on('Runtime:installTTSProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('Runtime:installTTSProgress', wrapped);
      };
    },
  },

  // 本地聊天仅接受角色和文字，主进程会再次校验并使用当前激活模型。
  llm: {
    chat(
      messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }>,
      options: { temperature?: number } = {},
    ) {
      return ipcRenderer.invoke('LLM:chat', messages, options);
    },
  },

  // TTS 在主进程异步合成，Renderer 只接收可播放的 PCM 样本。
  tts: {
    getStatus() {
      return ipcRenderer.invoke('TTS:getStatus');
    },
    synthesize(
      text: string,
      options: { speakerId?: string; speed?: number } = {},
    ) {
      return ipcRenderer.invoke('TTS:synthesize', text, options);
    },
  },

  // 语义索引仅保存于本机 SQLite，Embedding 与搜索均复用本机 Ollama。
  semantic: {
    getStatus() {
      return ipcRenderer.invoke('Semantic:getStatus');
    },
    installModel() {
      return ipcRenderer.invoke('Semantic:installModel');
    },
    search(query: string, workspaceId?: number | null, topK = 5) {
      return ipcRenderer.invoke('Semantic:search', query, workspaceId, topK);
    },
    onInstallProgress(listener: (progress: unknown) => void) {
      const wrapped = (_event: IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on('Semantic:installProgress', wrapped);
      return () => {
        ipcRenderer.removeListener('Semantic:installProgress', wrapped);
      };
    },
  },

  // Agent 只能调用主进程注册的本地工具；步骤事件不包含模型私有推理。
  agent: {
    start(request: AgentRunRequest) {
      return ipcRenderer.invoke('Agent:start', request);
    },
    cancel(runId: string) {
      return ipcRenderer.invoke('Agent:cancel', runId);
    },
    onEvent(listener: (event: AgentEvent) => void) {
      const wrapped = (_event: IpcRendererEvent, agentEvent: AgentEvent) =>
        listener(agentEvent);
      ipcRenderer.on('Agent:event', wrapped);
      return () => {
        ipcRenderer.removeListener('Agent:event', wrapped);
      };
    },
  },

  // Ask AI 通过主进程读取笔记和保存会话，Renderer 不直接接触 SQLite。
  askAI: {
    listNotes(workspaceId?: number | null) {
      return ipcRenderer.invoke('AskAI:listNotes', workspaceId);
    },
    getNoteDetail(noteId: number) {
      return ipcRenderer.invoke('AskAI:getNoteDetail', noteId);
    },
    createNote(request: {
      workspaceId?: number | null;
      name?: string | null;
      transcript: string;
    }) {
      return ipcRenderer.invoke('AskAI:createNote', request);
    },
    listConversations() {
      return ipcRenderer.invoke('AskAI:listConversations');
    },
    getConversation(conversationId: number) {
      return ipcRenderer.invoke('AskAI:getConversation', conversationId);
    },
    ask(request: {
      conversationId?: number | null;
      workspaceId?: number | null;
      noteId?: number | null;
      noteIds?: number[] | null;
      question: string;
      scope: 'note' | 'workspace' | 'multi-note';
    }) {
      return ipcRenderer.invoke('AskAI:ask', request);
    },
    // 智能体模式：回答已由 Agent 生成，这里只把这一轮记进会话。
    recordTurn(request: {
      conversationId?: number | null;
      question: string;
      answer: string;
      noteIds?: number[] | null;
    }) {
      return ipcRenderer.invoke('AskAI:recordTurn', request);
    },
    autoSegmentNote(noteId: number) {
      return ipcRenderer.invoke('AskAI:autoSegmentNote', noteId);
    },
  },

  // 托盘 / 全局快捷键。设置页保存后调 apply()，主进程据此重装。
  background: {
    apply() {
      return ipcRenderer.invoke('Background:apply');
    },
    getStatus() {
      return ipcRenderer.invoke('Background:getStatus');
    },
    showWindow() {
      return ipcRenderer.invoke('Background:showWindow');
    },
    /** 主进程转发过来的动作请求（跳转页面、开始/停止录音）。 */
    onRequest(listener: (request: unknown) => void) {
      const handler = (_event: unknown, request: unknown) => listener(request);
      ipcRenderer.on('Background:request', handler);
      return () => ipcRenderer.removeListener('Background:request', handler);
    },
    /** 关窗询问弹窗的选择：tray / quit / cancel。 */
    resolveClose(choice: string, remember: boolean) {
      return ipcRenderer.invoke('Background:resolveClose', choice, remember);
    },
    /** 主窗口上报录音状态，供录音浮窗显示。 */
    reportRecording(state: unknown) {
      return ipcRenderer.invoke('Hud:reportRecording', state);
    },
  },

  // 右下角 / 屏幕中央的轻量浮窗
  hud: {
    close(kind: string) {
      return ipcRenderer.invoke('Hud:close', kind);
    },
    stopRecording() {
      return ipcRenderer.invoke('Hud:stopRecording');
    },
    cancelRecording() {
      return ipcRenderer.invoke('Hud:cancelRecording');
    },
    /** 浮窗被（重新）显示：重新取数、重置自动淡出。 */
    onShown(listener: () => void) {
      const handler = () => listener();
      ipcRenderer.on('Hud:shown', handler);
      return () => ipcRenderer.removeListener('Hud:shown', handler);
    },
    onRecordingState(listener: (state: unknown) => void) {
      const handler = (_event: unknown, state: unknown) => listener(state);
      ipcRenderer.on('Hud:recording', handler);
      return () => ipcRenderer.removeListener('Hud:recording', handler);
    },
  },

  dashboard: {
    getDashboardOverview() {
      return ipcRenderer.invoke('Dashboard:getDashboardOverview');
    },
    extractTodosForNote(noteId: number) {
      return ipcRenderer.invoke('Dashboard:extractTodosForNote', noteId);
    },
    classifyPendingNotes() {
      return ipcRenderer.invoke('Dashboard:classifyPendingNotes');
    },
    setTodoCompleted(todoId: number, isCompleted: boolean) {
      return ipcRenderer.invoke(
        'Dashboard:setTodoCompleted',
        todoId,
        isCompleted,
      );
    },
    setTodoPinned(todoId: number, isPinned: boolean) {
      return ipcRenderer.invoke('Dashboard:setTodoPinned', todoId, isPinned);
    },
    toggleNotePin(noteId: number, isPinned: boolean) {
      return ipcRenderer.invoke('Dashboard:toggleNotePin', noteId, isPinned);
    },
  },

  // 操作方法：通过 window.electron.workspace 调用，数据库访问保留在主进程。
  // Usage: call through window.electron.workspace; database access stays in main.
  workspace: {
    getList(limit = 6) {
      return ipcRenderer.invoke('Workspace:getList', limit);
    },
    create(name: string) {
      return ipcRenderer.invoke('Workspace:create', name);
    },
    open(workspaceId: number) {
      return ipcRenderer.invoke('Workspace:open', workspaceId);
    },
    getNotes(workspaceId: number) {
      return ipcRenderer.invoke('Workspace:getNotes', workspaceId);
    },
    saveTranscriptionNote(request: {
      workspaceId: number;
      name?: string | null;
      transcript: string;
      summaries?: string[];
      audioRelativePath?: string | null;
      structuredNoteDraft?: StructuredNoteDraft | null;
    }) {
      return ipcRenderer.invoke('Workspace:saveTranscriptionNote', request);
    },
    getNoteAudio(workspaceId: number, noteId: number) {
      return ipcRenderer.invoke('Workspace:getNoteAudio', workspaceId, noteId);
    },
    rename(id: number, name: string) {
      return ipcRenderer.invoke('Workspace:rename', id, name);
    },
    delete(id: number) {
      return ipcRenderer.invoke('Workspace:delete', id);
    },
    deleteNote(id: number) {
      return ipcRenderer.invoke('Workspace:deleteNote', id);
    },
  },

  trash: {
    list(query: TrashListQuery = {}) {
      return ipcRenderer.invoke('Trash:list', query);
    },
    count() {
      return ipcRenderer.invoke('Trash:count');
    },
    moveNote(id: number) {
      return ipcRenderer.invoke('Trash:moveNote', id);
    },
    moveConversation(id: number) {
      return ipcRenderer.invoke('Trash:moveConversation', id);
    },
    moveTemplate(id: number) {
      return ipcRenderer.invoke('Trash:moveTemplate', id);
    },
    moveWorkspace(id: number) {
      return ipcRenderer.invoke('Trash:moveWorkspace', id);
    },
    restore(target: TrashActionTarget) {
      return ipcRenderer.invoke('Trash:restore', target);
    },
    permanentlyDelete(target: TrashActionTarget) {
      return ipcRenderer.invoke('Trash:permanentlyDelete', target);
    },
  },

  // Export functionality
  export: {
    note(request: {
      workspaceId: number;
      noteId: number;
      format: 'word' | 'pdf';
    }) {
      return ipcRenderer.invoke('Export:note', request);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
