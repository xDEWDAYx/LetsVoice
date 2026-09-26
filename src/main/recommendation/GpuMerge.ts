import type { GpuInfo } from '@shared/types/ModelRecommendationTypes';

/**
 * Electron 的 getGPUInfo 在 Windows 上经常拿不到设备名，只能靠 vendorId
 * 兜底拼出「NVIDIA GPU」这种没有型号的名字。它描述的是同一块物理显卡，
 * 不是另一块，因此不能按名字当成独立条目。
 */
const GENERIC_NAME_PATTERN = /^(NVIDIA|AMD|Intel|Apple)\s+GPU$/i;

export function isGenericGpuName(name: string): boolean {
  return GENERIC_NAME_PATTERN.test(name.trim());
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 以先到的那条为准，只用后来的补空字段。 */
function fillGaps(current: GpuInfo, extra: GpuInfo): GpuInfo {
  return {
    ...current,
    vendor: current.vendor ?? extra.vendor,
    vramGb: current.vramGb ?? extra.vramGb,
    driverVersion: current.driverVersion ?? extra.driverVersion,
    virtual: current.virtual || extra.virtual,
  };
}

/**
 * 把多路探测的结果合成用户看得懂的显卡列表。
 *
 * 两条规则：
 *   1. 只有厂商名的兜底条目（「NVIDIA GPU」）不单独成行。同厂商已经有
 *      具名条目时，它只贡献自己多出来的字段（比如驱动版本）。
 *   2. 虚拟显示适配器（GameViewer / Parsec / 远程桌面这类）不是显卡，
 *      有真显卡时不列出来；一块真显卡都没有时才保留，否则面板会空着，
 *      用户也就无从知道为什么没有显卡加速。
 */
export default function mergeGpuCandidates(candidates: GpuInfo[]): GpuInfo[] {
  const byName = new Map<string, GpuInfo>();

  const addNamed = (candidate: GpuInfo) => {
    const key = normalizeName(candidate.name);
    const current = byName.get(key);
    byName.set(key, current ? fillGaps(current, candidate) : candidate);
  };

  // 先收具名条目，兜底条目才有对象可以归并进去。
  candidates
    .filter((candidate) => !isGenericGpuName(candidate.name))
    .forEach(addNamed);

  candidates
    .filter((candidate) => isGenericGpuName(candidate.name))
    .forEach((candidate) => {
      const sameVendor = [...byName.entries()].find(
        ([, gpu]) =>
          gpu.vendor !== null &&
          candidate.vendor !== null &&
          gpu.vendor.toLowerCase() === candidate.vendor.toLowerCase(),
      );
      if (sameVendor) {
        byName.set(sameVendor[0], fillGaps(sameVendor[1], candidate));
        return;
      }
      // 同厂商一条具名的都没有：这是关于该显卡的唯一线索，留着。
      addNamed(candidate);
    });

  const merged = [...byName.values()].sort(
    (left, right) => Number(left.virtual) - Number(right.virtual),
  );
  const physical = merged.filter((gpu) => !gpu.virtual);

  return physical.length > 0 ? physical : merged;
}
