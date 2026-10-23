import type { FlashcardData } from './models';
import { resolveCardImageUrl } from './sampleCardsData';

export function sameCardContent(a: Partial<FlashcardData>, b: Partial<FlashcardData>): boolean {
  const defaults = { cardName: '', frontText: '', backText: '', aspectRatio: 1, textSize: 24, textColor: '#ffffff', verticalAlign: 'center' };
  return Object.entries(defaults).every(([key, fallback]) => (a[key] ?? fallback) === (b[key] ?? fallback)) &&
    resolveCardImageUrl(a.frontImageUrl) === resolveCardImageUrl(b.frontImageUrl) &&
    resolveCardImageUrl(a.backImageUrl) === resolveCardImageUrl(b.backImageUrl);
}
export function assertUnchangedCard(current: Partial<FlashcardData>, opened?: Partial<FlashcardData>) {
  if (opened && !sameCardContent(current, opened)) throw new Error('This card was changed elsewhere. Your draft is still here. Copy your changes before reopening the latest card.');
}
