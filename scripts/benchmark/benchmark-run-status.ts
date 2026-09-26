export type BenchmarkStepResult = {
  id: string;
  status: string;
  [key: string]: unknown;
};

export function isCompleteBenchmarkRun(steps: BenchmarkStepResult[]): boolean {
  return steps.length > 0 && steps.every((step) => step.status === 'ok');
}
