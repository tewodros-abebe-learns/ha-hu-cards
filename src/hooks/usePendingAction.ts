import { useRef, useState } from 'react';
export function usePendingAction() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => unknown | Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true; setPending(true); setError(null);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to complete the action. Please retry.'); }
    finally { locked.current = false; setPending(false); }
  };
  return { pending, error, setError, run };
}
