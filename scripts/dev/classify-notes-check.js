/* eslint-disable import/no-dynamic-require, global-require, no-restricted-syntax, no-await-in-loop, no-console */
// 开发期脚本：故意用动态 require（要按仓库根目录定位 Electron 版 better-sqlite3
// 和 TypeScript 源码）并串行 await 调模型，本地模型并发只会互相抢显存。
/**
 * 笔记分类的离线抽查脚本。
 *
 * 直接读本地 speakspace.db 里的真实笔记，用与应用完全相同的 prompt 打一遍
 * 本地 Ollama 模型，把「笔记标题 + 开头片段 + 模型给的类型」列出来人工核对。
 * 只读数据库，不会写回任何分类。
 *
 * 用法（需要先启动 Ollama）：
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/dev/classify-notes-check.js [模型名] [条数]
 *
 * 必须用 electron 跑：better-sqlite3 是按 Electron 的 ABI 编译的，
 * 直接 node 会报「compiled against a different Node.js version」。
 */
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const Database = require(
  path.join(ROOT, 'release/app/node_modules/better-sqlite3'),
);
const { Ollama } = require(path.join(ROOT, 'node_modules/ollama'));

const MODEL = process.argv[2] || process.env.SPEAKSPACE_MODEL || 'qwen3:8b';
const LIMIT = Number(process.argv[3] || 30);

// 默认按 productName 找 userData；开发构建可能落在别的目录，用 SPEAKSPACE_DB 指定。
const DB_PATH =
  process.env.SPEAKSPACE_DB ||
  path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'SpeakSpace Local',
    'speakspace.db',
  );

// prompt 从 TypeScript 源码里现读现编译，避免脚本抄一份很快就跟应用跑偏。
require(path.join(ROOT, 'node_modules/ts-node')).register({
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
  transpileOnly: true,
});
const { buildCategoryPrompt, parseCategory } = require(
  path.join(ROOT, 'src/main/dashboard/NoteCategoryPrompt.ts'),
);

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  // 回收站是后加的列，老库里没有，脚本要能照样跑。
  const hasTrash = db
    .prepare('PRAGMA table_info(notes)')
    .all()
    .some((column) => column.name === 'trashed_at');
  const rows = db
    .prepare(
      `SELECT id, name, transcript
       FROM notes
       WHERE transcript <> ''${hasTrash ? ' AND trashed_at IS NULL' : ''}
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(LIMIT);

  console.log(`DB: ${DB_PATH}`);
  console.log(`Model: ${MODEL}  Notes: ${rows.length}\n`);

  const ollama = new Ollama();
  const tally = {};

  // 串行：本地模型并发只会互相抢显存。
  for (const row of rows) {
    const started = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const response = await ollama.chat({
      model: MODEL,
      messages: [
        { role: 'user', content: buildCategoryPrompt(row.transcript) },
      ],
      stream: false,
      options: { temperature: 0 },
    });
    const raw = (response.message?.content || '').trim();
    const category = parseCategory(raw) || 'uncategorized';
    tally[category] = (tally[category] || 0) + 1;

    const snippet = row.transcript.replace(/\s+/g, ' ').slice(0, 70);
    console.log(
      `#${row.id} [${category}] ${((Date.now() - started) / 1000).toFixed(1)}s` +
        `\n   title: ${row.name || '(无标题)'}` +
        `\n   text : ${snippet}…`,
    );
    if (!parseCategory(raw)) console.log(`   raw  : ${raw.slice(0, 120)}`);
  }

  console.log(`\nTally: ${JSON.stringify(tally)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
