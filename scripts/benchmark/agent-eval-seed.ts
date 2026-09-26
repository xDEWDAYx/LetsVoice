/** 一键重建 Agent 评测种子库。 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { rebuildAgentEvalFixture } from './agent-eval-fixture';

const { database, manifest } = rebuildAgentEvalFixture();
database.close();
process.stdout.write(
  `已重建 Agent 评测库: ${manifest.database_path}\n` +
    `笔记 ${manifest.note_count} · 任务 ${manifest.task_count} · hash ${manifest.dataset_hash.slice(0, 16)}\n`,
);
