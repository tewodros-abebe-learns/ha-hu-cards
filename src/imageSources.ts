const sampleNames = /^(physics_1|biology_dna|biology_heart|chemo_acid_base)_(front|back)$/;
export function validateImageSource(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 500000 || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error('Invalid image URL.');
  if (sampleNames.test(value)) return value;
  if (/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) return value;
  // Only same-origin absolute paths, not protocol-relative network URLs.
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return value;
  } catch { /* reject malformed and unsupported schemes below */ }
  throw new Error('Unsupported image URL. Use a raster data image, an app path, or an HTTP(S) URL without credentials.');
}
