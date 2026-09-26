import sqlite3
import os

appdata = os.environ.get('APPDATA')
db_path = os.path.join(appdata, 'electron-react-boilerplate', 'speakspace.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create workspace if empty
cursor.execute("SELECT id FROM workspaces LIMIT 1")
ws = cursor.fetchone()
if ws:
    ws_id = ws[0]
else:
    cursor.execute("INSERT INTO workspaces (name) VALUES ('Default Workspace')")
    ws_id = cursor.lastrowid
    print('Created workspace:', ws_id)

cursor.execute("""
INSERT INTO notes (workspace_id, name, audio_relative_path, transcript, is_pinned, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
""", (ws_id, '產品規劃會議', 'audio/meeting1.mp3', '今天會議我們決定將 SpeakSpace Local 的最新功能推進到下一個階段。實時轉錄和儀表板的串接已經完成，接下來準備讓團隊開始測試，確保本機端的 AI 推論穩定度。', 1))

print('Inserted note:', cursor.lastrowid)

conn.commit()
conn.close()
