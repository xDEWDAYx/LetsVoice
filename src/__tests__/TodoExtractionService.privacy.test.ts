import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 提取失败时，模型往往是在复述笔记原文而不是返回 JSON。
 * 这些回声可能含姓名、病情、客户信息，默认模式下一律不得出现在
 * 主进程 console / stderr，也不得写进默认日志文件。
 *
 * 变量名统一带 mock 前缀：jest.mock 的工厂会被提升到文件顶部，
 * 只有这样才允许引用外层变量。
 */

const mockState = {
  logDir: '',
  chat: jest.fn(),
};

const MOCK_PRIVATE_NOTE =
  'PRIVATE: Call Dr. Alice about biopsy results tomorrow, and wire 4200 to Contoso.';

jest.mock('electron', () => ({
  app: { getPath: () => mockState.logDir },
}));

// 注意：不要 mock 'fs'。Jest 自己的模块加载和 ts-jest 缓存都依赖它，
// 全局替换会让被测模块和测试文件拿到不同的 fs 实例，出现偶发的空日志。
jest.mock('../main/llm/LocalChatService', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => mockState.chat(...args),
  })),
}));

jest.mock('../main/semantic/OllamaEmbeddingService', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getStatus: async () => ({ installed: false }),
    embedMany: async () => [],
  })),
}));

jest.mock('../main/database/repositories/NoteRepository', () => ({
  NoteRepository: jest.fn().mockImplementation(() => ({
    findById: () => ({
      getId: () => 7,
      getName: () => 'note',
      getWorkspaceId: () => 1,
      getTranscript: () =>
        'PRIVATE: Call Dr. Alice about biopsy results tomorrow, and wire 4200 to Contoso.',
    }),
  })),
}));

jest.mock('../main/database/repositories/TodoRepository', () => ({
  TodoRepository: jest.fn().mockImplementation(() => ({
    deleteTodosByNoteId: jest.fn(),
    createTodo: jest.fn(),
    getTodosByNoteId: () => [],
  })),
}));

/** 只有笔记原文里才会出现的片段，用来判断内容是否泄漏。 */
const SECRETS = ['Dr. Alice', 'biopsy', 'Contoso', '4200'];

describe('TodoExtractionService 默认模式不外泄私人内容', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let createService: () => {
    extractTodosForNote(id: number): Promise<boolean>;
  };

  const originalDebugFlag = process.env.SPEAKSPACE_DEBUG_AI_LOGS;

  function logPath(): string {
    return path.join(mockState.logDir, 'speakspace_extraction.log');
  }

  function readDefaultLog(): string {
    return fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf8') : '';
  }

  beforeAll(() => {
    mockState.logDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'speakspace-todo-test-'),
    );
    // 放在 mockState 就绪之后再加载被测模块，避免 electron 替身取到空目录。
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const mod = require('../main/dashboard/TodoExtractionService');
    createService = () => new mod.TodoExtractionService();
  });

  // debug 开关是进程级共享状态，用例之间必须复位，否则跑的顺序会影响结果。
  beforeEach(() => {
    delete process.env.SPEAKSPACE_DEBUG_AI_LOGS;
    // 每个用例一个独立目录，日志内容不会互相串。
    // 走 SPEAKSPACE_LOG_DIR 而不是 electron 替身：整套测试一起跑时，
    // 依赖 electron mock 的路径会偶发拿不到，日志因此为空。
    mockState.logDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'speakspace-todo-case-'),
    );
    process.env.SPEAKSPACE_LOG_DIR = mockState.logDir;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
    mockState.chat.mockReset();
    delete process.env.SPEAKSPACE_LOG_DIR;
    if (originalDebugFlag === undefined) {
      delete process.env.SPEAKSPACE_DEBUG_AI_LOGS;
    } else {
      process.env.SPEAKSPACE_DEBUG_AI_LOGS = originalDebugFlag;
    }
  });

  function captured(): string {
    return [...warn.mock.calls, ...error.mock.calls]
      .map((call) => call.map((part: unknown) => String(part)).join(' '))
      .join('\n');
  }

  function expectNoLeak(): void {
    // 先确认日志确实写出来了。否则「日志里没有敏感词」会因为
    // 日志压根是空的而假通过，等于白测。
    expect(readDefaultLog().length).toBeGreaterThan(0);
    SECRETS.forEach((secret) => {
      expect(captured()).not.toContain(secret);
      expect(readDefaultLog()).not.toContain(secret);
    });
  }

  it('模型返回非 JSON 时不把输出写进 console', async () => {
    mockState.chat.mockResolvedValue({
      content: `I found this task from ${MOCK_PRIVATE_NOTE}`,
    });

    const ok = await createService().extractTodosForNote(7);

    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    expectNoLeak();
  });

  it('JSON 解析失败时不外泄（解析器报错自带原文片段）', async () => {
    // 能过 [ ] 正则、但 JSON.parse 会失败：V8 的报错信息里带出错位置附近的
    // 原文，所以 error.message 也不能直接抛给 console。
    mockState.chat.mockResolvedValue({ content: `[${MOCK_PRIVATE_NOTE}]` });

    const ok = await createService().extractTodosForNote(7);

    expect(ok).toBe(false);
    expect(error).toHaveBeenCalled();
    expectNoLeak();
  });

  it('上游报错回显 prompt 时不外泄（prompt 内含笔记原文）', async () => {
    mockState.chat.mockRejectedValue(
      new Error(`ollama refused prompt: ${MOCK_PRIVATE_NOTE}`),
    );

    const ok = await createService().extractTodosForNote(7);

    expect(ok).toBe(false);
    expect(error).toHaveBeenCalled();
    expectNoLeak();
  });

  it('显式打开 debug 时，原文只进日志文件、仍然不进 console', async () => {
    process.env.SPEAKSPACE_DEBUG_AI_LOGS = 'true';
    mockState.chat.mockResolvedValue({
      content: `I found this task from ${MOCK_PRIVATE_NOTE}`,
    });

    await createService().extractTodosForNote(7);

    expect(readDefaultLog()).toContain('Dr. Alice');
    expect(readDefaultLog()).toContain('[SENSITIVE — debug only]');
    SECRETS.forEach((secret) => expect(captured()).not.toContain(secret));
  });
});
