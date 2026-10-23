import { registerSensitiveWork } from '../operationSafety';
import { useEffect, useRef, type RefObject } from 'react';

const stack: { id: symbol; trigger: HTMLElement | null }[] = [];
let previousOverflow = '';
const focusable = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';

/** Nested dialogs trap focus only in the topmost layer and restore the trigger. */
export function useDialog(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void, busy = false) {
  const latest = useRef({ close, busy });
  latest.current = { close, busy };
  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    const trigger = document.activeElement as HTMLElement | null;
    if (stack.length === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    const entry = { id, trigger };
    stack.push(entry);
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(focusable) || []).filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));
    const frame = requestAnimationFrame(() => {
      if (stack.at(-1)?.id === id) (ref.current?.querySelector<HTMLElement>('[data-initial-focus]') || elements()[0] || ref.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (stack.at(-1)?.id !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!latest.current.busy) latest.current.close();
      }
      if (event.key === 'Tab') {
        const items = elements();
        const first = items[0]; const last = items.at(-1);
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown, true);
      const index = stack.findIndex(item => item.id === id); const wasTop = index === stack.length - 1;
      // React may clean up a parent before its nested confirmation. Carry the
      // outer trigger forward so closing both layers restores useful focus.
      if (!wasTop && index >= 0 && entry.trigger?.isConnected) stack[index + 1].trigger = entry.trigger;
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (wasTop && entry.trigger?.isConnected) entry.trigger.focus();
    };
  }, [open, ref]);
}

export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const release = registerSensitiveWork();
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { release(); window.removeEventListener('beforeunload', warn); };
  }, [active]);
}
