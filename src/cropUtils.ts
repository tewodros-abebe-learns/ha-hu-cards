import { canvasBlob } from './imageProcessing';
import { type Crop } from 'react-image-crop';

export function getCropBounds(image: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight' | 'width' | 'height'>, crop: Crop) {
  const { naturalWidth: nw, naturalHeight: nh } = image;
  if (!(nw > 0 && nh > 0) || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) throw new Error('Invalid crop dimensions');
  const scaleX = crop.unit === '%' ? nw / 100 : nw / (image.width || nw);
  const scaleY = crop.unit === '%' ? nh / 100 : nh / (image.height || nh);
  const x = Math.max(0, Math.min(nw - 1, Math.floor(crop.x * scaleX)));
  const y = Math.max(0, Math.min(nh - 1, Math.floor(crop.y * scaleY)));
  const width = Math.max(1, Math.min(nw - x, Math.floor(crop.width * scaleX)));
  const height = Math.max(1, Math.min(nh - y, Math.floor(crop.height * scaleY)));
  return { x, y, width, height };
}

export async function getCroppedImg(image: HTMLImageElement, crop: Crop, fileName: string, signal?: AbortSignal): Promise<File> {
  const bounds = getCropBounds(image, crop);
  const canvas = document.createElement('canvas');
  // Bound canvas allocation before compression, including very large phone photos.
  const scale = Math.min(1, 800 / Math.max(bounds.width, bounds.height));
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.65, 0.45]) {
    const blob = await canvasBlob(canvas, 'image/jpeg', quality, signal);
    // Keep the final base64 representation within the storage/rule limit.
    if (blob.size <= 374950) return new File([blob], fileName, { type: 'image/jpeg' });
  }
  throw new Error('Image is too detailed to save. Select a smaller crop.');
}
