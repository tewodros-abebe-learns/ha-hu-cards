import { validateRasterSignature } from './rasterValidation';
import { resolveCardImageUrl } from './sampleCardsData';
import { validateImageSource } from './imageSources';
import { validateCardUpdates } from './dataValidation';
import JSZip from 'jszip';
import { FlashcardData } from './models';

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
const MAX_TEXT_LENGTH = 2000;
const MAX_NAME_LENGTH = 200;

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen).replace(/\0/g, '');
}

export function sanitizeImportedCard(card: unknown): Partial<FlashcardData> {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('Invalid card in archive.');
  const c = card as Record<string, unknown>;
  for (const key of ['frontText', 'backText']) {
    if (typeof c[key] === 'string' && c[key].length > MAX_TEXT_LENGTH) throw new Error(`${key} exceeds 2000 characters.`);
  }
  for (const key of ['frontText', 'backText', 'cardName', 'note']) {
    if (c[key] !== undefined && typeof c[key] !== 'string') throw new Error(`Invalid ${key}: expected text.`);
  }

  validateCardUpdates(c);
  return {
    cardName: sanitizeString(c.cardName, 200),
    note: sanitizeString(c.note, 1000),
    frontText: sanitizeString(c.frontText, MAX_TEXT_LENGTH),
    backText: sanitizeString(c.backText, MAX_TEXT_LENGTH),
    frontImageUrl: validateImageSource(c.frontImageUrl), backImageUrl: validateImageSource(c.backImageUrl),
    aspectRatio: typeof c.aspectRatio === 'number' && c.aspectRatio > 0 && c.aspectRatio <= 10 ? c.aspectRatio : 1,
    textSize: typeof c.textSize === 'number' && c.textSize >= 8 && c.textSize <= 120 ? c.textSize : 24,
    textColor: sanitizeString(c.textColor, 32) || '#ffffff',
    verticalAlign: c.verticalAlign === 'top' || c.verticalAlign === 'bottom' ? c.verticalAlign : 'center',
    easeFactor: 2.5, interval: 0, nextReview: Date.now()
  };
}

function validateCardCount(cards: unknown[]): void {
  if (cards.length > MAX_CARDS_PER_DECK) throw new Error('A deck may contain at most 1000 cards. Split it into smaller decks.');
}

function validateManifest(data: any) {
  if (!data || !Array.isArray(data.cards)) throw new Error('Invalid manifest: missing cards array.');
  if (data.type !== undefined && !['zencards-deck', 'zencards-export'].includes(data.type)) throw new Error('Unsupported deck format.');
  if (data.version !== undefined && ![1, 2].includes(data.version)) throw new Error('Unsupported deck version. Update the app before importing.');
  if (data.cardCount !== undefined && data.cardCount !== data.cards.length) throw new Error('Archive card count does not match its contents.');
  validateCardCount(data.cards);
}
function imageMime(path: string) {
  if (!/^[\w./-]+\.(png|jpe?g|webp|gif)$/i.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid image path in archive.');
  const extension = path.split('.').pop()!.toLowerCase();
  return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
}
function checkImageBudget(cards: Partial<FlashcardData>[]) {
  const size = cards.reduce((sum, card) => sum + (card.frontImageUrl?.length || 0) + (card.backImageUrl?.length || 0), 0);
  if (size > 50 * 1024 * 1024) throw new Error('Expanded deck exceeds 50MB. Split it into smaller decks.');
}

// Bound output while decompressing, not after allocating a potentially huge archive entry.
function readEntry(entry: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let failed = false;
    // JSZip exposes internalStream at runtime but omits it from JSZipObject's typings.
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) { failed = true; chunks.length = 0; stream.pause(); reject(new Error('Archive entry exceeds the safe size limit.')); return; }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (failed) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resolve(bytes);
    });
    stream.resume();
  });
}

