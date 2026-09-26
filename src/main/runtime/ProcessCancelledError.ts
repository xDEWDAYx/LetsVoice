/** AbortSignal 取消本地模型任务时使用的可识别错误。 */
export default class ProcessCancelledError extends Error {
  public constructor() {
    super('操作已取消 / Operation cancelled');
    this.name = 'ProcessCancelledError';
  }
}
