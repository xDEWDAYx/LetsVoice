/**
 * 无依赖的 SVG 图表。
 *
 * 为什么自己画而不是引图表库：这些图要提交进仓库、在 GitHub 的 Markdown 里直接渲染，
 * 也要能在离线的报告里看。SVG 是纯文本、可 diff、不需要任何运行时。
 *
 * 配色和背景都显式写死：GitHub 的深色模式不会给 SVG 注入样式，
 * 所以图必须自带白底，否则深色主题下文字会看不见。
 */

/* eslint-disable no-restricted-syntax */

/** 每个模型固定一个颜色，跨所有图保持一致，读者不用反复看图例。 */
export const SERIES_COLORS = [
  '#2E86AB',
  '#E8871A',
  '#B5446E',
  '#4C9F70',
  '#6C5CE7',
  '#8C8C8C',
];

const INK = '#1F2933';
const MUTED = '#6B7280';
const GRID = '#E3E8EF';
const BACKGROUND = '#FFFFFF';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei', sans-serif";

export type Series = { name: string; values: (number | null)[] };
export type PointSeries = {
  name: string;
  points: { x: number; y: number; label?: string }[];
};

type BaseOptions = {
  title: string;
  subtitle?: string;
  /** 图下方的一句话说明，用来写「这张图想说明什么」。 */
  caption?: string;
  width?: number;
  height?: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(
  x: number,
  y: number,
  value: string,
  options: {
    size?: number;
    fill?: string;
    anchor?: 'start' | 'middle' | 'end';
    weight?: number;
    rotate?: number;
  } = {},
): string {
  const {
    size = 12,
    fill = INK,
    anchor = 'start',
    weight = 400,
    rotate,
  } = options;
  const transform = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${transform}>${escapeXml(value)}</text>`;
}

/** 把值域收敛到「好看的」刻度：1 / 2 / 2.5 / 5 的整数倍。 */
function niceScale(
  min: number,
  max: number,
  tickCount = 5,
): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const base = Number.isFinite(max) && max !== 0 ? max : 1;
    return { min: 0, max: base * 1.2, ticks: [0, base * 0.6, base * 1.2] };
  }
  const range = max - min;
  const rawStep = range / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  let step = magnitude;
  if (normalized > 5) step = 10 * magnitude;
  else if (normalized > 2.5) step = 5 * magnitude;
  else if (normalized > 2) step = 2.5 * magnitude;
  else if (normalized > 1) step = 2 * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + step / 1000; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return { min: niceMin, max: niceMax, ticks };
}

/**
 * 文本宽度的粗略估算。
 *
 * 不能按 length 乘一个常数：中日韩字符是全宽，同样字号下大约是拉丁字母的两倍，
 * 按拉丁宽度算会让中文图例互相重叠。
 */
function textWidth(value: string, size: number): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? size * 1.02 : size * 0.55;
  }
  return width;
}

/** 按近似显示宽度切分说明文字，避免窄面板中的副标题和图注被裁掉。 */
function wrapText(value: string, maxWidth: number, size: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textWidth(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** 图例。超出画布宽度时自动换行，中文标签很长时才不会被截掉。 */
function legend(
  x: number,
  y: number,
  names: string[],
  colors: string[],
  maxWidth = 812,
): string {
  let cursor = x;
  let row = 0;
  return names
    .map((name, index) => {
      const itemWidth = 16 + textWidth(name, 12) + 22;
      if (cursor > x && cursor + itemWidth > x + maxWidth) {
        row += 1;
        cursor = x;
      }
      const lineY = y + row * 18;
      const swatch = `<rect x="${cursor.toFixed(1)}" y="${lineY - 9}" width="11" height="11" rx="2" fill="${colors[index % colors.length]}"/>`;
      const label = text(cursor + 16, lineY, name, { size: 12, fill: MUTED });
      cursor += itemWidth;
      return swatch + label;
    })
    .join('');
}

/** 图例占了几行，用来把绘图区往下推。 */
function legendRows(names: string[], startX: number, maxWidth = 812): number {
  let cursor = startX;
  let rows = 1;
  for (const name of names) {
    const itemWidth = 16 + textWidth(name, 12) + 22;
    if (cursor > startX && cursor + itemWidth > startX + maxWidth) {
      rows += 1;
      cursor = startX;
    }
    cursor += itemWidth;
  }
  return rows;
}

/**
 * 图注按画布宽度折行。以前是单行硬画，写长一点就顶出画布右边被裁掉，
 * 于是图注只能写成一句空泛的话。折行之后才放得下「结论 + 支撑数字」。
 * 高度由调用方按行数预留，见各图的 bottom 计算。
 */
const CAPTION_LINE_HEIGHT = 15;

function wrapCaption(caption: string | undefined, width: number): string[] {
  if (!caption) return [];
  return wrapText(caption, width - 48, 11.5);
}

function frame(
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  body: string,
  caption?: string,
): string {
  const lines = wrapCaption(caption, width);
  const captionBlock = lines
    .map((line, index) =>
      text(
        24,
        height - 14 - (lines.length - 1 - index) * CAPTION_LINE_HEIGHT,
        line,
        { size: 11.5, fill: MUTED },
      ),
    )
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="${width}" height="${height}" fill="${BACKGROUND}" rx="8"/>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${GRID}" rx="8"/>`,
    text(24, 32, title, { size: 16, weight: 600 }),
    subtitle ? text(24, 52, subtitle, { size: 12, fill: MUTED }) : '',
    body,
    captionBlock,
    '</svg>',
  ].join('\n');
}

