import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceItem } from '../../Workspace/WorkspaceController';

type Props = {
  workspaces: WorkspaceItem[];
  workspaceId: number | null;
  running: boolean;
  onWorkspaceChange(workspaceId: number): void;
  onStart(instruction: string): Promise<void>;
  onCancel(): Promise<void>;
};

export default function AgentTaskPanel({
  workspaces,
  workspaceId,
  running,
  onWorkspaceChange,
  onStart,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim() || workspaceId === null || running) return;
    const task = instruction;
    setInstruction('');
    await onStart(task);
  };

  return (
    <form className="agent-task-panel" onSubmit={submit}>
      <label htmlFor="agent-workspace">
        <span>{t('agent.taskPanel.workspaceLabel')}</span>
        <select
          disabled={running || workspaces.length === 0}
          id="agent-workspace"
          onChange={(event) => onWorkspaceChange(Number(event.target.value))}
          value={workspaceId ?? ''}
        >
          {workspaces.length === 0 && (
            <option value="">{t('agent.taskPanel.noWorkspaces')}</option>
          )}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.note_count}
              {t('agent.taskPanel.noteCountSuffix')}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="agent-instruction">
        <span>{t('agent.taskPanel.taskLabel')}</span>
        <textarea
          disabled={running}
          id="agent-instruction"
          maxLength={4000}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t('agent.taskPanel.taskPlaceholder')}
          rows={5}
          value={instruction}
        />
      </label>
      <div>
        {running ? (
          <button className="secondary" onClick={onCancel} type="button">
            {t('agent.taskPanel.cancelBtn')}
          </button>
        ) : (
          <button
            disabled={!instruction.trim() || workspaceId === null}
            type="submit"
          >
            {t('agent.taskPanel.startBtn')}
          </button>
        )}
      </div>
    </form>
  );
}
