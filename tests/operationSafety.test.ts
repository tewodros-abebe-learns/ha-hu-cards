import test from 'node:test';
import assert from 'node:assert/strict';
import { setOperationIdentity, protectedOperation, pendingOperations, registerSensitiveWork, safeToUpdate } from '../src/operationSafety';

test('queued work cannot write after sign-out and re-login to the same identity', async () => {
  setOperationIdentity('guest_a');
  let release!: () => void;
  let wrote = false;
  const first = protectedOperation('guest_a', true, () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve(); await Promise.resolve();
  const second = protectedOperation('guest_a', true, async () => { wrote = true; });
  const rejection = assert.rejects(second, /session changed/);
  setOperationIdentity(null); setOperationIdentity('guest_a');
  release(); await first; await rejection;
  assert.equal(wrote, false);
  assert.equal(pendingOperations(), 0);
});
test('app updates wait for dirty editors and other sensitive work', () => {
  assert.equal(safeToUpdate(), true);
  const release = registerSensitiveWork();
  assert.equal(safeToUpdate(), false);
  release(); release();
  assert.equal(safeToUpdate(), true);
});
