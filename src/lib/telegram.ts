// Telegram links for a police line on Telegram (settings.policeTelegram / policeTelegramNumber): the account's username
// tidied from whatever the GM pasted, a link that opens its chat (by username, or by phone number for an account with
// none) with a message already typed, and where to get Telegram on this phone.

/** A Telegram username: 5 to 32 letters, digits and underscores, starting with a letter. */
const USERNAME = /^[a-z][a-z0-9_]{4,31}$/i;

/** The bare username from "name", "@name", "t.me/name" or "https://t.me/name", or null when it isn't one. */
export function telegramUsername(input: string): string | null {
  const bare = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  return USERNAME.test(bare) ? bare : null;
}

/**
 * Opens the chat with an account in Telegram (or Telegram's own page offering the app, where it isn't installed): by
 * its username, or by its E.164 number (`+44…`) for an account without one, which works while the account lets
 * anyone find it by its number.
 */
export function telegramChatLink(account: string, text?: string): string {
  const path = account.startsWith('+') ? `+${account.slice(1).replace(/\D/g, '')}` : account;
  return `https://t.me/${path}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export interface StoreLink {
  store: 'app-store' | 'google-play' | 'web';
  label: string;
  href: string;
}

/** Where to get Telegram on this device: the App Store on an iPhone or iPad, Google Play on Android, else Telegram's apps page. */
export function telegramStore(userAgent: string): StoreLink {
  // iPadOS asks for the desktop site, so it says "Macintosh"; only a touch screen gives it away.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) {
    return { store: 'app-store', label: 'Get it on the App Store', href: 'https://apps.apple.com/app/telegram-messenger/id686449807' };
  }
  if (/Android/i.test(userAgent)) {
    return { store: 'google-play', label: 'Get it on Google Play', href: 'https://play.google.com/store/apps/details?id=org.telegram.messenger' };
  }
  return { store: 'web', label: 'Get Telegram', href: 'https://telegram.org/apps' };
}
