import { spawnSync } from 'child_process';

/** 使用 where/which 查找命令，不通过 shell 拼接用户输入。 */
export default class CommandLocator {
  public static resolve(commandNames: string[]): string | null {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const resolvedPaths = commandNames
      .filter((commandName) => /^[a-zA-Z0-9._-]+$/.test(commandName))
      .map((commandName) => {
        const result = spawnSync(locator, [commandName], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        const firstPath = result.stdout
          ?.split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);

        return result.status === 0 ? firstPath : undefined;
      });

    return resolvedPaths.find((resolvedPath) => resolvedPath) ?? null;
  }
}
