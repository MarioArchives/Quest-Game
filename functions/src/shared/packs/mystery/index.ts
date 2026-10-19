// Mystery Pub Crawl: a murder-mystery crawl where everyone tampers with the evidence. Tampering missions are
// witnessed, group missions are photo challenges, and every confirmed mission ends in destroying evidence or
// framing a fellow suspect. Each player has a character with a secret motive. Venues come later.
import type { Catalogue, GamePack } from '../types.ts';
import quests from './quests.json' with { type: 'json' };

export const mystery: GamePack = {
  id: 'mystery',
  name: 'Mystery Pub Crawl',
  // Only what matters on the night; the GM also hears about join requests, entries to check and switchboard alerts.
  pushKinds: ['global-open', 'story-beat', 'voting-open', 'witness', 'standing-gained', 'join', 'checking', 'police-line'],
  reactions: 'votes',
  description: 'The murder of Bob, a pub crawl full of suspects, and evidence to tamper with.',
  terms: {
    quest: { one: 'tampering mission', many: 'tampering missions' },
    sideQuest: { one: 'group mission', many: 'group missions' },
    witness: { one: 'witness', many: 'witnesses' },
    claim: { one: 'submission', many: 'submissions' },
    gm: { one: 'GM', many: 'GMs' },
    wrap: { one: 'case file', many: 'case files' },
    checkin: { one: 'periodic mission', many: 'periodic missions' },
    feed: { one: 'log book', many: 'log books' },
  },
  features: { guesses: true, sideQuests: true, map: true, rewardChoice: true, characters: true, stops: true, checkins: true, police: true },
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
    // Standings and police check-ins: above 10 a trusted confidant, below -10 a person of interest.
    confidantAbove: 10,
    poiBelow: -10,
    policeEveryMin: 30,
    policeTipEveryMin: 60,
    policeWindowMin: 5,
    policePassPoints: 5,
    policeFailPenalty: 5,
    // Police check-ins ring players' phones (the booking desk asks for a number and makes a test call). Without
    // Twilio set up (design/twilio-setup.md) the test call says so and every check-in opens in the app.
    policePhone: true,
    // Who rings when phone calls are on (the name on the contact card too).
    policeCallerName: 'Manchester Metropolitan Police',
    autoSideQuests: true,
  },
  gmQuickPoints: 1,
  // The police on the phone (phone calls on): a desk sergeant's wording, read out by Polly until the GM records
  // the lines into src/packs/mystery/public/audio/police/<line>.mp3 and lists them in `recordings`.
  policeVoice: {
    voice: { voice: 'Polly.Brian', language: 'en-GB' },
    lines: {
      'intro-watch': "Evening, {name}. {caller} here. You're a person of interest, so this is a quick sobriety check.",
      'intro-tip': "{caller} here. We've had a tip-off about you, {name}. Let's see how sober you are.",
      'key-in': 'Key in your answer, then press hash.',
      again: "I didn't catch that. Once more.",
      pass: 'Correct. Stay out of trouble. Goodbye.',
      fail: "That's not right. We'll be making a note of that. Goodbye.",
      'no-answer': "Nothing? I'll mark that as a missed check-in. Goodbye.",
      closed: 'This check-in is closed. Goodbye.',
      moved: "The line's bad, so your check-in is waiting in the app. Goodbye.",
      'test-intro': '{caller}, testing your line. Your code is',
      'test-pass': "Got it. We'll be in touch. Goodbye.",
      'test-fail': "That's not the code. Try again from the app. Goodbye.",
    },
    recordings: [],
  },
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
  // The Lancaster festival's missions (68 tampering, 20 group), copied so the two catalogues can drift apart.
  // (the JSON types 'judging' as plain text)
  catalogue: quests as Catalogue,
  map: {
    // Between the Northern Quarter and Charles Street, so the whole crawl (about a kilometre end to end) is in view.
    centre: { lat: 53.4791, lng: -2.2359 },
    zoom: 15,
    placeName: 'Manchester city centre',
    nearbyKm: 2,
    credit: null,
    routeStyle: 'footprints',
    // The GM's bar search covers all of Manchester (the city's bounding box), not just round the last stop.
    barSearch: { name: 'Manchester', south: 53.34, west: -2.32, north: 53.545, east: -2.146 },
  },
  venues: [],
  // The starting route through Manchester city centre (OpenStreetMap places and addresses; The Mother of Invention is
  // newer than the map, so its position comes from Google Maps and it has no placeRef). The GM can edit, reorder and
  // reveal it in the app, or swap a stop for another bar from the map's bar search.
  route: [
    { name: 'The Badger', lat: 53.48162, lng: -2.23408, address: '24 Dale Street, M1 1FY', placeRef: 'osm:node/3114683531' },
    { name: 'Flok', lat: 53.48276, lng: -2.23372, address: '5 Stevenson Square, M1 1DN', placeRef: 'osm:node/6358776626' },
    { name: 'The Mother of Invention', lat: 53.48332, lng: -2.23481, address: 'Oldham Street, M4 1EB' },
    { name: 'Terrace NQ', lat: 53.48412, lng: -2.23665, address: '43 Thomas Street, M4 1NA', placeRef: 'osm:node/1435542159' },
    { name: 'Cane and Grain', lat: 53.48397, lng: -2.23645, address: '51 Thomas Street, M4 1NA', placeRef: 'osm:node/5892038085' },
    { name: 'YES', lat: 53.47401, lng: -2.23816, address: '38 Charles Street, M1 7DB', placeRef: 'osm:node/9062401417' },
  ],
  demoCharacters: [
    {
      name: 'Lady Violet Ashcombe',
      role: 'Niece of Bob',
      motive: 'Bob was about to cut her out of his will, and she needs the new draft to go missing.',
    },
    {
      name: 'Dr Rupert Fenwick',
      role: 'Family physician',
      motive: 'He signed a death certificate too quickly, and someone must not look at it too closely.',
    },
    {
      name: 'Marguerite Delacroix',
      role: 'Housekeeper to Bob',
      motive: 'She knows what was in the study safe and has already taken the one thing that could name her.',
    },
    {
      name: 'Captain Alistair Thorne',
      role: 'Old army friend of Bob',
      motive: 'He owed Bob a fortune, and the only record of the debt was in his desk.',
    },
  ],
};
