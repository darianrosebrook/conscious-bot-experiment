export function normalizeStepExecutability(step: any): void {
  if (!step?.meta) return;
  if (step.meta.executable === undefined && step.meta.leaf) {
    step.meta.executable = true;
  }
}

export function isExecutableStep(step: any): boolean {
  return step?.meta?.executable === true;
}
