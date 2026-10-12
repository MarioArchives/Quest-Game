// In-memory files: path → data URL, so photos work with no storage service.
import type { DemoFile } from '../../../functions/src/shared/demo/index.ts';
import { BackendError } from '../errors';
import type { FilesApi } from '../types';

export interface MockFiles extends FilesApi {
  /** Stores a demo file (SVG text). */
  putDemo(file: DemoFile): void;
  /** Deletes every file whose path starts with one of the prefixes. */
  wipe(prefixes: string[]): void;
}

async function toDataUrl(blob: Blob, contentType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${contentType};base64,${btoa(binary)}`;
}

export function createMockFiles(): MockFiles {
  const files = new Map<string, { contentType: string; url: string }>();
  return {
    async upload(path, blob, metadata, onProgress) {
      files.set(path, { contentType: metadata.contentType, url: await toDataUrl(blob, metadata.contentType) });
      onProgress?.(blob.size, blob.size);
    },
    async url(path) {
      const file = files.get(path);
      if (!file) throw new BackendError('files', 'storage/object-not-found', `No file at ${path}.`);
      return file.url;
    },
    putDemo({ path, contentType, text }) {
      const base = contentType === 'image/svg+xml' ? `${contentType};charset=utf-8` : contentType;
      files.set(path, { contentType, url: `data:${base},${encodeURIComponent(text)}` });
    },
    wipe(prefixes) {
      for (const path of [...files.keys()]) if (prefixes.some((p) => path.startsWith(p))) files.delete(path);
    },
  };
}
