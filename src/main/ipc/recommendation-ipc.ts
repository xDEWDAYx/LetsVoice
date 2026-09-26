import { ipcMain } from 'electron';
import ModelRecommendationService from '../recommendation/ModelRecommendationService';
import SystemProfileService from '../recommendation/SystemProfileService';
import WorkspaceSuggestionService from '../workspace/WorkspaceSuggestionService';

const workspaceSuggestionService = new WorkspaceSuggestionService();

// IPC 仅转发检测请求；硬件评分和 Workspace 分类规则保留在各自服务中。
ipcMain.handle(
  'Recommendation:getModels',
  (_event, sttModels: unknown, llmModels: unknown) =>
    ModelRecommendationService.recommend(sttModels, llmModels),
);

ipcMain.handle('Recommendation:getWorkspace', () =>
  workspaceSuggestionService.getSuggestion(),
);

// 设置页展示本机硬件，供用户自行判断该选哪档模型。
// forceRefresh 时先清掉显卡探测缓存，「重新检测」按钮才是真的重新检测。
ipcMain.handle(
  'Recommendation:getSystemProfile',
  (_event, forceRefresh: unknown) => {
    if (forceRefresh === true) SystemProfileService.invalidateGpuCache();
    return SystemProfileService.detect();
  },
);
