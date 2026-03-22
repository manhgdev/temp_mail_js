import { ENV } from '../config/env.js';
import { deactivateExpiredDomains, isProductionDomainSource } from './domain.service.js';
import { isFirebaseAdminConfigured } from './firebase-admin.js';

let expirySweepTimer = null;

const runSweep = async () => {
  try {
    const updatedDomains = await deactivateExpiredDomains();
    if (updatedDomains.length > 0) {
      console.log(`[domains] deactivated ${updatedDomains.length} expired domain(s)`);
    }
  } catch (error) {
    console.error('[domains] expiry sweep failed', error.message);
  }
};

export const startDomainExpirySweep = () => {
  if (!isProductionDomainSource() || !isFirebaseAdminConfigured()) {
    return null;
  }

  if (expirySweepTimer) {
    return expirySweepTimer;
  }

  runSweep();
  expirySweepTimer = setInterval(runSweep, ENV.DOMAIN_EXPIRY_SWEEP_INTERVAL_MS);
  expirySweepTimer.unref?.();
  return expirySweepTimer;
};
