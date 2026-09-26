import { act, renderHook, waitFor } from '@testing-library/react';
import type { ModelDownloadProgressEvent } from '@shared/types/ModelManagementTypes';
import useModelManager from './useModelManager';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, resolve: finish };
}

describe('useModelManager concurrent downloads', () => {
  it('runs different models concurrently, deduplicates the same model, and tracks progress by id', async () => {
    const first = deferred();
    const second = deferred();
    const downloadModel = jest.fn((_type: string, id: string) =>
      id === 'model-a' ? first.promise : second.promise,
    );
    let onDownloadProgress:
      | ((event: ModelDownloadProgressEvent) => void)
      | null = null;
    const unsubscribe = jest.fn();

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        modelManagement: {
          getModelList: jest.fn().mockResolvedValue([]),
          downloadModel,
          deleteModel: jest.fn().mockResolvedValue(undefined),
          activateModel: jest.fn().mockResolvedValue(true),
          onDownloadProgress: jest.fn(
            (listener: (event: ModelDownloadProgressEvent) => void) => {
              onDownloadProgress = listener;
              return unsubscribe;
            },
          ),
        },
        runtime: {
          getStatus: jest.fn().mockResolvedValue(undefined),
          onInstallProgress: jest.fn(() => jest.fn()),
          onFfmpegInstallProgress: jest.fn(() => jest.fn()),
          onOllamaInstallProgress: jest.fn(() => jest.fn()),
          onTTSInstallProgress: jest.fn(() => jest.fn()),
        },
        semantic: {
          getStatus: jest.fn().mockResolvedValue(undefined),
          onInstallProgress: jest.fn(() => jest.fn()),
        },
        recommendation: {
          getModels: jest.fn().mockRejectedValue(new Error('not needed')),
        },
      },
    });

    const { result, unmount } = renderHook(() => useModelManager());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let firstRun: Promise<void> | undefined;
    let secondRun: Promise<void> | undefined;
    act(() => {
      firstRun = result.current.llm.download('model-a');
      result.current.llm.download('model-a');
      secondRun = result.current.llm.download('model-b');
    });

    expect(downloadModel).toHaveBeenCalledTimes(2);
    expect(downloadModel).toHaveBeenCalledWith('llm', 'model-a');
    expect(downloadModel).toHaveBeenCalledWith('llm', 'model-b');
    expect(result.current.busyKeys).toEqual(
      expect.arrayContaining(['llm:model-a', 'llm:model-b']),
    );

    act(() => {
      onDownloadProgress?.({
        modelType: 'llm',
        modelId: 'model-a',
        message: 'pulling layers',
        receivedBytes: 50,
        totalBytes: 100,
      });
    });
    expect(
      result.current.modelOperations.llm?.['model-a'].progress?.percent,
    ).toBe(50);
    expect(result.current.modelOperations.llm?.['model-b'].progress).toBeNull();

    await act(async () => {
      first.resolve();
      second.resolve();
      await Promise.all([firstRun, secondRun]);
    });
    expect(result.current.busyKeys).toEqual([]);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
