// Mystery Pub Crawl: a murder-mystery crawl where everyone tampers with the evidence. Tampering missions are
// witnessed, group missions are photo challenges, and every confirmed mission ends in destroying evidence or
// framing a fellow suspect. Each player has a character with a secret motive. Venues come later.
import type { GamePack } from '../types.ts';
import quests from './quests.json' with { type: 'json' };

export const mystery: GamePack = {
  id: 'mystery',
  name: 'Mystery Pub Crawl',
  description: 'A murder at Blackwood Manor, a pub crawl full of suspects, and evidence to tamper with.',
  terms: {
    quest: { one: 'tampering mission', many: 'tampering missions' },
    sideQuest: { one: 'group mission', many: 'group missions' },
    witness: { one: 'witness', many: 'witnesses' },
    claim: { one: 'submission', many: 'submissions' },
    gm: { one: 'GM', many: 'GMs' },
    wrap: { one: 'case file', many: 'case files' },
  },
  features: { guesses: true, sideQuests: true, map: true, rewardChoice: true, characters: true },
  timeZone: 'Europe/London',
  locale: 'en-GB',
  scoring: 'classic',
  settings: {
    guessLimit: 3,
    sideQuestSkipPenalty: 25,
    cleanPoints: 50,
    framePoints: 50,
    pointsFloorZero: false,
  },
  awards: {
    sharpshooter: { title: 'Master Interrogator', description: 'Cracked the most secret missions' },
    untouchable: { title: 'Perfect Alibi', description: 'Nobody saw through your missions' },
    paparazzo: { title: 'Crime Scene Photographer', description: 'Most approved photos for the file' },
    'night-owl': { title: 'Last Seen Alive', description: 'The final photo of the night' },
    'side-hustler': { title: 'Ringleader', description: 'Won the most group missions' },
    globetrotter: { title: 'Prime Suspect on the Move', description: 'Left evidence in the most pubs' },
    detective: { title: 'Chief Inspector', description: 'Made the most accusations' },
    gambler: { title: 'Cold Case Shuffler', description: 'Swapped the most missions' },
    'good-sport': { title: 'Innocent Bystander', description: 'Nothing to see here, officer' },
  },
  catalogue: quests,
  map: { centre: { lat: 54.0466, lng: -2.8007 }, zoom: 15, placeName: 'the crawl', nearbyKm: 2, credit: null },
  venues: [],
  demoCharacters: [
    {
      name: 'Lady Violet Ashcombe',
      role: 'Niece of the deceased',
      motive: 'Lord Blackwood was about to cut her out of his will, and she needs the new draft to go missing.',
    },
    {
      name: 'Dr Rupert Fenwick',
      role: 'Family physician',
      motive: 'He signed a death certificate too quickly, and someone must not look at it too closely.',
    },
    {
      name: 'Marguerite Delacroix',
      role: 'Housekeeper of Blackwood Manor',
      motive: 'She knows what was in the study safe and has already taken the one thing that could name her.',
    },
    {
      name: 'Captain Alistair Thorne',
      role: 'Old army friend of the deceased',
      motive: 'He owed Lord Blackwood a fortune, and the only record of the debt was in the late lord\'s desk.',
    },
  ],
};
