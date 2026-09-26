import type { GpuInfo } from '@shared/types/ModelRecommendationTypes';
import mergeGpuCandidates from '../GpuMerge';

function gpu(overrides: Partial<GpuInfo> & { name: string }): GpuInfo {
  return {
    vendor: null,
    vramGb: null,
    driverVersion: null,
    source: 'test',
    virtual: false,
    ...overrides,
  };
}

describe('mergeGpuCandidates', () => {
  it('把只有厂商名的兜底条目并进同厂商的具名显卡', () => {
    // 这是本机实测的输入：nvidia-smi 一条、WMI 一条、Electron 兜底一条，
    // 三条描述的是同一块 RTX 3060。
    const merged = mergeGpuCandidates([
      gpu({
        name: 'NVIDIA GeForce RTX 3060 Laptop GPU',
        vendor: 'NVIDIA',
        vramGb: 6,
        driverVersion: '591.86',
        source: 'nvidia-smi',
      }),
      gpu({
        name: 'NVIDIA GeForce RTX 3060 Laptop GPU',
        vendor: 'NVIDIA',
        source: 'wmi',
      }),
      gpu({ name: 'NVIDIA GPU', vendor: 'NVIDIA', source: 'electron' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('NVIDIA GeForce RTX 3060 Laptop GPU');
    expect(merged[0].vramGb).toBe(6);
  });

  it('兜底条目的驱动版本会补进具名条目的空字段', () => {
    const merged = mergeGpuCandidates([
      gpu({ name: 'NVIDIA GeForce RTX 3060', vendor: 'NVIDIA' }),
      gpu({ name: 'NVIDIA GPU', vendor: 'NVIDIA', driverVersion: '591.86' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].driverVersion).toBe('591.86');
  });

  it('同厂商没有具名条目时，兜底条目自己成行', () => {
    const merged = mergeGpuCandidates([
      gpu({ name: 'Intel GPU', vendor: 'Intel', source: 'electron' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Intel GPU');
  });

  it('有真显卡时不列出虚拟显示适配器', () => {
    const merged = mergeGpuCandidates([
      gpu({ name: 'NVIDIA GeForce RTX 3060', vendor: 'NVIDIA' }),
      gpu({
        name: 'GameViewer Virtual Display Adapter',
        vendor: 'GameViewer',
        virtual: true,
      }),
    ]);

    expect(merged.map((item) => item.name)).toEqual([
      'NVIDIA GeForce RTX 3060',
    ]);
  });

  it('一块真显卡都没有时保留虚拟适配器，避免面板空着', () => {
    const merged = mergeGpuCandidates([
      gpu({
        name: 'GameViewer Virtual Display Adapter',
        vendor: 'GameViewer',
        virtual: true,
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].virtual).toBe(true);
  });

  it('不同厂商的多块显卡各自成行', () => {
    const merged = mergeGpuCandidates([
      gpu({ name: 'NVIDIA GeForce RTX 3060', vendor: 'NVIDIA' }),
      gpu({ name: 'Intel UHD Graphics 770', vendor: 'Intel' }),
    ]);

    expect(merged).toHaveLength(2);
  });
});
