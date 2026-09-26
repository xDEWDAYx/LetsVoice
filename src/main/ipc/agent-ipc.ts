import { ipcMain } from 'electron';
import AgentRunManager from '../agent/AgentRunManager';
import { AgentEvent } from '../agent/AgentTypes';

const manager = new AgentRunManager();

ipcMain.handle('Agent:start', (event, request: unknown) => {
  const { sender } = event;
  let ownedRunId = '';
  const cancelOwnedRun = () => manager.cancel(ownedRunId);
  const started = manager.start(request, (agentEvent: AgentEvent) => {
    if (!sender.isDestroyed()) sender.send('Agent:event', agentEvent);
    if (agentEvent.type !== 'step') {
      sender.removeListener('destroyed', cancelOwnedRun);
    }
  });
  ownedRunId = started.runId;
  sender.once('destroyed', cancelOwnedRun);
  return started;
});

ipcMain.handle('Agent:cancel', (_event, runId: unknown) =>
  manager.cancel(runId),
);
