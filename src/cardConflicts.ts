import type { FlashcardData } from './models';
import { resolveCardImageUrl } from './sampleCardsData';

export function sameCardContent(a: Partial<FlashcardData>, b: Partial<FlashcardData>): boolean {
  const defaults = { cardName: '', note: '', frontText: '', backText: '', aspectRatio: 1, textSize: 24, textColor: '#ffffff', verticalAlign: 'center' };
  return Object.entries(defaults).every(([key, fallback]) => (a[key] ?? fallback) === (b[key] ?? fallback)) &&
    resolveCardImageUrl(a.frontImageUrl) === resolveCardImageUrl(b.frontImageUrl) &&
    resolveCardImageUrl(a.backImageUrl) === resolveCardImageUrl(b.backImageUrl);
}
export function assertUnchangedCard(current: Partial<FlashcardData>, opened?: Partial<FlashcardData>) {
  if (opened && !sameCardContent(current, opened)) throw new Error('This card was changed elsewhere. Your draft is still here. Copy your changes before reopening the latest card.');
}

/** Compact accidental-change detector, not an authentication/security hash. */
export function cardContentVersion(card: Partial<FlashcardData>): string {
  const source = JSON.stringify([card.unitId || '', card.frontText || '', card.backText || '', resolveCardImageUrl(card.frontImageUrl), resolveCardImageUrl(card.backImageUrl)]);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < source.length; i++) { const c = source.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return `${source.length}:${a >>> 0}:${b >>> 0}`;
}