/* ---------------------------- 分组柱状图 ---------------------------- */

export function groupedBarChart(
  options: BaseOptions & {
    categories: string[];
    series: Series[];
    yLabel?: string;
    format?: (value: number) => string;
    /** 参考线，例如 RTF = 1（合成速度等于播放速度）。 */
    referenceLine?: { value: number; label: string };
    showValues?: boolean;
    /**
     * 标题区里的紧凑上下文说明。跨机器图用它列出设备硬件，而不是把长配置塞进横轴。
     * 宽图按两列排，普通宽度按一列排。
     */
    headerItems?: string[];
    headerLabel?: string;
  },
): string {
  const {
    title,
    subtitle,
    caption,
    categories,
    series,
    yLabel,
    format = (value) => value.toFixed(2),
    referenceLine,
    showValues = true,
    width = 860,
    headerItems = [],
    headerLabel = 'Test hardware (C = CPU cores; T = threads; memory rounded)',
  } = options;
  const legendMaxWidth = width - 48;
  const headerColumns = width >= 1100 ? 2 : 1;
  const headerRows = Math.ceil(headerItems.length / headerColumns);
  const headerShift = headerItems.length > 0 ? 23 + headerRows * 15 : 0;
  const legendShift =
    (legendRows(
      series.map((item) => item.name),
      24,
      legendMaxWidth,
    ) -
      1) *
    18;
  const allValues = series
    .flatMap((item) => item.values)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const upper = Math.max(...allValues, referenceLine?.value ?? -Infinity);
  /**
   * 有负值时轴必须延伸到负半区。否则零线就是绘图区底边，负数柱子会画到区外、
   * 和下面的类目标签叠在一起（实测：dev/holdout 差值图里 -1.6 和 -0.3 两根
   * 就压在 "Ministral-3 3B" 上）。没有负值时 Math.min(0, ...) 仍然得到 0，
   * 其余所有图的效果完全不变。
   */
  const lower = Math.min(0, ...allValues);
  const scale = niceScale(lower, upper);

  /**
   * 柱顶数值标签画在柱顶上方，参考线标签画在线的上方 —— 当有柱子正好落在参考线上
   * 时，两者会被挤到同一行并重叠（实测：GPU 卸载图里几乎所有柱子都是 100%，
   * 右侧的 "Full GPU offload" 和一排 "100%" 糊成一团）。
   * 判定到这种重合就多留一行的高度，把参考线标签抬到数值标签上方去。
   */
  const referenceCollidesWithValues =
    referenceLine !== undefined &&
    showValues &&
    series.some((item) =>
      item.values.some(
        (value) =>
          value !== null &&
          Number.isFinite(value) &&
          Math.abs(value - referenceLine.value) <=
            (scale.max - scale.min) * 0.02,
      ),
    );
  // 高度和 top 一起加，图整体高一点，绘图区大小不变。
  const extraTop = referenceCollidesWithValues ? 16 : 0;
  const height = (options.height ?? 420) + legendShift + extraTop + headerShift;
  const left = 64;
  const right = 24;
  const top = 92 + legendShift + extraTop + headerShift;
  const extraCaptionRows =
    (wrapCaption(caption, width).length - 1) * CAPTION_LINE_HEIGHT;
  const bottom = caption ? 74 + extraCaptionRows : 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const toY = (value: number) =>
    top +
    plotHeight -
    ((value - scale.min) / (scale.max - scale.min)) * plotHeight;

  const parts: string[] = [];
  if (headerItems.length > 0) {
    parts.push(text(24, 70, headerLabel, { size: 11.5, weight: 600 }));
    const columnWidth = (width - 48) / headerColumns;
    headerItems.forEach((item, index) => {
      const column = index % headerColumns;
      const row = Math.floor(index / headerColumns);
      parts.push(
        text(24 + column * columnWidth, 85 + row * 15, item, {
          size: 11.5,
          fill: MUTED,
        }),
      );
    });
  }
  parts.push(
    legend(
      24,
      72 + headerShift,
      series.map((item) => item.name),
      SERIES_COLORS,
      legendMaxWidth,
    ),
  );

  for (const tick of scale.ticks) {
    const y = toY(tick);
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="${GRID}"/>`,
    );
    parts.push(
      text(left - 8, y + 4, format(tick), {
        size: 11,
        fill: MUTED,
        anchor: 'end',
      }),
    );
  }
  if (yLabel) {
    parts.push(
      text(18, top + plotHeight / 2, yLabel, {
        size: 11.5,
        fill: MUTED,
        anchor: 'middle',
        rotate: -90,
      }),
    );
  }

  const groupWidth = plotWidth / categories.length;
  const barWidth = Math.min(34, (groupWidth * 0.72) / series.length);
  const baseline = toY(0);

  /**
   * 数值标签只在放得下的时候画。相邻柱子的中心相距 barWidth，标签又是居中的，
   * 所以标签一旦比 barWidth 宽就必然和邻居的标签叠在一起 —— 系列多的图
   * （跨机器 STT 有 16 个模型、每根柱子只有 9px 宽）硬标出来就是一团糊。
   * 判定按整张图统一取舍，避免同一组里有的标有的不标。
   * 确切数值在 cross-machine-benchmark.md 的表里，不会因此丢失。
   */
  const valuesFit = series.every((item) =>
    item.values.every(
      (value) =>
        value === null ||
        !Number.isFinite(value) ||
        textWidth(format(value), 10) <= barWidth - 1,
    ),
  );
  const drawValues = showValues && valuesFit;

  categories.forEach((category, categoryIndex) => {
    const groupCenter = left + groupWidth * (categoryIndex + 0.5);
    const groupStart = groupCenter - (barWidth * series.length) / 2;
    series.forEach((item, seriesIndex) => {
      const value = item.values[categoryIndex];
      if (value === null || !Number.isFinite(value)) return;
      const x = groupStart + barWidth * seriesIndex;
      const y = toY(value);
      // 柱子在零线和数值之间：负数时从零线往下长。
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${Math.min(y, baseline).toFixed(1)}" width="${(barWidth - 3).toFixed(1)}" height="${Math.abs(baseline - y).toFixed(1)}" fill="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}" rx="2"/>`,
      );
      if (drawValues) {
        // 正数标在柱顶上方，负数标在柱底下方，都在柱子外侧。
        parts.push(
          text(
            x + (barWidth - 3) / 2,
            value < 0 ? y + 12 : y - 5,
            format(value),
            { size: 10, fill: MUTED, anchor: 'middle' },
          ),
        );
      }
    });
    parts.push(
      text(groupCenter, top + plotHeight + 18, category, {
        size: 11.5,
        anchor: 'middle',
      }),
    );
  });

  if (referenceLine) {
    const y = toY(referenceLine.value);
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#D64545" stroke-width="1.5" stroke-dasharray="5 4"/>`,
    );
    parts.push(
      text(
        width - right - 4,
        y - (referenceCollidesWithValues ? 19 : 6),
        referenceLine.label,
        {
          size: 11,
          fill: '#D64545',
          anchor: 'end',
        },
      ),
    );
  }

  // 零线。没有负值时它就是绘图区底边，和以前一样。
  parts.push(
    `<line x1="${left}" y1="${baseline.toFixed(1)}" x2="${width - right}" y2="${baseline.toFixed(1)}" stroke="${MUTED}"/>`,
  );
  return frame(width, height, title, subtitle, parts.join('\n'), caption);
}

