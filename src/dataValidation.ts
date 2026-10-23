import { validateReviewData } from './reviewEngine';
import { validateImageSource } from './imageSources';
import type { FlashcardData } from './models';
const contentKeys = ['unitId', 'cardName', 'note', 'frontText', 'backText', 'frontImageUrl', 'backImageUrl', 'aspectRatio', 'textSize', 'textColor', 'verticalAlign', 'easeFactor', 'interval', 'nextReview', 'review'] as const;
export function validateCardUpdates(input: Record<string, unknown>): Partial<FlashcardData> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid card data.');
  const result: Record<string, unknown> = {};
  for (const key of contentKeys) if (input[key] !== undefined) result[key] = input[key];
  for (const [key, max] of Object.entries({ cardName: 200, note: 1000, frontText: 2000, backText: 2000, frontImageUrl: 500000, backImageUrl: 500000, textColor: 32 })) {
    if (key in result && (typeof result[key] !== 'string' || (result[key] as string).length > max)) throw new Error(`${key} must be text with at most ${max} characters.`);
  }
  for (const key of ['frontImageUrl', 'backImageUrl']) {
    if (key in result) validateImageSource(result[key]);
  }
  for (const [key, min, max] of [['aspectRatio', 0.001, 10], ['textSize', 8, 120], ['easeFactor', 1, 10], ['interval', 0, 100000], ['nextReview', 0, Number.MAX_SAFE_INTEGER]] as const) {
    const value = result[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`Invalid ${key}.`);
  }
  if ('verticalAlign' in result && !['top', 'center', 'bottom'].includes(result.verticalAlign as string)) throw new Error('Invalid text alignment.');
  if ('unitId' in result && (typeof result.unitId !== 'string' || !/^[\w-]{1,128}$/.test(result.unitId))) throw new Error('Invalid destination folder.');
  if ('review' in result) validateReviewData(result.review);
  return result;
}
