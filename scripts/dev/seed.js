const Database = require('better-sqlite3');
const path = require('path');

// 产品改名后 userData 目录跟着 productName 走。
const dbPath = path.join(
  process.env.APPDATA,
  'SpeakSpace Local',
  'speakspace.db',
);
const db = new Database(dbPath);

console.log('Opened DB:', dbPath);

// Ensure a workspace exists
const ws = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
let workspaceId;
if (ws) {
  workspaceId = ws.id;
} else {
  const insertWs = db.prepare('INSERT INTO workspaces (name) VALUES (?)');
  const info = insertWs.run('Default Workspace');
  workspaceId = info.lastInsertRowid;
  console.log('Created Default Workspace:', workspaceId);
}

// Insert a note
const insertNote = db.prepare(`
    INSERT INTO notes (workspace_id, name, audio_relative_path, transcript, is_pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const info2 = insertNote.run(
  workspaceId,
  '專案進度週會紀錄',
  'mock-audio.mp3',
  '今天的會議主要討論 Dashboard 的實作進度。目前已經順利把前端跟後端的資料庫串接好了，接下來要測試實時轉錄。大家覺得有沒有什麼需要補充的？',
  1,
);

console.log('Created Mock Note:', info2.lastInsertRowid);
db.close();
