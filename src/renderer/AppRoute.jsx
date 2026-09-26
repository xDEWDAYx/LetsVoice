import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import { ModelManagerPage } from './pages/ModelManager/ModelManagerPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import WorkspacePage from './pages/Workspace/WorkspacePage';
import WorkspaceHomePage from './pages/Workspace/WorkspaceHomePage';
import SettingsPage from './pages/Settings/SettingsPage';
import StudioPage from './pages/Studio/StudioPage';
import AgentPage from './pages/Agent/AgentPage';
import { RoutePath } from './router/RouteManager';
import StatsHud from './hud/StatsHud';
import TodoHud from './hud/TodoHud';
import RecordHud from './hud/RecordHud';

export default function AppRoute() {
  return (
    <Routes>
      {/* 轻量浮窗：独立窗口加载 #/hud/xxx，不进主布局 */}
      <Route path="/hud/stats" element={<StatsHud />} />
      <Route path="/hud/todos" element={<TodoHud />} />
      <Route path="/hud/record" element={<RecordHud />} />

      <Route element={<MainLayout />}>
        {/* 首�??�為實�?轉�? (StudioPage) */}
        <Route path="/" element={<StudioPage />} />

        {/* ?�容?�本??/Transcription，若?�人跳�??��?就正常顯�? */}
        <Route path="/Transcription" element={<StudioPage />} />

        {/* ?�容?��? /AIChat 路由 */}
        <Route path="/AIChat" element={<Navigate to="/" replace />} />

        <Route path="/Agent" element={<AgentPage />} />

        <Route
          path="/Workspace"
          element={<WorkspaceHomePage directory limit={100} />}
        />
        <Route path="/Workspace/:workspaceId" element={<WorkspacePage />} />
        <Route path="/ModelManagement" element={<ModelManagerPage />} />
        <Route path="/Settings" element={<SettingsPage />} />
        <Route path={RoutePath.Dashboard} element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}
