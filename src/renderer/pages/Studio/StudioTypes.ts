/** 工作台内部共享的类型：放在独立模块里，避免子组件反向 import 页面本身。 */
export type StudioWorkspace = { id: number; name: string };
