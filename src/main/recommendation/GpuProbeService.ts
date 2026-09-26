import { app } from 'electron';
import type { CudaInfo, GpuInfo } from '@shared/types/ModelRecommendationTypes';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import mergeGpuCandidates from './GpuMerge';

export type GpuProbeResult = {
  gpus: GpuInfo[];
  cuda: CudaInfo;
};

type ElectronGpuDevice = {
  deviceString?: string;
  vendorId?: number;
  deviceId?: number;
  driverVersion?: string;
};

type WmiVideoController = {
  Name?: string;
  AdapterCompatibility?: string;
  AdapterRAM?: number | null;
  DriverVersion?: string;
};

// 单个探测命令最多等这么久，避免驱动异常时卡住整个设置页。
const PROBE_TIMEOUT_MS = 5000;

// Win32_VideoController.AdapterRAM 是 32 位字段，超过 4 GiB 一律返回这个上限值。
const WMI_VRAM_CAP_BYTES = 4293918720;

const VIRTUAL_ADAPTER_PATTERN =
  /virtual|basic display|remote|idd|parsec|gameviewer|sunshine|meta |citrix|vmware|virtualbox|hyper-v/i;

const VENDOR_IDS: Record<number, string> = {
  0x10de: 'NVIDIA',
  0x1002: 'AMD',
  0x1022: 'AMD',
  0x8086: 'Intel',
  0x106b: 'Apple',
};

function guessVendor(name: string): string | null {
  if (/nvidia|geforce|quadro|rtx|gtx/i.test(name)) return 'NVIDIA';
  if (/amd|radeon|ryzen/i.test(name)) return 'AMD';
  if (/intel|iris|uhd graphics|arc/i.test(name)) return 'Intel';
  if (/apple|m[1-9] (pro|max|ultra)?/i.test(name)) return 'Apple';
  return null;
}

/**
 * 多路探测显卡：Electron 的 getGPUInfo 在 Windows 上常常拿不到显卡名，
 * 因此再叠加 nvidia-smi、WMI、system_profiler、lspci，取信息最全的一条。
 */
export default class GpuProbeService {
  private readonly runner: LocalProcessRunner;

  public constructor(runner = new LocalProcessRunner()) {
    this.runner = runner;
  }

  public async probe(): Promise<GpuProbeResult> {
    const [nvidia, platformGpus, electronGpus] = await Promise.all([
      this.probeNvidia(),
      this.probePlatform(),
      GpuProbeService.probeElectron(),
    ]);

    // 顺序即优先级：nvidia-smi 的信息最全，Electron 只作兜底。
    const gpus = mergeGpuCandidates([
      ...nvidia.gpus,
      ...platformGpus,
      ...electronGpus,
    ]);

    return { gpus, cuda: nvidia.cuda };
  }

