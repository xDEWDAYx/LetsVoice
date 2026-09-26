/**
 * Jest 跑在 jsdom 里，没有 Electron preload 注入的 window.electron。
 *
 * 这里统一提供一份 preload 契约的替身，让 renderer 代码在测试里能正常
 * import 和首屏渲染：
 *  - 普通方法返回 Promise，默认值取自 defaultResults，未登记的返回 undefined；
 *  - onXxx 订阅方法同步返回取消订阅函数，符合 preload 的真实签名。
 *
 * 新增 preload API 时，只有当返回值会被解构 / 遍历时才需要在这里登记默认值。
 */

type PreloadFn = (...args: unknown[]) => unknown;

/** 返回值会被页面直接解构或遍历的接口，必须给出结构完整的默认值。 */
const defaultResults: Record<string, unknown> = {
  'modelManagement.getModelList': [],
  'settings.get': {},
  'settings.getAll': {},
  'recommendation.getModels': null,
  'recommendation.getWorkspace': null,
  'recommendation.getSystemProfile': null,
  'runtime.getStatus': null,
  'runtime.getReadiness': null,
  'semantic.getEmbeddingStatus': null,
  'workspace.list': [],
  'workspace.getRecent': [],
  'dashboard.getStatistics': null,
  'dashboard.getNotes': [],
  'dashboard.getTodos': [],
  'agent.listConversations': [],
  'askAI.listConversations': [],
  'workflow.listTemplates': [],
  'tts.listSpeakers': [],
};

function createMethod(namespace: string, method: string): PreloadFn {
  // onXxx / offXxx 是同步订阅接口，真实 preload 返回取消订阅函数。
  if (/^(on|off)[A-Z]/.test(method)) {
    return () => () => {};
  }
  const key = `${namespace}.${method}`;
  return () =>
    Promise.resolve(
      Object.prototype.hasOwnProperty.call(defaultResults, key)
        ? defaultResults[key]
        : undefined,
    );
}

function createNamespace(namespace: string): Record<string, PreloadFn> {
  const cache = new Map<string, PreloadFn>();
  return new Proxy({} as Record<string, PreloadFn>, {
    get(_target, property) {
      // Promise 探测、React 内部标记等非 API 访问必须返回 undefined，
      // 否则 mock 会被误判成 thenable 或 React 元素。
      if (typeof property !== 'string' || property === 'then') return undefined;
      if (!cache.has(property)) {
        cache.set(property, createMethod(namespace, property));
      }
      return cache.get(property);
    },
    has() {
      return true;
    },
  });
}

const namespaces = new Map<string, Record<string, PreloadFn>>();

const electronMock = new Proxy({} as Record<string, unknown>, {
  get(_target, property) {
    if (typeof property !== 'string' || property === 'then') return undefined;
    if (!namespaces.has(property)) {
      namespaces.set(property, createNamespace(property));
    }
    return namespaces.get(property);
  },
  has() {
    return true;
  },
});

Object.defineProperty(window, 'electron', {
  configurable: true,
  writable: true,
  value: electronMock,
});

// jsdom 没有实现 matchMedia，主题跟随系统的组件会直接调用它。
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom 没有实现布局观察器，侧边栏 / 波形等组件在挂载时会直接 new。
// 这是纯空壳替身，方法本来就不该碰实例状态。
/* eslint-disable class-methods-use-this */
class NoopObserver {
  public observe(): void {}

  public unobserve(): void {}

  public disconnect(): void {}

  public takeRecords(): unknown[] {
    return [];
  }
}
/* eslint-enable class-methods-use-this */

const observerGlobals: Array<'ResizeObserver' | 'IntersectionObserver'> = [
  'ResizeObserver',
  'IntersectionObserver',
];
observerGlobals.forEach((name) => {
  if (!(name in window)) {
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value: NoopObserver,
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: NoopObserver,
    });
  }
});

export default electronMock;
