import { useTranslation } from 'react-i18next';
import AgentConversation from './components/AgentConversation';
import AgentTaskPanel from './components/AgentTaskPanel';
import AgentTimeline from './components/AgentTimeline';
import useAgentPage from './useAgentPage';
import './AgentPage.css';

export default function AgentPage() {
  const { t } = useTranslation();
  const agent = useAgentPage();

  return (
    <section className="agent-page">
      <header className="agent-page-header">
        <div>
          <h1>{t('agent.page.title')}</h1>
          <p>{t('agent.page.desc')}</p>
        </div>
      </header>
      <div className="agent-page-grid">
        <aside>
          <AgentTaskPanel
            onCancel={agent.cancel}
            onStart={agent.start}
            onWorkspaceChange={agent.selectWorkspace}
            running={agent.page.running}
            workspaceId={agent.workspaceId}
            workspaces={agent.workspaces}
          />
          <AgentTimeline
            running={agent.page.running}
            status={agent.page.status}
            steps={agent.page.steps}
          />
        </aside>
        <AgentConversation
          error={agent.page.error}
          history={agent.page.history}
        />
      </div>
    </section>
  );
}
