import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { NoteItem } from '../WorkspaceController';
import TTSPlayButton from '../../../tts/TTSPlayButton';
import MarkdownText from '../../../components/Markdown/MarkdownText';
import CopyButton from '../../../components/CopyButton';

type Props = {
  note: NoteItem;
};

/** 旧版自由 Markdown 模板产出只作为历史记录保留；新生成统一走 Scenario Knowledge。 */
export default function KnowledgeOutputPanel({ note }: Props) {
  const { t } = useTranslation();
  if (note.knowledge_outputs.length === 0) return null;

  return (
    <section className="workspace-knowledge-section">
      <div className="workspace-section-heading">
        <h3>
          <Archive size={16} style={{ marginRight: 6 }} />
          {t('workspace.knowledge.historyTitle', 'Previous Template Outputs')}
        </h3>
      </div>
      <div className="workspace-content-stack">
        {note.knowledge_outputs.map((output) => (
          <div className="workspace-content-item" key={output.id}>
            <small>
              {output.template_name} · {output.content_type}
            </small>
            <MarkdownText content={output.content} />
            <div className="message-actions">
              <TTSPlayButton text={output.content} />
              <CopyButton text={output.content} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
