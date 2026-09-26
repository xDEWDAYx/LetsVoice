/**
 * 模型目录里的体积字段是给人看的字符串，写法不统一（`1.9 GB` / `466 MiB` / `~631 MiB`）。
 * 下载前要报「这一趟一共多少」就得先换算成同一个单位。
 *
 * 只用于提示，不参与任何校验，所以解析不出来时按 0 计，不抛错。
 */

/** 把目录里的体积字符串换算成 GiB。解析失败返回 0。 */
export function parseSizeGib(size: string): number {
  const matched = /([\d.]+)\s*(MiB|GiB|MB|GB|TiB|TB)/i.exec(size ?? '');
  if (!matched) return 0;
  const value = Number(matched[1]);
  if (!Number.isFinite(value)) return 0;
  switch (matched[2].toLowerCase()) {
    case 'mib':
      return value / 1024;
    case 'gib':
      return value;
    case 'tib':
      return value * 1024;
    // 十进制单位：厂商标的 GB 是 10^9，换算成 GiB 要除 1.073741824
    case 'mb':
      return (value * 1e6) / 1024 ** 3;
    case 'gb':
      return (value * 1e9) / 1024 ** 3;
    case 'tb':
      return (value * 1e12) / 1024 ** 3;
    default:
      return 0;
  }
}

export function formatGib(gib: number): string {
  return `${gib.toFixed(1)} GiB`;
}

/** 一组模型的合计体积，直接给出可打印的字符串。 */
export function totalSize(models: { size: string }[]): string {
  return formatGib(
    models.reduce((sum, model) => sum + parseSizeGib(model.size), 0),
  );
}