/* ------------------------------ 折线图 ------------------------------ */

export function lineChart(
  options: BaseOptions & {
    series: PointSeries[];
    xLabel?: string;
    yLabel?: string;
    formatX?: (value: number) => string;
    formatY?: (value: number) => string;
    /** 数量级跨度大时（例如内存从 0.5 GiB 到 10 GiB）用对数轴。 */
    logY?: boolean;
    referenceLine?: { value: number; label: string };
    showPointLabels?: boolean;
    /**
     * 默认 y 轴从 0 起，柱状/比例图看绝对量时这样才诚实。
     * 但当几条线都挤在高位窄区间时（稳定性图：4 条线全在 82%–95%），
     * 从 0 起会把它们压成一束，点上的数值互相重叠、也看不出差异。
     * 这类「看波动而不是看绝对量」的图传 false，轴改为贴着数据范围。
     */
    yFromZero?: boolean;
  },
): string {
  const {
    title,
    subtitle,
    caption,
    series,
    xLabel,
    yLabel,
    formatX = (value) => String(Math.round(value)),
    formatY = (value) => value.toFixed(2),
    logY = false,
    referenceLine,
    showPointLabels = false,
    yFromZero = true,
    width = 860,
  } = options;
  const legendShift =
    (legendRows(
      series.map((item) => item.name),
      24,
    ) -
      1) *
    18;
  const height = (options.height ?? 440) + legendShift;
  const left = 72;
  const right = 28;
  const top = 92 + legendShift;
  const extraCaptionRows =
    (wrapCaption(caption, width).length - 1) * CAPTION_LINE_HEIGHT;
  const bottom = caption ? 78 + extraCaptionRows : 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const xs = series.flatMap((item) => item.points.map((point) => point.x));
  const ys = series.flatMap((item) => item.points.map((point) => point.y));
  if (referenceLine) ys.push(referenceLine.value);
  const xScale = niceScale(Math.min(...xs), Math.max(...xs));
  /**
   * x 是离散序号（第几轮、第几个长度档）时，niceScale 会在整数之间插入半格刻度，
   * formatX 再四舍五入，于是出现 "Round 1 / Round 2 / Round 2 / Round 3 / Round 3"
   * 这种重复标签。整数且档数不多时直接用实际取值当刻度。
   */
  const distinctXs = [...new Set(xs)].sort((a, b) => a - b);
  const candidateXTicks =
    distinctXs.every((value) => Number.isInteger(value)) &&
    distinctXs.length <= 12
      ? distinctXs
      : xScale.ticks;
  // 数值型长度档可能很接近（24、35、52），保留位置但省略相邻重叠刻度。
  const xTicks = candidateXTicks.filter((value, index, ticks) => {
    if (index === 0) return true;
    const previous = ticks[index - 1];
    const gap = ((value - previous) / (xScale.max - xScale.min)) * plotWidth;
    return (
      gap >=
      (textWidth(formatX(value), 11) + textWidth(formatX(previous), 11)) / 2 + 8
    );
  });

  const logMin = Math.max(Math.min(...ys) / 2, 1e-9);
  const logMax = Math.max(...ys) * 1.6;
  const yLow = Math.min(...ys);
  const yHigh = Math.max(...ys);
  // 贴着数据范围时上下各留 15% 余量，端点不会顶在边框上。
  const yPad = Math.max((yHigh - yLow) * 0.15, 1e-9);
  const yScale = logY
    ? { min: logMin, max: logMax, ticks: [] as number[] }
    : niceScale(yFromZero ? 0 : yLow - yPad, yHigh + (yFromZero ? 0 : yPad));
  if (logY) {
    const start = Math.floor(Math.log10(logMin));
    const end = Math.ceil(Math.log10(logMax));
    for (let power = start; power <= end; power += 1) {
      const base = 10 ** power;
      [1, 2, 5].forEach((multiplier) => {
        const value = base * multiplier;
        if (value >= logMin && value <= logMax) yScale.ticks.push(value);
      });
    }
  }

  const toX = (value: number) =>
    left + ((value - xScale.min) / (xScale.max - xScale.min)) * plotWidth;
  const toY = (value: number) => {
    if (logY) {
      const ratio =
        (Math.log10(Math.max(value, logMin)) - Math.log10(yScale.min)) /
        (Math.log10(yScale.max) - Math.log10(yScale.min));
      return top + plotHeight - ratio * plotHeight;
    }
    return (
      top +
      plotHeight -
      ((value - yScale.min) / (yScale.max - yScale.min)) * plotHeight
    );
  };

  const parts: string[] = [];
  parts.push(
    legend(
      24,
      72,
      series.map((item) => item.name),
      SERIES_COLORS,
    ),
  );

  for (const tick of yScale.ticks) {
    const y = toY(tick);
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="${GRID}"/>`,
    );
    parts.push(
      text(left - 8, y + 4, formatY(tick), {
        size: 11,
        fill: MUTED,
        anchor: 'end',
      }),
    );
  }
  for (const tick of xTicks) {
    const x = toX(tick);
    parts.push(
      text(x, top + plotHeight + 18, formatX(tick), {
        size: 11,
        fill: MUTED,
        anchor: 'middle',
      }),
    );
  }
  if (yLabel) {
    parts.push(
      text(18, top + plotHeight / 2, yLabel, {
        size: 11.5,
        fill: MUTED,
        anchor: 'middle',
        rotate: -90,
      }),
    );
  }
  if (xLabel) {
    parts.push(
      text(left + plotWidth / 2, height - (caption ? 42 : 24), xLabel, {
        size: 11.5,
        fill: MUTED,
        anchor: 'middle',
      }),
    );
  }

  if (referenceLine) {
    const y = toY(referenceLine.value);
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#D64545" stroke-width="1.5" stroke-dasharray="5 4"/>`,
    );
    parts.push(
      text(left + 6, y - 6, referenceLine.label, { size: 11, fill: '#D64545' }),
    );
  }

  series.forEach((item, seriesIndex) => {
    const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
    const sorted = [...item.points].sort((a, b) => a.x - b.x);
    const path = sorted
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${toX(point.x).toFixed(1)} ${toY(point.y).toFixed(1)}`,
      )
      .join(' ');
    parts.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`,
    );
    sorted.forEach((point) => {
      parts.push(
        `<circle cx="${toX(point.x).toFixed(1)}" cy="${toY(point.y).toFixed(1)}" r="3.4" fill="${color}"/>`,
      );
      if (showPointLabels) {
        parts.push(
          text(
            toX(point.x),
            toY(point.y) - 9,
            point.label ?? formatY(point.y),
            {
              size: 10,
              fill: color,
              anchor: 'middle',
            },
          ),
        );
      }
    });
  });

  parts.push(
    `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="${MUTED}"/>`,
  );
  return frame(width, height, title, subtitle, parts.join('\n'), caption);
}

