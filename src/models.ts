export const getTimestampMillis = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val?.toMillis === 'function') {
    try {
      return val.toMillis();
    } catch {
      // fallback
    }
  }
  if (typeof val?.getTime === 'function') {
    try {
      return val.getTime();
    } catch {
      // fallback
    }
  }
  if (typeof val?.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000);
  }
  if (typeof val === 'string') {
    if (/^\d+(?:\.\d+)?$/.test(val.trim())) return Number(val);
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export interface FolderData {
  deleting?: boolean;
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  isSample?: boolean;
  ownerId: string;
  createdAt: any;
}

export interface FlashcardData {
  id: string;
  unitId: string;
  cardName: string;
  note?: string;
  frontText: string;
  backText: string;
  frontImageUrl: string;
  backImageUrl: string;
  aspectRatio: number;
  ownerId: string;
  createdAt: any;
  textSize: number;
  textColor?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
  review?: import('./reviewEngine').ReviewData;
  // Legacy schedule fields (kept for list filters and compatibility)
  easeFactor?: number;
  interval?: number;
  nextReview?: number;
}

