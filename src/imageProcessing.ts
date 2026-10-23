export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

export function validateEditorImage(file: Pick<File, 'type' | 'size'>) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.');
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 20MB.');
}
export function boundedImageSize(width: number, height: number, maxDimension = 1600) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0) || width * height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions are too large or invalid. Use an image under 40 megapixels.');
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, blob?: Blob) => {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(blob!);
    };
    const abort = () => finish(new DOMException('Image operation cancelled.', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Image processing timed out. Try a smaller image.')), 15000);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try { canvas.toBlob(blob => signal?.aborted ? abort() : blob ? finish(undefined, blob) : finish(new Error('Could not encode the image.')), type, quality); }
    catch (error) { finish(error instanceof Error ? error : new Error('Could not encode the image.')); }
  });
}

/** Decode from an object URL; only a bounded crop preview enters React state. */
export async function prepareEditorImage(file: File, signal: AbortSignal): Promise<Blob> {
  validateEditorImage(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout); signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new DOMException('Image operation cancelled.', 'AbortError'));
      const timeout = setTimeout(() => finish(new Error('Image loading timed out. Try a smaller image.')), 15000);
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => finish();
      image.onerror = () => finish(new Error('This image could not be decoded. Choose another file.'));
      image.src = url;
    });
    if (signal.aborted) throw new DOMException('Image operation cancelled.', 'AbortError');
    const size = boundedImageSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image editing is unavailable in this browser.');
    ctx.drawImage(image, 0, 0, size.width, size.height);
    return await canvasBlob(canvas, 'image/png', undefined, signal);
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}

export function imageDataUrl(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clean = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const abort = () => { clean(); reader.abort(); reject(new DOMException('Image operation cancelled.', 'AbortError')); };
    const timeout = setTimeout(() => { clean(); reader.abort(); reject(new Error('Image conversion timed out.')); }, 15000);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.onerror = () => { clean(); reject(new Error('Could not read the processed image.')); };
    reader.onload = () => {
      clean();
      if (typeof reader.result !== 'string' || reader.result.length > 500000) reject(new Error('Image is too large to save. Choose a smaller crop.'));
      else resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}