  /** nvidia-smi 同时给出真实显存、驱动版本和 CUDA 版本，优先级最高。 */
  private async probeNvidia(): Promise<{ gpus: GpuInfo[]; cuda: CudaInfo }> {
    const empty: CudaInfo = {
      available: false,
      version: null,
      driverVersion: null,
      deviceCount: 0,
    };

    let gpus: GpuInfo[] = [];
    try {
      const { stdout } = await this.run('nvidia-smi', [
        '--query-gpu=name,memory.total,driver_version',
        '--format=csv,noheader',
      ]);
      gpus = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, memory, driverVersion] = line
            .split(',')
            .map((part) => part.trim());
          const megabytes = Number(/(\d+)/.exec(memory ?? '')?.[1] ?? '');
          return {
            name,
            vendor: 'NVIDIA',
            vramGb: Number.isNaN(megabytes)
              ? null
              : Number((megabytes / 1024).toFixed(1)),
            driverVersion: driverVersion || null,
            source: 'nvidia-smi',
            virtual: false,
          };
        });
    } catch {
      return { gpus: [], cuda: empty };
    }

    if (gpus.length === 0) return { gpus, cuda: empty };

    let version: string | null = null;
    try {
      // 表格首行形如 "... Driver Version: 591.86  CUDA Version: 13.1"。
      const { stdout } = await this.run('nvidia-smi', []);
      version = /CUDA Version:\s*([\d.]+)/.exec(stdout)?.[1] ?? null;
    } catch {
      version = null;
    }

    return {
      gpus,
      cuda: {
        available: true,
        version,
        driverVersion: gpus[0]?.driverVersion ?? null,
        deviceCount: gpus.length,
      },
    };
  }

  private probePlatform(): Promise<GpuInfo[]> {
    if (process.platform === 'win32') return this.probeWindows();
    if (process.platform === 'darwin') return this.probeMac();
    return this.probeLinux();
  }

  private async probeWindows(): Promise<GpuInfo[]> {
    try {
      const { stdout } = await this.run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,AdapterRAM,DriverVersion | ConvertTo-Json -Compress',
      ]);
      const parsed = JSON.parse(stdout.trim() || 'null');
      const controllers: WmiVideoController[] = Array.isArray(parsed)
        ? parsed
        : [parsed].filter(Boolean);

      return controllers
        .filter((controller) => controller?.Name)
        .map((controller) => {
          const bytes = Number(controller.AdapterRAM ?? 0);
          const capped = !bytes || bytes >= WMI_VRAM_CAP_BYTES;
          const name = String(controller.Name);
          return {
            name,
            vendor: controller.AdapterCompatibility ?? guessVendor(name),
            vramGb: capped ? null : Number((bytes / 1024 ** 3).toFixed(1)),
            driverVersion: controller.DriverVersion ?? null,
            source: 'wmi',
            virtual: VIRTUAL_ADAPTER_PATTERN.test(name),
          };
        });
    } catch {
      return [];
    }
  }

  private async probeMac(): Promise<GpuInfo[]> {
    try {
      const { stdout } = await this.run('system_profiler', [
        'SPDisplaysDataType',
        '-json',
      ]);
      const parsed = JSON.parse(stdout.trim() || '{}');
      const displays: Array<Record<string, string>> =
        parsed.SPDisplaysDataType ?? [];

      return displays
        .filter((display) => display.sppci_model)
        .map((display) => {
          const vram = display.spdisplays_vram ?? display.sppci_vram ?? '';
          const gigabytes = /(\d+)\s*GB/i.exec(vram)?.[1];
          return {
            name: display.sppci_model,
            vendor: guessVendor(display.sppci_model),
            vramGb: gigabytes ? Number(gigabytes) : null,
            driverVersion: null,
            source: 'system_profiler',
            virtual: false,
          };
        });
    } catch {
      return [];
    }
  }

  private async probeLinux(): Promise<GpuInfo[]> {
    try {
      const { stdout } = await this.run('lspci', []);
      return stdout
        .split(/\r?\n/)
        .filter((line) => /VGA compatible controller|3D controller/i.test(line))
        .map((line) => {
          const name = line.split(': ').slice(1).join(': ').trim();
          return {
            name,
            vendor: guessVendor(name),
            vramGb: null,
            driverVersion: null,
            source: 'lspci',
            virtual: VIRTUAL_ADAPTER_PATTERN.test(name),
          };
        })
        .filter((gpu) => gpu.name.length > 0);
    } catch {
      return [];
    }
  }

  /** Electron 自带信息在 Windows 上常缺名称，只作为兜底。 */
  private static async probeElectron(): Promise<GpuInfo[]> {
    try {
      const info = (await app.getGPUInfo('complete')) as {
        gpuDevice?: ElectronGpuDevice[];
      };

      return (info.gpuDevice ?? [])
        .map((device) => {
          const name =
            device.deviceString?.trim() ||
            (device.vendorId && VENDOR_IDS[device.vendorId]
              ? `${VENDOR_IDS[device.vendorId]} GPU`
              : '');
          return {
            name,
            vendor:
              (device.vendorId ? VENDOR_IDS[device.vendorId] : null) ??
              guessVendor(name),
            vramGb: null,
            driverVersion: device.driverVersion ?? null,
            source: 'electron',
            virtual: VIRTUAL_ADAPTER_PATTERN.test(name),
          };
        })
        .filter((gpu) => gpu.name.length > 0);
    } catch {
      return [];
    }
  }

  private run(command: string, args: string[]) {
    return this.runner.run(command, args, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  }
}
