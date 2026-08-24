import { type Crop } from 'react-image-crop';

export async function getCroppedImg(
  image: HTMLImageElement,
  crop: Crop,
  fileName: string
): Promise<File> {
  const canvas = document.createElement('canvas');

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Image dimensions are invalid');
  }

  // Convert crop to percentages to be immune to DOM fractional pixel scaling
  let percentX = 0;
  let percentY = 0;
  let percentWidth = 1;
  let percentHeight = 1;
  
  if (crop.unit === '%') {
    percentX = Math.max(0, (crop.x || 0) / 100);
    percentY = Math.max(0, (crop.y || 0) / 100);
    percentWidth = Math.min(1, Math.max(0.01, (crop.width || 100) / 100));
    percentHeight = Math.min(1, Math.max(0.01, (crop.height || 100) / 100));
  } else {
    const renderedWidth = image.width || image.naturalWidth;
    const renderedHeight = image.height || image.naturalHeight;
    percentX = Math.max(0, (crop.x || 0) / renderedWidth);
    percentY = Math.max(0, (crop.y || 0) / renderedHeight);
    percentWidth = Math.min(1, Math.max(0.01, (crop.width || renderedWidth) / renderedWidth));
    percentHeight = Math.min(1, Math.max(0.01, (crop.height || renderedHeight) / renderedHeight));
  }

  // Calculate the actual dimensions on the natural image
  const targetX = Math.max(0, Math.floor(percentX * image.naturalWidth));
  const targetY = Math.max(0, Math.floor(percentY * image.naturalHeight));
  const targetWidth = Math.max(10, Math.min(image.naturalWidth - targetX, Math.floor(percentWidth * image.naturalWidth)));
  const targetHeight = Math.max(10, Math.min(image.naturalHeight - targetY, Math.floor(percentHeight * image.naturalHeight)));

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D rendering context unavailable');
  }

  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas image conversion returned empty blob'));
          return;
        }
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        resolve(file);
      },
      'image/jpeg',
      0.95
    );
  });
}

