import type { SitePhoto } from '../engine/types';

export const MAX_SITE_PHOTOS = 3;
const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling before canvas decode

export function resizeImageToDataUrl(
  file: File,
  options: {
    maxWidth: number;
    maxHeight: number;
    mimeType: 'image/jpeg' | 'image/png';
    quality?: number;
    fillBackground?: string;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Unsupported image type'));
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      reject(new Error('Image file is too large'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(
          1,
          options.maxWidth / Math.max(img.width, 1),
          options.maxHeight / Math.max(img.height, 1)
        );
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
        if (options.fillBackground) {
          ctx.fillStyle = options.fillBackground;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL(options.mimeType, options.quality));
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses a site photo client-side using canvas (max ~1200 px, JPEG ~0.75)
 * so up to 3 photos fit comfortably inside localStorage and PDF exports stay fast.
 */
export async function compressSitePhoto(
  file: File,
  maxDim = 1200,
  quality = 0.75
): Promise<SitePhoto> {
  const dataUrl = await resizeImageToDataUrl(file, {
    maxWidth: maxDim,
    maxHeight: maxDim,
    mimeType: 'image/jpeg',
    quality,
    fillBackground: '#ffffff',
  });
  return {
    id: `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    dataUrl,
    name: file.name.slice(0, 80),
  };
}
