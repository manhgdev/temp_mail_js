import { getAdminUserStats } from './admin-user.service.js';
import { listManagedDomains, listPendingSubmissions } from './admin-domain.service.js';

export const getAdminOverview = async () => {
  const [pendingSubmissions, domains, userStats] = await Promise.all([
    listPendingSubmissions('pending'),
    listManagedDomains(),
    getAdminUserStats()
  ]);

  return {
    pending_count: pendingSubmissions.length,
    active_count: domains.filter((domain) => domain.active).length,
    inactive_count: domains.filter((domain) => !domain.active).length,
    total_users: userStats.total_users
  };
};
