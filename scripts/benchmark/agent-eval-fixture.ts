/** Agent 评测专用数据库：只写 benchmarkRoot()/agent-eval，不接触应用 userData。 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  AGENT_EVAL_NOTES,
  AGENT_EVAL_TASKS,
  AGENT_EVAL_WORKSPACES,
} from './agent-eval-corpus';
import { benchmarkResultsRoot, benchmarkRoot } from './tts-paths';

export type AgentEvalFixtureManifest = {
  schema_version: 1;
  dataset_hash: string;
  database_path: string;
  note_count: number;
  task_count: number;
  workspace_ids: Record<string, number>;
  note_ids: Record<string, number>;
  note_keys_by_id: Record<string, string>;
  language_counts: Record<string, number>;
  length_counts: Record<string, number>;
};

export function agentEvalFixturePath(): string {
  return path.join(benchmarkRoot(), 'agent-eval', 'agent-eval-v1.db');
}

function removeOldFixture(databasePath: string): void {
  const fixtureDir = path.resolve(benchmarkRoot(), 'agent-eval');
  const resolved = path.resolve(databasePath);
  if (
    path.dirname(resolved) !== fixtureDir ||
    path.basename(resolved) !== 'agent-eval-v1.db'
  ) {
    throw new Error(`拒绝清理非评测数据库路径: ${resolved}`);
  }
  [resolved, `${resolved}-wal`, `${resolved}-shm`].forEach((candidate) => {
    if (fs.existsSync(candidate)) fs.rmSync(candidate);
  });
}

function createSchema(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last_opened_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      audio_relative_path TEXT,
      transcript TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      type_category TEXT,
      pinned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE subnotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE knowledge_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE knowledge_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE structured_notes (
      note_id INTEGER PRIMARY KEY,
      scenario TEXT,
      payload TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE scenario_knowledge (
      note_id INTEGER PRIMARY KEY,
      scenario TEXT NOT NULL,
      payload TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE note_embeddings (
      note_id INTEGER NOT NULL,
      model_name TEXT NOT NULL,
      embedding TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(note_id, model_name),
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      date_string TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_contexts (
      conversation_id INTEGER NOT NULL,
      note_id INTEGER NOT NULL,
      PRIMARY KEY(conversation_id, note_id)
    );
  `);
}

export function rebuildAgentEvalFixture(): {
  database: Database.Database;
  manifest: AgentEvalFixtureManifest;
} {
  const databasePath = agentEvalFixturePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  removeOldFixture(databasePath);
  const database = new Database(databasePath);
  createSchema(database);

  const workspaceIds: Record<string, number> = {};
  const noteIds: Record<string, number> = {};
  const fixedStart = Date.parse('2026-08-01T08:00:00.000Z');
  const insertWorkspace = database.prepare(
    'INSERT INTO workspaces (name, created_at, updated_at) VALUES (?, ?, ?)',
  );
  AGENT_EVAL_WORKSPACES.forEach((workspace, index) => {
    const timestamp = new Date(fixedStart + index * 60_000).toISOString();
    workspaceIds[workspace.key] = Number(
      insertWorkspace.run(workspace.name, timestamp, timestamp).lastInsertRowid,
    );
  });

  const insertNote = database.prepare(`
    INSERT INTO notes (
      workspace_id, name, audio_relative_path, transcript, is_pinned,
      type_category, pinned_at, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 0, NULL, NULL, ?, ?)
  `);
  const insertSubnote = database.prepare(
    'INSERT INTO subnotes (note_id, content_type, content, created_at) VALUES (?, ?, ?, ?)',
  );
  database.transaction(() => {
    AGENT_EVAL_NOTES.forEach((note, index) => {
      const timestamp = new Date(
        fixedStart + (index + 10) * 60_000,
      ).toISOString();
      const noteId = Number(
        insertNote.run(
          workspaceIds[note.workspaceKey],
          note.title,
          note.transcript,
          timestamp,
          timestamp,
        ).lastInsertRowid,
      );
      noteIds[note.key] = noteId;
      (note.subnotes ?? []).forEach((content) => {
        insertSubnote.run(noteId, 'benchmark', content, timestamp);
      });
    });
  })();

  const datasetHash = createHash('sha256')
    .update(
      JSON.stringify({
        workspaces: AGENT_EVAL_WORKSPACES,
        notes: AGENT_EVAL_NOTES,
        tasks: AGENT_EVAL_TASKS,
      }),
    )
    .digest('hex');
  const languageCounts = AGENT_EVAL_NOTES.reduce<Record<string, number>>(
    (counts, note) => ({
      ...counts,
      [note.language]: (counts[note.language] ?? 0) + 1,
    }),
    {},
  );
  const lengthCounts = AGENT_EVAL_NOTES.reduce<Record<string, number>>(
    (counts, note) => {
      let bucket = 'very-long (>1600)';
      if (note.transcript.length <= 240) bucket = 'short (≤240)';
      else if (note.transcript.length <= 800) bucket = 'medium (241–800)';
      else if (note.transcript.length <= 1600) bucket = 'long (801–1600)';
      return { ...counts, [bucket]: (counts[bucket] ?? 0) + 1 };
    },
    {},
  );
  const manifest: AgentEvalFixtureManifest = {
    schema_version: 1,
    dataset_hash: datasetHash,
    database_path: databasePath,
    note_count: AGENT_EVAL_NOTES.length,
    task_count: AGENT_EVAL_TASKS.length,
    workspace_ids: workspaceIds,
    note_ids: noteIds,
    note_keys_by_id: Object.fromEntries(
      Object.entries(noteIds).map(([key, id]) => [String(id), key]),
    ),
    language_counts: languageCounts,
    length_counts: lengthCounts,
  };
  fs.mkdirSync(benchmarkResultsRoot(), { recursive: true });
  fs.writeFileSync(
    path.join(benchmarkResultsRoot(), 'agent-eval-fixture-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { database, manifest };
}
