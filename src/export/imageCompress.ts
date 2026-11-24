import type { SitePhoto } from '../engine/types';

export const MAX_SITE_PHOTOS = 3;

/**
 * Compresses a site photo client-side using canvas (max ~1200 px, JPEG ~0.75)
 * so up to 3 photos fit comfortably inside localStorage and PDF exports stay fast.
 */
export function compressSitePhoto(
  file: File,
  maxDim = 1200,
  quality = 0.75
): Promise<SitePhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          id: `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl,
          name: file.name.slice(0, 80),
        });
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}
