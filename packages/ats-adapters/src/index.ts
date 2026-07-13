export { BaseATSAdapter, type ApplicationField, type FormInspectionResult, type FillResult, type SubmissionResult } from './base';
export { GreenhouseAdapter } from './greenhouse';
export { LeverAdapter } from './lever';
export { AshbyAdapter } from './ashby';
export { WorkdayAdapter } from './workday';

// Adapter registry
import { GreenhouseAdapter } from './greenhouse';
import { LeverAdapter } from './lever';
import { AshbyAdapter } from './ashby';
import { WorkdayAdapter } from './workday';

export const ADAPTERS = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  new WorkdayAdapter(),
];
