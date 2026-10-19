import { describe, expect, it } from 'vitest';
import { isTelegramPolice, telegramChatLink, telegramStore, telegramUsername } from './telegram';

describe('telegramUsername', () => {
  it('takes the bare name from a name, an @name or a t.me link', () => {
    for (const input of ['MancMetPolice', '@MancMetPolice', ' t.me/MancMetPolice ', 'https://t.me/MancMetPolice', 'https://telegram.me/MancMetPolice/', 't.me/MancMetPolice?text=hi']) {
      expect(telegramUsername(input), input).toBe('MancMetPolice');
    }
  });

  it("refuses what Telegram wouldn't take as a username", () => {
    for (const input of ['', '@', 'abcd', '1police', 'manc met police', 'police-desk', 'x'.repeat(33), '+447700900123']) {
      expect(telegramUsername(input), input).toBeNull();
    }
    expect(telegramUsername('abcde')).toBe('abcde');
    expect(telegramUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });
});

describe('telegramChatLink', () => {
  it('opens the chat, with the message typed in when there is one', () => {
    expect(telegramChatLink('MancMetPolice')).toBe('https://t.me/MancMetPolice');
    expect(telegramChatLink('+447700900456', 'Hello')).toBe('https://t.me/+447700900456?text=Hello');
    expect(telegramChatLink('MancMetPolice', 'Reporting for duty. Sam, case 0517 & co?')).toBe(
      'https://t.me/MancMetPolice?text=Reporting%20for%20duty.%20Sam%2C%20case%200517%20%26%20co%3F',
    );
  });
});

describe('telegramStore', () => {
  it('sends an iPhone or iPad to the App Store, Android to Google Play, anything else to Telegram', () => {
    expect(telegramStore('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148').store).toBe('app-store');
    expect(telegramStore('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1').store).toBe('app-store');
    expect(telegramStore('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36').store).toBe('google-play');
    const desktop = telegramStore('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36');
    expect(desktop).toEqual({ store: 'web', label: 'Get Telegram', href: 'https://telegram.org/apps' });
  });
});

describe('isTelegramPolice', () => {
  it('is on when the police have a Telegram username or number that will do, and off otherwise', () => {
    expect(isTelegramPolice({ policeTelegram: 'MancMetPolice', policeTelegramNumber: '' })).toBe(true);
    expect(isTelegramPolice({ policeTelegram: '', policeTelegramNumber: '+447700900456' })).toBe(true);
    expect(isTelegramPolice({ policeTelegram: '', policeTelegramNumber: '' })).toBe(false);
    expect(isTelegramPolice({ policeTelegram: 'cop', policeTelegramNumber: 'nope' })).toBe(false);
    expect(isTelegramPolice({} as never)).toBe(false);
  });
});
