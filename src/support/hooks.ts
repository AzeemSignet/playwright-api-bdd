/**
 * Global hooks for scenario setup.
 * Keeps per-scenario setup out of feature files.
 */
import { Before } from '@cucumber/cucumber';
import { initializeTestReportingContext } from '../step-definitions/producerValidationSteps.js';
import { clearRequestCaches } from '../utils/httpHelper.js';

const DEMO_FEATURE_NAME = 'demoAPI.feature';
const BEFORE_HOOK_TAG = process.env.BEFORE_HOOK_TAG || '@beforehook';

function isDemoFeature(uri?: string): boolean {
  if (!uri) return false;
  const normalized = uri.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith(`/${DEMO_FEATURE_NAME.toLowerCase()}`);
}

Before({ tags: BEFORE_HOOK_TAG }, async function () {
  const currentUri = (this as any).pickle?.uri as string | undefined;
  if (isDemoFeature(currentUri)) return;

  await initializeTestReportingContext();
  clearRequestCaches();
});
