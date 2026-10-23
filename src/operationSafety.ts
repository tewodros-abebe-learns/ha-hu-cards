// Shared by auth and persistence: sign-out must not race an outstanding write.
const queues = new Map<string, Promise<unknown>>();
let pending = 0;
let transitioning = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const subscribeOperations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const pendingOperations = () => pending;
export function beginAuthTransition() {
  if (transitioning) throw new Error('An account change is already in progress. Please wait.');
  if (pending) throw new Error('Wait for the current save or transfer to finish before changing accounts.');
  transitioning = true; emit();
  return () => { transitioning = false; emit(); };
}
export async function protectedOperation<T>(uid: string, local: boolean, action: () => Promise<T>, allowDuringAuth = false): Promise<T> {
  if (transitioning && !allowDuringAuth) throw new Error('Please wait for the account change to finish.');
  assertOperationIdentity(uid);
  const generation = identityGeneration;
  const execute = () => {
    assertOperationIdentity(uid);
    if (generation !== identityGeneration) throw new Error('Your session changed while this operation was waiting. Please retry.');
    return action();
  };
  pending++; emit();
  try {
    // Web Locks serialize read/modify/write across tabs without expiring leases.
    if (local && typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(`hahu-library-${uid}`, execute);
    if (local) {
      const previous = queues.get(uid) || Promise.resolve();
      const next = previous.catch(() => {}).then(execute);
      queues.set(uid, next);
      try { return await next; } finally { if (queues.get(uid) === next) queues.delete(uid); }
    }
    return await execute();
  } finally { pending--; emit(); }
}

// Set only by the auth provider; standalone datastore tests remain independent.
let managedIdentity: string | null | undefined;
let identityGeneration = 0;
export function setOperationIdentity(uid: string | null) {
  if (managedIdentity !== uid) { managedIdentity = uid; identityGeneration++; }
}
export function assertOperationIdentity(uid: string) {
  if (managedIdentity !== undefined && managedIdentity !== uid) throw new Error('Your account changed. Reopen the library before continuing.');
}

let sensitiveWork = 0;
export function registerSensitiveWork() {
  sensitiveWork++; emit();
  let released = false;
  return () => { if (!released) { released = true; sensitiveWork--; emit(); } };
}
export const safeToUpdate = () => pending === 0 && !transitioning && sensitiveWork === 0;
