// Client-side photo handling: decode, downscale on a canvas (which also strips EXIF), re-encode
// as JPEG, then upload with progress. The pure geometry lives in ./image.ts.
import { getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '../firebase';
import { AVATAR_SIZE, fitWithin, JPEG_QUALITY, PHOTO_MAX_EDGE, squareCrop, THUMB_MAX_EDGE } from './image';

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF orientation so portrait phone photos are not sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function drawn(decoded: Decoded, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process photos.');
  ctx.fillStyle = '#ffffff'; // flatten transparency (PNG) before JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return canvas;
}

export interface CompressedPhoto {
  image: Blob;
  thumb: Blob;
}

/** A submission photo: long edge <= 1600 px plus a 400 px thumbnail, both JPEG. */
export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const decoded = await decode(file);
  try {
    const full = fitWithin(decoded.width, decoded.height, PHOTO_MAX_EDGE);
    const small = fitWithin(decoded.width, decoded.height, THUMB_MAX_EDGE);
    const image = await toJpeg(drawn(decoded, full.width, full.height));
    const thumb = await toJpeg(drawn(decoded, small.width, small.height));
    return { image, thumb };
  } finally {
    decoded.close();
  }
}

/** A 256 px centre-cropped square JPEG for avatars. */
export async function compressAvatar(file: Blob): Promise<Blob> {
  const decoded = await decode(file);
  try {
    const { sx, sy, size } = squareCrop(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot process photos.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await toJpeg(canvas);
  } finally {
    decoded.close();
  }
}

const METADATA = {
  contentType: 'image/jpeg',
  cacheControl: 'public,max-age=31536000,immutable',
} as const;

/** Resumable upload of a JPEG to `path`. Resolves when finished; `onProgress` gets transferred bytes. */
export function uploadJpeg(path: string, blob: Blob, onProgress?: (transferred: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), blob, METADATA);
    task.on(
      'state_changed',
      (snap: UploadTaskSnapshot) => onProgress?.(snap.bytesTransferred, snap.totalBytes),
      reject,
      () => resolve(),
    );
  });
}

/** Uploads an avatar JPEG to avatars/{uid}/{timestamp}.jpg and returns its download URL. */
export async function uploadAvatar(
  uid: string,
  blob: Blob,
  onProgress?: (transferred: number, total: number) => void,
): Promise<string> {
  const path = `avatars/${uid}/${Date.now()}.jpg`;
  await uploadJpeg(path, blob, onProgress);
  return getDownloadURL(ref(storage, path));
}
