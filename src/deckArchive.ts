import JSZip from 'jszip';
import { FlashcardData } from './App';

export interface ExportDeckManifest {
  type: 'zencards-deck' | 'zencards-export';
  version: number;
  deckName: string;
  cardCount: number;
  exportedAt: string;
  cards: Array<Partial<FlashcardData> & {
    frontImageFile?: string;
    backImageFile?: string;
  }>;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_CARDS_PER_DECK = 1000;
const MAX_TEXT_LENGTH = 4000;
const MAX_NAME_LENGTH = 200;

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen).replace(/\0/g, '');
}

// Convert data URL (e.g. data:image/jpeg;base64,...) to Uint8Array or Blob
export function dataUrlToBinary(dataUrl: string): { data: Uint8Array; mimeType: string; extension: string } | null {
  try {
    const match = dataUrl.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.*)$/i);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const base64Data = match[3];
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    
    // Guard against excessive single-image memory consumption (e.g. > 15MB)
    if (len > 15 * 1024 * 1024) {
      console.warn('Image payload exceeds safe threshold');
      return null;
    }

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    let extension = 'jpg';
    if (mimeType.includes('png')) extension = 'png';
    else if (mimeType.includes('webp')) extension = 'webp';
    else if (mimeType.includes('gif')) extension = 'gif';
    return { data: bytes, mimeType, extension };
  } catch (e) {
    console.error('Failed to convert dataUrl to binary:', e);
    return null;
  }
}

// Export cards as a highly compressed ZIP package
export async function exportDeckAsZip(
  deckName: string,
  cardsToExport: FlashcardData[],
  onProgress?: (percent: number, status: string) => void
): Promise<Blob> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');
  
  const manifestCards: Array<Partial<FlashcardData> & { frontImageFile?: string; backImageFile?: string }> = [];

  const safeDeckName = sanitizeString(deckName, MAX_NAME_LENGTH) || 'Flashcards_Deck';
  const total = Math.min(cardsToExport.length, MAX_CARDS_PER_DECK);

  for (let i = 0; i < total; i++) {
    const card = cardsToExport[i];
    const { id, unitId, ownerId, createdAt, nextReview, interval, easeFactor, ...rest } = card;
    
    let frontImageFile: string | undefined = undefined;
    let backImageFile: string | undefined = undefined;

    // Handle Front Image
    if (card.frontImageUrl && card.frontImageUrl.startsWith('data:image/')) {
      const converted = dataUrlToBinary(card.frontImageUrl);
      if (converted && imgFolder) {
        const fileName = `card_${i + 1}_front.${converted.extension}`;
        imgFolder.file(fileName, converted.data);
        frontImageFile = `images/${fileName}`;
      }
    }

    // Handle Back Image
    if (card.backImageUrl && card.backImageUrl.startsWith('data:image/')) {
      const converted = dataUrlToBinary(card.backImageUrl);
      if (converted && imgFolder) {
        const fileName = `card_${i + 1}_back.${converted.extension}`;
        imgFolder.file(fileName, converted.data);
        backImageFile = `images/${fileName}`;
      }
    }

    manifestCards.push({
      ...rest,
      cardName: card.cardName ? sanitizeString(card.cardName, MAX_NAME_LENGTH) : undefined,
      frontText: card.frontText ? sanitizeString(card.frontText, MAX_TEXT_LENGTH) : undefined,
      backText: card.backText ? sanitizeString(card.backText, MAX_TEXT_LENGTH) : undefined,
      frontImageUrl: frontImageFile ? undefined : (card.frontImageUrl ? sanitizeString(card.frontImageUrl, 500000) : undefined),
      backImageUrl: backImageFile ? undefined : (card.backImageUrl ? sanitizeString(card.backImageUrl, 500000) : undefined),
      frontImageFile,
      backImageFile
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / (total + 1)) * 80), `Packaging card ${i + 1} of ${total}...`);
    }
  }

  const manifest: ExportDeckManifest = {
    type: 'zencards-deck',
    version: 2,
    deckName: safeDeckName,
    cardCount: total,
    exportedAt: new Date().toISOString(),
    cards: manifestCards
  };

  zip.file('deck.json', JSON.stringify(manifest, null, 2));

  if (onProgress) {
    onProgress(90, 'Compressing archive...');
  }

  const blob = await zip.generateAsync(
    { 
      type: 'blob', 
      compression: 'DEFLATE', 
      compressionOptions: { level: 6 } 
    },
    (metadata) => {
      if (onProgress) {
        onProgress(90 + Math.round(metadata.percent * 0.1), `Compressing: ${Math.round(metadata.percent)}%`);
      }
    }
  );

  return blob;
}

