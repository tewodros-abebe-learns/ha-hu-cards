/** Cheap signature checks before encoding/retaining archive images. Not a full decoder. */
export function validateRasterSignature(bytes: Uint8Array, mime: string): void {
  const starts = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const valid = mime === 'image/png' ? starts(137, 80, 78, 71, 13, 10, 26, 10) :
    mime === 'image/jpeg' ? starts(255, 216, 255) :
    mime === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) :
    mime === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' : false;
  if (!valid) throw new Error('An embedded image is damaged or does not match its declared format. Nothing was imported.');
}
