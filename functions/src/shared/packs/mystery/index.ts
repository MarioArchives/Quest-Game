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
    checkin: { one: 'periodic mission', many: 'periodic missions' },
  },
  features: { guesses: true, sideQuests: true, map: true, rewardChoice: true, characters: true, stops: true, checkins: true },
  timeZone: 'Europe/London',
  locale: 'en-GB',
  scoring: 'classic',
  // Every move is worth 5 points (the standings grid is ±25 in squares of 5); the GM nudges by 1.
  settings: {
    questPoints: 5,
    sideQuestPoints: 5,
    exposePenalty: 5,
    correctGuessReward: 5,
    wrongGuessCost: 5,
    fraudPenalty: 5,
    rejectPenalty: 5,
    guessLimit: 3,
    sideQuestSkipPenalty: 5,
    cleanPoints: 5,
    framePoints: 5,
    pointsFloorZero: false,
  },
  gmQuickPoints: 1,
  // The periodic mission a seed starts with: a roll call four times a night, an hour apart, 15 minutes to answer
  // with a photo or a comment, 5 off for missing one. The GM edits it, stops it or adds more in the GM console.
  periodics: [
    {
      id: 'roll-call',
      name: 'Roll call',
      intervalMin: 60,
      windowMin: 15,
      penalty: 5,
      count: 4,
      prompts: [
        "Show us what you're drinking",
        'Your alibi: a photo of where you are right now',
        'Your best detective face',
        'Something on your table that could pass for a murder weapon (keep it harmless)',
        'Who did it? Name your prime suspect in one sentence',
        "Rate this pub out of 10, and say why",
        'The most suspicious-looking object in the room',
        'A group photo of everyone at your table pointing at the culprit',
        'The last thing you saw that looked like a clue',
        'Your character, in one line, as they would introduce themselves',
      ],
    },
  ],
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
  map: { centre: { lat: 53.4145, lng: -2.2312 }, zoom: 16, placeName: 'Didsbury', nearbyKm: 2, credit: null, routeStyle: 'footprints' },
  venues: [],
  // The starting route through Didsbury (OpenStreetMap places and addresses). The GM can edit, reorder and reveal it in
  // the app, or swap a stop for another bar from the map's bar search.
  route: [
    { name: 'The Didsbury', lat: 53.41027, lng: -2.23091, address: '852 Wilmslow Road, M20 2SG', placeRef: 'osm:node/27024692' },
    { name: 'Ye Olde Cock Inn', lat: 53.41062, lng: -2.23106, address: '848 Wilmslow Road, M20 2RN', placeRef: 'osm:node/27024693' },
    { name: 'The Crown', lat: 53.41571, lng: -2.23219, address: '770 Wilmslow Road, M20 2DR', placeRef: 'osm:node/27465378' },
    { name: 'The Royal Oak', lat: 53.41636, lng: -2.23152, address: '729 Wilmslow Road, M20 6WF', placeRef: 'osm:node/27465379' },
    { name: 'Fletcher Moss Pub', lat: 53.4168, lng: -2.22981, address: '1 William Street, M20 6RQ', placeRef: 'osm:node/4101417790' },
    { name: 'Dog and Partridge', lat: 53.41796, lng: -2.23132, address: '665-667 Wilmslow Road, M20 6RA', placeRef: 'osm:node/29121339' },
    { name: 'Head of Steam', lat: 53.41855, lng: -2.23147, address: '653 Wilmslow Road, M20 6QZ', placeRef: 'osm:node/8483605176' },
  ],
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