/* ------------------------------ 散点图 ------------------------------ */

export function scatterChart(
  options: BaseOptions & {
    series: PointSeries[];
    xLabel?: string;
    yLabel?: string;
    formatX?: (value: number) => string;
    formatY?: (value: number) => string;
    /** y = x 参考线，用于「合成耗时 vs 音频时长」这类图。 */
    diagonal?: boolean;
  },
): string {
  const {
    title,
    subtitle,
    caption,
    series,
    xLabel,
    yLabel,
    formatX = (value) => value.toFixed(0),
    formatY = (value) => value.toFixed(0),
    diagonal = false,
    width = 860,
  } = options;
  const legendShift =
    (legendRows(
      series.map((item) => item.name),
      24,
    ) -
      1) *
    18;
  const height = (options.height ?? 440) + legendShift;
  const left = 72;
  const right = 28;
  const top = 92 + legendShift;
  const extraCaptionRows =
    (wrapCaption(caption, width).length - 1) * CAPTION_LINE_HEIGHT;
  const bottom = caption ? 78 + extraCaptionRows : 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const xs = series.flatMap((item) => item.points.map((point) => point.x));
  const ys = series.flatMap((item) => item.points.map((point) => point.y));
  const xScale = niceScale(0, Math.max(...xs));
  const yScale = niceScale(0, Math.max(...ys));
  const toX = (value: number) =>
    left + ((value - xScale.min) / (xScale.max - xScale.min)) * plotWidth;
  const toY = (value: number) =>
    top +
    plotHeight -
    ((value - yScale.min) / (yScale.max - yScale.min)) * plotHeight;

  const parts: string[] = [];
  parts.push(
    legend(
      24,
      72,
      series.map((item) => item.name),
      SERIES_COLORS,
    ),
  );
  for (const tick of yScale.ticks) {
    const y = toY(tick);
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="${GRID}"/>`,
    );
    parts.push(
      text(left - 8, y + 4, formatY(tick), {
        size: 11,
        fill: MUTED,
        anchor: 'end',
      }),
    );
  }
  for (const tick of xScale.ticks) {
    parts.push(
      text(toX(tick), top + plotHeight + 18, formatX(tick), {
        size: 11,
        fill: MUTED,
        anchor: 'middle',
      }),
    );
  }
  if (yLabel) {
    parts.push(
      text(18, top + plotHeight / 2, yLabel, {
        size: 11.5,
        fill: MUTED,
        anchor: 'middle',
        rotate: -90,
      }),
    );
  }
  if (xLabel) {
    parts.push(
      text(left + plotWidth / 2, height - (caption ? 42 : 24), xLabel, {
        size: 11.5,
        fill: MUTED,
        anchor: 'middle',
      }),
    );
  }

  if (diagonal) {
    const limit = Math.min(xScale.max, yScale.max);
    parts.push(
      `<line x1="${toX(0)}" y1="${toY(0)}" x2="${toX(limit)}" y2="${toY(limit)}" stroke="#D64545" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    );
    parts.push(
      text(
        toX(limit) - 6,
        toY(limit) - 8,
        'Real-time line (synthesis time = audio duration)',
        {
          size: 11,
          fill: '#D64545',
          anchor: 'end',
        },
      ),
    );
  }

  series.forEach((item, seriesIndex) => {
    const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
    item.points.forEach((point) => {
      parts.push(
        `<circle cx="${toX(point.x).toFixed(1)}" cy="${toY(point.y).toFixed(1)}" r="3.6" fill="${color}" fill-opacity="0.75"/>`,
      );
    });
  });

  parts.push(
    `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="${MUTED}"/>`,
  );
  return frame(width, height, title, subtitle, parts.join('\n'), caption);
}

