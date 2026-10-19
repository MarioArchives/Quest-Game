// The police as a contact card (packs with police, phone calls on): a .vcf of settings.policeCallerName and the number
// calls come from, with the pack's icon for its picture. Phones offer to add it; a computer saves the file. Used by
// the Police line card and a pack's own screens.
import { policeVCard } from '../shared';

/** The pack's app icon as base64, for the contact card's picture; null when it can't be had. */
async function iconBase64(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}icons/icon-192.png`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } catch {
    return null;
  }
}

/** Downloads the police as a contact (.vcf): phones offer to add it. */
export async function saveContact(name: string, number: string): Promise<void> {
  const card = policeVCard({ name, number, photo: await iconBase64() });
  const url = URL.createObjectURL(new Blob([card], { type: 'text/vcard' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'police'}.vcf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
