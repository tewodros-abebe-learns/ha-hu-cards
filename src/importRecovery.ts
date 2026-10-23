export interface ImportJob {
  token: string;
  folderId: string;
  version?: 2;
  updatedAt?: number;
  status?: 'active' | 'complete';
  confirmed?: number;
  folderCreated?: boolean;
}
export function parseImportJob(raw: string | null): ImportJob | null {
  if (!raw) return null;
  let job: ImportJob;
  try { job = JSON.parse(raw); } catch { throw new Error('Import recovery is damaged. Preserve your library and contact support before retrying.'); }
  if (!job || !/^[\w-]{1,80}$/.test(job.token) || !/^[\w-]{1,128}$/.test(job.folderId) ||
    (job.version !== undefined && job.version !== 2) ||
    (job.status !== undefined && !['active', 'complete'].includes(job.status)) ||
    (job.updatedAt !== undefined && (!Number.isFinite(job.updatedAt) || job.updatedAt < 0)) ||
    (job.confirmed !== undefined && (!Number.isInteger(job.confirmed) || job.confirmed < 0 || job.confirmed > 1000)) ||
    (job.folderCreated !== undefined && typeof job.folderCreated !== 'boolean')) throw new Error('Import recovery record is invalid. Preserve browser storage before repairing it.');
  return job;
}
export async function importFingerprint(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Only expired completed receipts are disposable. Active checkpoints are never auto-expired. */
export function pruneImportReceipts(storage: Storage, uid: string, now = Date.now()): void {
  try {
    const expired: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(`hahu_import_${uid}_`)) continue;
      try {
        const job = parseImportJob(storage.getItem(key));
        if (job?.status === 'complete' && job.updatedAt && now - job.updatedAt > 30 * 86400000) expired.push(key);
      } catch { /* Preserve malformed records for recovery. */ }
    }
    expired.forEach(key => storage.removeItem(key));
  } catch { /* Cleanup must not prevent importing. */ }
}
