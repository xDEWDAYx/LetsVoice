import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/** 历次产品名对应的旧 userData 目录。 */
const LEGACY_DIRECTORY_NAMES = [
  'SpeakSpace',
  'electron-react-boilerplate',
  'ElectronReact',
];

/** 迁移完成后写入的标记，避免每次启动都重新扫描旧目录。 */
const MARKER_FILE = '.userdata-migrated';

/** 只迁移应用自己的数据，不动 Electron/Chromium 自己的缓存目录。 */
const MIGRATED_ENTRIES = [
  'speakspace.db',
  'speakspace.db-shm',
  'speakspace.db-wal',
  'app-settings.json',
  'blobs',
  'runtimes',
  'models',
  'model-state',
  'output',
];

function copyIfMissing(source: string, target: string): boolean {
  if (!fs.existsSync(source) || fs.existsSync(target)) return false;
  fs.cpSync(source, target, { recursive: true });
  return true;
}

/**
 * 产品名变化会让 Electron 同步改变 userData 路径。老用户的数据库、模型和
 * 设置仍在旧目录里，因此在主进程启动最早期做一次无损搬迁。
 *
 * 只复制不删除：旧目录原样保留，迁移出问题时用户的数据仍然在原处。
 * 必须在任何模块调用 app.getPath('userData') 之前执行。
 */
export default function migrateLegacyUserData(): void {
  const userDataPath = app.getPath('userData');
  const markerPath = path.join(userDataPath, MARKER_FILE);
  if (fs.existsSync(markerPath)) return;

  const appDataPath = app.getPath('appData');
  const legacyPath = LEGACY_DIRECTORY_NAMES.map((name) =>
    path.join(appDataPath, name),
  ).find(
    (candidate) =>
      candidate !== userDataPath &&
      fs.existsSync(path.join(candidate, 'speakspace.db')),
  );

  if (!legacyPath) return;

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    const copied = MIGRATED_ENTRIES.filter((entry) =>
      copyIfMissing(
        path.join(legacyPath, entry),
        path.join(userDataPath, entry),
      ),
    );
    fs.writeFileSync(
      markerPath,
      `${JSON.stringify(
        { migratedAt: new Date().toISOString(), from: legacyPath, copied },
        null,
        2,
      )}\n`,
      'utf8',
    );
  } catch (error) {
    // 迁移失败不能挡住启动：旧数据仍在原目录，用户可以手工拷贝。
    // eslint-disable-next-line no-console
    console.error(
      '迁移旧 userData 目录失败 / Legacy userData migration failed',
      error,
    );
  }
}
