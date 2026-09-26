import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  ModelRecommendationResult,
  SystemProfile,
} from '@shared/types/ModelRecommendationTypes';
import HardwareSettingsPanel from './HardwareSettingsPanel';

const translate = (key: string) => key;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

const profile: SystemProfile = {
  cpuModel: 'Test CPU',
  logicalCores: 8,
  totalMemoryGb: 16,
  availableMemoryGb: 10,
  gpuName: 'Test GPU',
  gpus: [
    {
      name: 'Test GPU',
      vendor: 'NVIDIA',
      vramGb: 8,
      driverVersion: '1.0',
      source: 'test',
      virtual: false,
    },
  ],
  cuda: {
    available: true,
    version: '12.0',
    driverVersion: '1.0',
    deviceCount: 1,
  },
  storage: { root: 'C:\\models', totalGb: 500, freeGb: 200 },
  platform: 'win32',
  arch: 'x64',
  level: '均衡',
};

const recommendation: ModelRecommendationResult = {
  profile,
  stt: { id: 'whisper-small', name: 'Whisper Small', reason: 'test' },
  llm: { id: 'qwen', name: 'Qwen 3B', reason: 'test' },
  detectedAt: '2026-08-24T10:00:00.000Z',
};

const modelManagement = {
  getModelList: jest.fn(),
};

const recommendationApi = {
  getModels: jest.fn(),
  getSystemProfile: jest.fn(),
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <HardwareSettingsPanel />
    </MemoryRouter>,
  );
}

describe('HardwareSettingsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelManagement.getModelList.mockImplementation((type: string) =>
      Promise.resolve([{ id: `${type}-model`, name: type }]),
    );
    recommendationApi.getModels.mockResolvedValue(recommendation);
    recommendationApi.getSystemProfile.mockResolvedValue(profile);
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        modelManagement,
        recommendation: recommendationApi,
      },
    });
  });

  it('shows hardware-matched STT and LLM recommendations', async () => {
    renderPanel();

    expect(await screen.findByText('Whisper Small')).toBeInTheDocument();
    expect(screen.getByText('Qwen 3B')).toBeInTheDocument();
    expect(modelManagement.getModelList).toHaveBeenCalledWith('stt');
    expect(modelManagement.getModelList).toHaveBeenCalledWith('llm');
    expect(recommendationApi.getModels).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', {
        name: 'settings.hardware.recommendation.manage',
      }),
    ).toHaveAttribute('href', '/ModelManagement');
  });

  it('invalidates the hardware cache before recalculating recommendations', async () => {
    renderPanel();
    await screen.findByText('Whisper Small');

    fireEvent.click(
      screen.getByRole('button', { name: 'settings.hardware.refresh' }),
    );

    await waitFor(() =>
      expect(recommendationApi.getSystemProfile).toHaveBeenCalledWith(true),
    );
    await waitFor(() =>
      expect(recommendationApi.getModels).toHaveBeenCalledTimes(2),
    );
  });
});
