// The police's number into the phone's contacts (from the UI mocks' calling card), without a file landing in Downloads
// where that can be helped: on Android the phone app opens with the number typed in, one tap from "Create new contact"
// (Chrome won't open the Contacts editor from a web page); elsewhere the engine's contact card (a .vcf named after
// settings.policeCallerName), which an iPhone opens as a contact. And copying the number, for a phone that won't do either.
import { saveContact } from '../../../lib/policeContact';

/** How the contact went over: the number into the phone app (Android), or the contact card (anything else). */
export type Added = 'dialler' | 'card';

/** Adds the police to the phone's contacts, the best way the phone allows. Call it from a tap, or it may be blocked. */
export async function addContact(name: string, number: string): Promise<Added> {
  if (/Android/i.test(navigator.userAgent)) {
    // Opens the dialler with the number in; it doesn't ring until they press call.
    window.location.href = `tel:${number}`;
    return 'dialler';
  }
  await saveContact(name, number);
  return 'card';
}

/**
 * Copies text: the Clipboard API where there is one (only on https), else a hidden textarea and execCommand, which
 * still works on a phone opening a dev server over plain http. Resolves false if neither worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* refused (permissions, an iframe): try the old way */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Off screen, and 16px so an iPhone doesn't zoom to it.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px;opacity:0';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
