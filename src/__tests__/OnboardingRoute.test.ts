import { ONBOARDING_STEPS } from '../renderer/onboarding/OnboardingSteps';
import resolveOnboardingRoute from '../renderer/onboarding/resolveOnboardingRoute';

const step = (id: string) => {
  const match = ONBOARDING_STEPS.find((item) => item.id === id);
  if (!match) throw new Error(`Missing test step: ${id}`);
  return match;
};

describe('工作空间引导路由', () => {
  const getList = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).electron = { workspace: { getList } };
  });

  it('普通步骤直接使用声明的路由，不读取工作空间', async () => {
    await expect(resolveOnboardingRoute(step('dashboard'))).resolves.toBe(
      '/DashBoard',
    );
    expect(getList).not.toHaveBeenCalled();
  });

  it('有工作空间时打开最近的一个详情页', async () => {
    getList.mockResolvedValue([{ id: 42 }]);

    await expect(resolveOnboardingRoute(step('workspaceDetail'))).resolves.toBe(
      '/Workspace/42',
    );
    expect(getList).toHaveBeenCalledWith(1);
  });

  it.each([
    ['空工作空间', []],
    ['读取失败', new Error('database unavailable')],
  ])('%s 时返回 null，让引导安全略过详情', async (_label, result) => {
    if (result instanceof Error) getList.mockRejectedValue(result);
    else getList.mockResolvedValue(result);

    await expect(
      resolveOnboardingRoute(step('workspaceNotes')),
    ).resolves.toBeNull();
  });
});
