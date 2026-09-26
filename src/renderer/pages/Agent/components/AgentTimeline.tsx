import { useTranslation } from 'react-i18next';
import type { AgentStep } from '@shared/types/AgentTypes';
import { AgentPageStep } from '../AgentPageTypes';

type Props = { steps: AgentPageStep[]; status: string; running: boolean };

function describeStep(step: AgentStep, t: (key: string) => string): string {
  if (step.type === 'final') return t('agent.timeline.final');

  // Try to use the pre-defined tool translation, else fallback to raw tool name
  let { tool } = step;
  if (step.tool === 'search_notes') tool = t('agent.timeline.searchNotes');
  else if (step.tool === 'read_note') tool = t('agent.timeline.readNote');

  if (step.type === 'tool_call')
    return `${t('agent.timeline.preparePrefix')}${tool}`;
  return `${step.ok ? t('agent.timeline.completePrefix') : t('agent.timeline.failPrefix')}${tool}`;
}

export default function AgentTimeline({ steps, status, running }: Props) {
  const { t } = useTranslation();
  return (
    <section className="agent-timeline" aria-live="polite">
      <header>
        <div>
          <span>{t('agent.timeline.stepsTitle')}</span>
          <h2>{status}</h2>
        </div>
        <span className={running ? 'is-running' : ''}>
          {running ? t('agent.timeline.running') : t('agent.timeline.ready')}
        </span>
      </header>
      {steps.length === 0 ? (
        <p>{t('agent.timeline.empty')}</p>
      ) : (
        <ol>
          {steps.map((item) => (
            <li key={item.id}>{describeStep(item.step, t)}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