// Parse imported deck from either a .zip or a legacy .json file
export async function parseImportDeckFile(
  file: File,
  onProgress?: (percent: number, status: string) => void
): Promise<{ deckName: string; cards: Partial<FlashcardData>[] }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 50MB.`);
  }

  const fileName = file.name.toLowerCase();

  // If JSON file
  if (fileName.endsWith('.json')) {
    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file. Please ensure the file is not corrupted.');
    }

    if (!data.cards || !Array.isArray(data.cards)) {
      throw new Error('Invalid ZenCards JSON format: missing cards list.');
    }

    const deckName = sanitizeString(data.deckName || file.name.replace(/\.json$/i, '').replace(/_/g, ' '), MAX_NAME_LENGTH) || 'Imported Deck';
    
    const sanitizedCards = data.cards.slice(0, MAX_CARDS_PER_DECK).map((c: any) => ({
      cardName: sanitizeString(c.cardName, MAX_NAME_LENGTH) || undefined,
      frontText: sanitizeString(c.frontText, MAX_TEXT_LENGTH) || '',
      backText: sanitizeString(c.backText, MAX_TEXT_LENGTH) || '',
      frontImageUrl: typeof c.frontImageUrl === 'string' && c.frontImageUrl.length <= 500000 ? c.frontImageUrl : undefined,
      backImageUrl: typeof c.backImageUrl === 'string' && c.backImageUrl.length <= 500000 ? c.backImageUrl : undefined,
      aspectRatio: typeof c.aspectRatio === 'number' && c.aspectRatio > 0 && c.aspectRatio <= 10 ? c.aspectRatio : undefined,
      textSize: typeof c.textSize === 'number' && c.textSize >= 8 && c.textSize <= 120 ? c.textSize : undefined,
      textColor: typeof c.textColor === 'string' ? sanitizeString(c.textColor, 32) : undefined,
      verticalAlign: ['top', 'center', 'bottom'].includes(c.verticalAlign) ? c.verticalAlign : 'center',
    }));

    return {
      deckName,
      cards: sanitizedCards
    };
  }

  // If ZIP archive
  if (fileName.endsWith('.zip') || fileName.endsWith('.zencards')) {
    if (onProgress) onProgress(10, 'Unpacking zip archive...');
    
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new Error('Could not open the zip archive. The file may be damaged.');
    }

    // Look for deck.json or any *.json manifest
    let jsonFile = zip.file('deck.json');
    if (!jsonFile) {
      const jsonFiles = zip.file(/\.json$/i);
      if (jsonFiles.length > 0) {
        jsonFile = jsonFiles[0];
      }
    }

    if (!jsonFile) {
      throw new Error('Invalid ZenCards ZIP archive: missing deck.json');
    }

    const manifestText = await jsonFile.async('text');
    let manifest: ExportDeckManifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new Error('Corrupted deck.json in ZIP archive.');
    }

    if (!manifest.cards || !Array.isArray(manifest.cards)) {
      throw new Error('Invalid manifest: missing cards array.');
    }

    const loadedCards: Partial<FlashcardData>[] = [];
    const total = Math.min(manifest.cards.length, MAX_CARDS_PER_DECK);

    for (let i = 0; i < total; i++) {
      const rawCard = manifest.cards[i];
      let frontUrl = rawCard.frontImageUrl || '';
      let backUrl = rawCard.backImageUrl || '';

      // Reconstitute Front Image if stored as file in zip (guard against path traversal like ../)
      if (rawCard.frontImageFile && !rawCard.frontImageFile.includes('..')) {
        const entry = zip.file(rawCard.frontImageFile);
        if (entry) {
          const isPng = rawCard.frontImageFile.endsWith('.png');
          const isWebp = rawCard.frontImageFile.endsWith('.webp');
          const isGif = rawCard.frontImageFile.endsWith('.gif');
          const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/jpeg';
          const base64 = await entry.async('base64');
          if (base64.length <= 15 * 1024 * 1024) {
            frontUrl = `data:${mime};base64,${base64}`;
          }
        }
      }

      // Reconstitute Back Image if stored as file in zip (guard against path traversal like ../)
      if (rawCard.backImageFile && !rawCard.backImageFile.includes('..')) {
        const entry = zip.file(rawCard.backImageFile);
        if (entry) {
          const isPng = rawCard.backImageFile.endsWith('.png');
          const isWebp = rawCard.backImageFile.endsWith('.webp');
          const isGif = rawCard.backImageFile.endsWith('.gif');
          const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/jpeg';
          const base64 = await entry.async('base64');
          if (base64.length <= 15 * 1024 * 1024) {
            backUrl = `data:${mime};base64,${base64}`;
          }
        }
      }

      const { frontImageFile, backImageFile, ...cleanCard } = rawCard;

      loadedCards.push({
        ...cleanCard,
        cardName: sanitizeString(cleanCard.cardName, MAX_NAME_LENGTH) || undefined,
        frontText: sanitizeString(cleanCard.frontText, MAX_TEXT_LENGTH) || '',
        backText: sanitizeString(cleanCard.backText, MAX_TEXT_LENGTH) || '',
        frontImageUrl: frontUrl.length <= 500000 ? frontUrl : undefined,
        backImageUrl: backUrl.length <= 500000 ? backUrl : undefined,
        aspectRatio: typeof cleanCard.aspectRatio === 'number' && cleanCard.aspectRatio > 0 && cleanCard.aspectRatio <= 10 ? cleanCard.aspectRatio : undefined,
        textSize: typeof cleanCard.textSize === 'number' && cleanCard.textSize >= 8 && cleanCard.textSize <= 120 ? cleanCard.textSize : undefined,
        textColor: typeof cleanCard.textColor === 'string' ? sanitizeString(cleanCard.textColor, 32) : undefined,
        verticalAlign: ['top', 'center', 'bottom'].includes(cleanCard.verticalAlign as string) ? cleanCard.verticalAlign : 'center',
      });

      if (onProgress) {
        onProgress(20 + Math.round(((i + 1) / total) * 70), `Extracted ${i + 1} of ${total} cards...`);
      }
    }

    const deckName = sanitizeString(manifest.deckName || file.name.replace(/\.zip$/i, '').replace(/_/g, ' '), MAX_NAME_LENGTH) || 'Imported Deck';

    return {
      deckName,
      cards: loadedCards
    };
  }

  throw new Error('Unsupported file format. Please upload a .zip or .json ZenCards deck.');
}