/* --------------------------- 水平条形图 --------------------------- */

export function horizontalBarChart(
  options: BaseOptions & {
    categories: string[];
    /** 单系列时传一个；多系列时同一分类下并排。 */
    series: Series[];
    format?: (value: number) => string;
    /** 每根条右侧的补充文字，例如「3/4」。 */
    annotations?: string[];
    max?: number;
  },
): string {
  const {
    title,
    subtitle,
    caption,
    categories,
    series,
    format = (value) => `${(value * 100).toFixed(0)}%`,
    annotations,
    max,
    width = 860,
  } = options;
  const rowHeight = 26 * series.length + 12;
  const legendShift =
    series.length > 1
      ? (legendRows(
          series.map((item) => item.name),
          24,
        ) -
          1) *
        18
      : 0;
  const top = (series.length > 1 ? 92 : 74) + legendShift;
  const extraCaptionRows =
    (wrapCaption(caption, width).length - 1) * CAPTION_LINE_HEIGHT;
  const bottom = caption ? 52 + extraCaptionRows : 28;
  const height = options.height ?? top + categories.length * rowHeight + bottom;
  const labelWidth = Math.max(
    0,
    ...categories.map((category) => textWidth(category, 11.5)),
  );
  const left = Math.min(
    Math.max(132, Math.ceil(labelWidth + 24)),
    Math.floor(width * 0.36),
  );
  const right = 92;
  const plotWidth = width - left - right;

  const allValues = series
    .flatMap((item) => item.values)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const upper = max ?? Math.max(...allValues, 0.0001);
  const toWidth = (value: number) => (value / upper) * plotWidth;

  const parts: string[] = [];
  if (series.length > 1) {
    parts.push(
      legend(
        24,
        72,
        series.map((item) => item.name),
        SERIES_COLORS,
      ),
    );
  }
  categories.forEach((category, categoryIndex) => {
    const rowTop = top + categoryIndex * rowHeight;
    parts.push(
      text(left - 10, rowTop + rowHeight / 2 - 2, category, {
        size: 11.5,
        anchor: 'end',
      }),
    );
    series.forEach((item, seriesIndex) => {
      const value = item.values[categoryIndex];
      if (value === null || !Number.isFinite(value)) return;
      const y = rowTop + seriesIndex * 26 + 4;
      parts.push(
        `<rect x="${left}" y="${y}" width="${Math.max(1, toWidth(value)).toFixed(1)}" height="18" fill="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}" rx="2"/>`,
      );
      parts.push(
        text(left + toWidth(value) + 8, y + 13, format(value), {
          size: 11,
          fill: MUTED,
        }),
      );
    });
    if (annotations?.[categoryIndex]) {
      parts.push(
        text(
          width - 20,
          rowTop + rowHeight / 2 - 2,
          annotations[categoryIndex],
          {
            size: 11,
            fill: MUTED,
            anchor: 'end',
          },
        ),
      );
    }
  });
  return frame(width, height, title, subtitle, parts.join('\n'), caption);
}

