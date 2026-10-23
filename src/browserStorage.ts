// Preferences and resumable UI state are optional. Library writes remain strict
// in localLibrary.ts so a failed save can never be reported as successful.
export const optionalStorage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  removeItem(key: string): boolean {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  }
};
