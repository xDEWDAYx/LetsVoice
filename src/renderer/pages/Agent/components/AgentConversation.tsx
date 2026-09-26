import { useTranslation } from 'react-i18next';
import { AgentPageMessage } from '../AgentPageTypes';
import MarkdownText from '../../../components/Markdown/MarkdownText';

type Props = { history: AgentPageMessage[]; error: string };

export default function AgentConversation({ history, error }: Props) {
  const { t } = useTranslation();
  return (
    <section className="agent-conversation">
      <header>
        <h2>{t('agent.conversation.title')}</h2>
      </header>
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      {history.length === 0 ? (
        <div className="agent-conversation-empty">
          <strong>{t('agent.conversation.empty')}</strong>
        </div>
      ) : (
        <div className="agent-message-list">
          {history.map((message) => (
            <article className={message.role} key={message.id}>
              <span>
                {message.role === 'user'
                  ? t('agent.conversation.roleUser')
                  : t('agent.conversation.roleAssistant')}
              </span>
              {/* 用户指令保持原样，模型答复走富文本。 */}
              {message.role === 'user' ? (
                <p>{message.content}</p>
              ) : (
                <MarkdownText content={message.content} />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