/* --------------------------- 堆叠条形图 --------------------------- */

export function stackedBarChart(
  options: BaseOptions & {
    categories: string[];
    series: Series[];
    format?: (value: number) => string;
    annotations?: string[];
  },
): string {
  const {
    title,
    subtitle,
    caption,
    categories,
    series,
    format = (value) => String(Math.round(value)),
    annotations,
    width = 860,
  } = options;
  const rowHeight = 34;
  const top =
    92 +
    (legendRows(
      series.map((item) => item.name),
      24,
    ) -
      1) *
      18;
  const extraCaptionRows =
    (wrapCaption(caption, width).length - 1) * CAPTION_LINE_HEIGHT;
  const bottom = caption ? 52 + extraCaptionRows : 28;
  const height = options.height ?? top + categories.length * rowHeight + bottom;
  const labelWidth = Math.max(
    0,
    ...categories.map((category) => textWidth(category, 11.5)),
  );
  const left = Math.min(
    Math.max(132, Math.ceil(labelWidth + 24)),
    Math.floor(width * 0.36),
  );
  const right = 92;
  const plotWidth = width - left - right;
  const totals = categories.map((_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  );
  const upper = Math.max(...totals, 1);

  const parts: string[] = [];
  parts.push(
    legend(
      24,
      72,
      series.map((item) => item.name),
      SERIES_COLORS,
    ),
  );
  categories.forEach((category, categoryIndex) => {
    const y = top + categoryIndex * rowHeight;
    parts.push(
      text(left - 10, y + 17, category, { size: 11.5, anchor: 'end' }),
    );
    let cursor = left;
    series.forEach((item, seriesIndex) => {
      const value = item.values[categoryIndex] ?? 0;
      if (value <= 0) return;
      const barWidth = (value / upper) * plotWidth;
      parts.push(
        `<rect x="${cursor.toFixed(1)}" y="${y + 4}" width="${barWidth.toFixed(1)}" height="20" fill="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}" rx="2"/>`,
      );
      if (barWidth > 26) {
        parts.push(
          text(cursor + barWidth / 2, y + 18, format(value), {
            size: 10.5,
            fill: '#FFFFFF',
            anchor: 'middle',
            weight: 600,
          }),
        );
      }
      cursor += barWidth;
    });
    parts.push(
      text(
        cursor + 8,
        y + 18,
        annotations?.[categoryIndex] ?? String(totals[categoryIndex]),
        {
          size: 11,
          fill: MUTED,
        },
      ),
    );
  });
  return frame(width, height, title, subtitle, parts.join('\n'), caption);
}

/* ---------------------------- 多图合并面板 ---------------------------- */

/**
 * 把若干张已经画好的图拼成一张。
 *
 * 做法是 SVG 嵌套：子图本身就是完整的 `<svg width height viewBox>`，
 * 作为子元素放进父图时会保留自己的坐标系，只需给定位置和缩放后的尺寸。
 * 这样不用改动任何单图函数，拼图和单图永远一致。
 *
 * 存在的理由：单图适合放在报告正文里紧跟对应表格，
 * 但报告总览和幻灯片需要「一页看完一个主题」，二十多张零散的图没法用。
 */
export function gridPanel(options: {
  title: string;
  subtitle?: string;
  caption?: string;
  /** 每个元素是一张完整的 SVG 字符串。 */
  charts: string[];
  columns?: number;
  /** 子图缩放比例。1 为原始尺寸。 */
  scale?: number;
}): string {
  const { title, subtitle, caption, charts, columns = 2, scale = 1 } = options;
  const parsed = charts.map((svg) => {
    const width = Number(svg.match(/width="(\d+(?:\.\d+)?)"/)?.[1] ?? 860);
    const height = Number(svg.match(/height="(\d+(?:\.\d+)?)"/)?.[1] ?? 420);
    // 去掉子图自己的外框描边，拼在一起时格子线会显得很吵
    const body = svg.replace(/<rect x="0\.5"[^>]*stroke="[^"]*"[^>]*\/>/, '');
    return { width, height, body };
  });

  // 按行切分；每行高度取该行最高的一张，保证格子不重叠
  const rows: (typeof parsed)[] = [];
  for (let index = 0; index < parsed.length; index += columns) {
    rows.push(parsed.slice(index, index + columns));
  }
  const rowHeights = rows.map(
    (row) => Math.max(...row.map((item) => item.height)) * scale,
  );
  const cellWidth = Math.max(...parsed.map((item) => item.width)) * scale;
  const gap = 14;
  const padding = 20;
  const totalWidth = padding * 2 + cellWidth * columns + gap * (columns - 1);
  const copyWidth = totalWidth - padding * 2 - 12;
  const subtitleLines = subtitle ? wrapText(subtitle, copyWidth, 12.5) : [];
  const captionLines = caption ? wrapText(caption, copyWidth, 12) : [];
  const lineHeight = 17;
  const headerHeight = subtitle
    ? 74 + (subtitleLines.length - 1) * lineHeight
    : 54;
  const captionHeight = caption
    ? 34 + (captionLines.length - 1) * lineHeight
    : 0;
  const totalHeight =
    headerHeight +
    rowHeights.reduce((sum, value) => sum + value, 0) +
    gap * (rows.length - 1) +
    padding +
    captionHeight;

  const body: string[] = [];
  let cursorY = headerHeight;
  rows.forEach((row, rowIndex) => {
    // 最后一行不满时居中，避免右边空一大块
    const rowWidth = cellWidth * row.length + gap * (row.length - 1);
    const startX =
      padding + (cellWidth * columns + gap * (columns - 1) - rowWidth) / 2;
    row.forEach((item, columnIndex) => {
      const x = startX + columnIndex * (cellWidth + gap);
      body.push(
        `<svg x="${x.toFixed(1)}" y="${cursorY.toFixed(1)}" width="${(item.width * scale).toFixed(1)}" height="${(item.height * scale).toFixed(1)}" viewBox="0 0 ${item.width} ${item.height}">`,
      );
      body.push(item.body);
      body.push('</svg>');
    });
    cursorY += rowHeights[rowIndex] + gap;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth.toFixed(0)}" height="${totalHeight.toFixed(0)}" viewBox="0 0 ${totalWidth.toFixed(0)} ${totalHeight.toFixed(0)}" role="img">`,
    `<rect width="${totalWidth.toFixed(0)}" height="${totalHeight.toFixed(0)}" fill="#F7F8FA" rx="10"/>`,
    text(padding + 6, 34, title, { size: 19, weight: 600 }),
    subtitleLines
      .map((line, index) =>
        text(padding + 6, 56 + index * lineHeight, line, {
          size: 12.5,
          fill: MUTED,
        }),
      )
      .join('\n'),
    body.join('\n'),
    captionLines
      .map((line, index) =>
        text(
          padding + 6,
          totalHeight - 14 - (captionLines.length - 1 - index) * lineHeight,
          line,
          { size: 12, fill: MUTED },
        ),
      )
      .join('\n'),
    '</svg>',
  ].join('\n');
}
