import { validateCardUpdates } from './dataValidation';
import type { FlashcardData } from './models';
export interface EditorDraft { fields: Partial<FlashcardData>; baseline?: FlashcardData; timestamp: number }
export function parseEditorDraft(raw: string | null): EditorDraft | null {
  try {
    if (!raw || raw.length > 2100000) return null;
    const value = JSON.parse(raw);
    if (!Number.isFinite(value.timestamp) || value.timestamp > Date.now() + 60000 || Date.now() - value.timestamp > 7 * 86400000) return null;
    const fields = validateCardUpdates(value.fields);
    if (value.baseline) validateCardUpdates(value.baseline);
    return { fields, baseline: value.baseline, timestamp: value.timestamp };
  } catch { return null; }
}
export function readEditorDraft(key: string) {
  try { return parseEditorDraft(sessionStorage.getItem(key)); } catch { return null; }
}