async function readImage(entry: JSZip.JSZipObject, mime: string): Promise<string> {
  const bytes = await readEntry(entry, 375000);
  validateRasterSignature(bytes, mime);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

// Convert data URL (e.g. data:image/jpeg;base64,...) to Uint8Array or Blob
export function dataUrlToBinary(dataUrl: string): { data: Uint8Array; mimeType: string; extension: string } | null {
  try {
    if (dataUrl.length > 500000) return null;
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
    validateRasterSignature(bytes, mimeType);
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
  validateCardCount(cardsToExport);
  const zip = new JSZip();
  const imgFolder = zip.folder('images');

  const manifestCards: Array<Partial<FlashcardData> & { frontImageFile?: string; backImageFile?: string }> = [];

  const safeDeckName = sanitizeString(deckName, MAX_NAME_LENGTH) || 'Flashcards_Deck';
  const total = Math.min(cardsToExport.length, MAX_CARDS_PER_DECK);

  let imageBudget = 0;
  for (let i = 0; i < total; i++) {
    const source = cardsToExport[i];
    const card = { ...source, frontImageUrl: resolveCardImageUrl(source.frontImageUrl), backImageUrl: resolveCardImageUrl(source.backImageUrl) };
    if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    validateCardUpdates(card as unknown as Record<string, unknown>);
    imageBudget += (card.frontImageUrl?.length || 0) + (card.backImageUrl?.length || 0);
    if (imageBudget > 50 * 1024 * 1024) throw new Error('Deck images exceed 50MB. Export smaller selections.');
    const { unitId, nextReview, interval, easeFactor, review, ...rest } = validateCardUpdates(card as unknown as Record<string, unknown>);

    let frontImageFile: string | undefined = undefined;
    let backImageFile: string | undefined = undefined;

    // Handle Front Image
    if (card.frontImageUrl && /^data:image\//i.test(card.frontImageUrl)) {
      const converted = dataUrlToBinary(card.frontImageUrl);
      if (!converted) throw new Error('Cannot export an invalid or unsupported embedded image.');
      if (imgFolder) {
        const fileName = `card_${i + 1}_front.${converted.extension}`;
        imgFolder.file(fileName, converted.data, { compression: 'STORE' });
        frontImageFile = `images/${fileName}`;
      }
    }

    // Handle Back Image
    if (card.backImageUrl && /^data:image\//i.test(card.backImageUrl)) {
      const converted = dataUrlToBinary(card.backImageUrl);
      if (!converted) throw new Error('Cannot export an invalid or unsupported embedded image.');
      if (imgFolder) {
        const fileName = `card_${i + 1}_back.${converted.extension}`;
        imgFolder.file(fileName, converted.data, { compression: 'STORE' });
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

  const manifestJson = JSON.stringify(manifest, null, 2);
  if (new TextEncoder().encode(manifestJson).length > 10 * 1024 * 1024) throw new Error('Deck manifest is too large. Export smaller selections.');
  zip.file('deck.json', manifestJson);

  if (onProgress) {
    onProgress(90, 'Compressing archive...');
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 3 }
    },
    (metadata) => {
      if (onProgress) {
        onProgress(90 + Math.round(metadata.percent * 0.1), `Compressing: ${Math.round(metadata.percent)}%`);
      }
    }
  );

  if (blob.size > MAX_FILE_SIZE_BYTES) throw new Error('Archive exceeds 50MB. Export smaller selections.');
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

    if (!data || !data.cards || !Array.isArray(data.cards)) {
      throw new Error('Invalid ZenCards JSON format: missing cards list.');
    }

    const deckName = sanitizeString(data.deckName || file.name.replace(/\.json$/i, '').replace(/_/g, ' '), 100) || 'Imported Deck';

    validateManifest(data);
    if (data.cards.some((card: any) => card?.frontImageFile !== undefined || card?.backImageFile !== undefined)) throw new Error('This JSON references image files. Import the complete ZIP instead.');
    const sanitizedCards = data.cards.map(sanitizeImportedCard);
    checkImageBudget(sanitizedCards);
    for (const card of sanitizedCards) {
      for (const image of [card.frontImageUrl, card.backImageUrl]) if (image && /^data:/i.test(image) && !dataUrlToBinary(image)) throw new Error('An embedded image is invalid or damaged.');
    }

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
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
      throw new Error('Could not open the zip archive. The file may be damaged.');
    }

    if (Object.keys(zip.files).length > 2100) throw new Error('Archive has too many entries.');
    // Look for deck.json or any *.json manifest
    let jsonFile = zip.file('deck.json');
    if (!jsonFile) {
      const jsonFiles = zip.file(/\.json$/i);
      if (jsonFiles.length > 1) throw new Error('Archive contains multiple manifests. Include a single deck.json.');
      if (jsonFiles.length > 0) {
        jsonFile = jsonFiles[0];
      }
    }

    if (!jsonFile) {
      throw new Error('Invalid ZenCards ZIP archive: missing deck.json');
    }

    const manifestText = new TextDecoder().decode(await readEntry(jsonFile, 10 * 1024 * 1024));
    let manifest: ExportDeckManifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new Error('Corrupted deck.json in ZIP archive.');
    }

    if (!manifest || !manifest.cards || !Array.isArray(manifest.cards)) {
      throw new Error('Invalid manifest: missing cards array.');
    }

    validateManifest(manifest);
    const loadedCards: Partial<FlashcardData>[] = [];
    const total = Math.min(manifest.cards.length, MAX_CARDS_PER_DECK);
    let totalImageCharacters = 0;

    for (let i = 0; i < total; i++) {
      const rawCard = manifest.cards[i];
      if (!rawCard || typeof rawCard !== 'object') throw new Error('Invalid card in archive.');
      for (const path of [rawCard.frontImageFile, rawCard.backImageFile]) {
        if (path !== undefined && (typeof path !== 'string' || path.includes('..') || path.startsWith('/'))) throw new Error('Invalid image path in archive.');
      }
      let frontUrl = rawCard.frontImageUrl || '';
      let backUrl = rawCard.backImageUrl || '';

      // Reconstitute Front Image if stored as file in zip (guard against path traversal like ../)
      if (typeof rawCard.frontImageFile === 'string' && !rawCard.frontImageFile.includes('..')) {
        const entry = zip.file(rawCard.frontImageFile);
        if (!entry) throw new Error('Archive is missing a referenced front image.');
        if (entry) {
          const mime = imageMime(rawCard.frontImageFile);
          const base64 = await readImage(entry, mime);
          if (`data:${mime};base64,${base64}`.length > 500000) throw new Error('Image is too large. Compress it before importing.');
          if (`data:${mime};base64,${base64}`.length <= 500000) {
            frontUrl = `data:${mime};base64,${base64}`;
          }
        }
      }

      // Reconstitute Back Image if stored as file in zip (guard against path traversal like ../)
      if (typeof rawCard.backImageFile === 'string' && !rawCard.backImageFile.includes('..')) {
        const entry = zip.file(rawCard.backImageFile);
        if (!entry) throw new Error('Archive is missing a referenced back image.');
        if (entry) {
          const mime = imageMime(rawCard.backImageFile);
          const base64 = await readImage(entry, mime);
          if (`data:${mime};base64,${base64}`.length > 500000) throw new Error('Image is too large. Compress it before importing.');
          if (`data:${mime};base64,${base64}`.length <= 500000) {
            backUrl = `data:${mime};base64,${base64}`;
          }
        }
      }

      const { frontImageFile, backImageFile, ...cleanCard } = rawCard;

      totalImageCharacters += (typeof frontUrl === 'string' ? frontUrl.length : 0) + (typeof backUrl === 'string' ? backUrl.length : 0);
      if (totalImageCharacters > 50 * 1024 * 1024) throw new Error('Expanded deck exceeds 50MB. Split it into smaller decks.');
      const sanitized = sanitizeImportedCard({ ...cleanCard, frontImageUrl: frontUrl, backImageUrl: backUrl });
      for (const [image, reference] of [[sanitized.frontImageUrl, frontImageFile], [sanitized.backImageUrl, backImageFile]]) {
        if (!reference && image && /^data:/i.test(image) && !dataUrlToBinary(image)) throw new Error('An embedded image is invalid or damaged.');
      }
      loadedCards.push(sanitized);

      if (onProgress) {
        onProgress(20 + Math.round(((i + 1) / total) * 70), `Extracted ${i + 1} of ${total} cards...`);
      }
    }

    const deckName = sanitizeString(manifest.deckName || file.name.replace(/\.(zip|zencards)$/i, '').replace(/_/g, ' '), 100) || 'Imported Deck';

    return {
      deckName,
      cards: loadedCards
    };
  }

  throw new Error('Unsupported file format. Please upload a .zip or .json ZenCards deck.');
}

