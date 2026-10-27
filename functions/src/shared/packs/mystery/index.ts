// Mystery Pub Crawl: a murder-mystery crawl where everyone tampers with the evidence. Tampering missions are
// witnessed, group missions are photo challenges, and every confirmed mission ends in destroying evidence or
// framing a fellow suspect. Each player has a character with a secret motive. Venues come later.
import type { Catalogue, GamePack } from '../types.ts';
import quests from './quests.json' with { type: 'json' };

export const mystery: GamePack = {
  id: 'mystery',
  name: 'Mystery Pub Crawl',
  // Only what matters on the night (status: the start time moving, the game opening, pause and resume); the GM also hears
  // about join requests, entries to check and switchboard alerts.
  pushKinds: ['status', 'global-open', 'story-beat', 'voting-open', 'witness', 'standing-gained', 'join', 'checking', 'police-line'],
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
    topEntryPoints: 5,
    // +1 for every eye or heart that matches an entry's verdict, half an hour after it's posted (counts hidden till you vote).
    verdictPoints: 1,
    cleanPoints: 5,
    framePoints: 5,
    pointsFloorZero: false,
    // A yes or a no on every entry (the polaroid deck), not one pick each.
    voteStyle: 'yesno',
    // Standings and police check-ins: above 10 a trusted confidant, below -10 a person of interest.
    confidantAbove: 10,
    poiBelow: -10,
    policeEveryMin: 30,
    policeTipEveryMin: 60,
    policeWindowMin: 5,
    policePassPoints: 5,
    policeFailPenalty: 5,
    // On the Telegram line, picking up and then answering wrong or not at all costs less than not picking up.
    policeHeardPenalty: 2,
    // Police check-ins ring players' phones (the booking desk asks for a number and makes a test call). Without
    // Twilio set up (design/twilio-setup.md) the test call says so and every check-in opens in the app.
    policePhone: true,
    // Who rings when phone calls are on (the name on the contact card too).
    policeCallerName: 'Manchester Metropolitan Police',
    // Case updates go to players' police chat on Telegram instead of as push, when the line can take them.
    policeNotices: true,
    autoSideQuests: true,
  },
  gmQuickPoints: 1,
  // The police on the phone and in the Telegram chat: an officer of the Major Incident Team on Operation Last Orders, who
  // says what they were tipped off about and why they ring, then asks a question from the bank below. Read out by Polly
  // until the GM records the lines into src/packs/mystery/public/audio/police/<line>.mp3 and lists them in `recordings`
  // (a recorded line is one fixed wording without {officer}). The organisation is invented: no real force is named.
  policeVoice: {
    voice: { voice: 'Polly.Brian', language: 'en-GB' },
    officers: [
      { name: 'Detective Inspector Margaret Hollings', telegramVoice: 'en-GB-SoniaNeural' },
      { name: 'Detective Sergeant Alan Whitworth', telegramVoice: 'en-GB-RyanNeural' },
      { name: 'Detective Constable Priya Marsh', telegramVoice: 'en-GB-LibbyNeural' },
      { name: 'Desk Sergeant Lorraine Cottam', telegramVoice: 'en-GB-SoniaNeural' },
      { name: 'Police Constable Gareth Openshaw', telegramVoice: 'en-GB-ThomasNeural' },
    ],
    lines: {
      // Every call opens the same way: "This is Manchester Metropolitan Police." (the test call too).
      'intro-tip': [
        'This is {caller}. Good evening, {name}. I am {officer} of the Major Incident Team, on Operation Last Orders, the death of Bob. This call is being recorded.',
        'This is {caller}. Evening, {name}. {officer} here, Major Incident Team. I am calling about Operation Last Orders, the death of Bob. This call is being recorded.',
        "This is {caller}. {name}? Good. I'm {officer}, Major Incident Team, working Operation Last Orders, the death of Bob. I'm recording this call.",
      ],
      'intro-watch': [
        'This is {caller}. Good evening, {name}. I am {officer} of the Major Incident Team, on Operation Last Orders, the death of Bob. This call is being recorded. You are on our watch list tonight.',
        'This is {caller}. Evening, {name}. {officer} here, Major Incident Team, on Operation Last Orders, the death of Bob. This call is being recorded. You are on our watch list tonight.',
        "This is {caller}. {name}? I'm {officer}, Major Incident Team. Operation Last Orders, the death of Bob. I'm recording this call, and you are on our watch list tonight.",
      ],
      accused: [
        'We have been tipped off that you have been {accusation}.',
        "I'll be straight with you. We have been tipped off that you have been {accusation}.",
        'Information has reached us. We have been tipped off that you have been {accusation}.',
      ],
      purpose: [
        'For now, we just want to see how well you are handling your drink.',
        "For now, all I need is to see how well you are handling your drink.",
        'This is only a check on how well you are handling your drink, for now.',
      ],
      ask: ['Here is your question. {question}', 'Question for you. {question}'],
      'key-in': 'Key in your answer, then press hash.',
      again: "I didn't catch that. Once more.",
      pass: [
        "That's correct. Thank you for your cooperation. Mind how you go.",
        'Correct. That matches what we have. Thank you, and mind how you go.',
      ],
      fail: [
        "That's not what we have on file. We'll be making a note of that.",
        "That doesn't match our records. We'll be noting it down.",
      ],
      'no-answer': [
        "No response. I'm recording that as a failure to assist police enquiries.",
        "Nothing? I'll log that as a failure to assist police enquiries.",
      ],
      closed: 'This check-in is closed. Goodbye.',
      moved: "The line's bad, so your check-in is waiting in the app. Goodbye.",
      'test-intro': 'This is {caller}. Testing your line. Your code is',
      'test-pass': "Got it. We'll be in touch. Goodbye.",
      'test-fail': 'Refresh the case page and try again.',
    },
    chatLines: {
      ask: ['Can you answer in the chat: {question}', 'Reply in the chat with your answer: {question}'],
    },
    recordings: [],
  },
  // What the police ask: sums (twice as often), the victim, what the story has settled, the standings, the bar they are
  // in (decoys are Manchester bars that are not on the route, so a hidden stop never leaks), the watch list and what
  // each player said at the booking desk.
  policeQuiz: [
    { kind: 'sum', weight: 2 },
    { kind: 'fixed', ask: 'Who was the victim?', answer: 'Bob', decoys: ['Rob', 'Bill', 'Barry', 'Dave'] },
    { kind: 'fact', fact: 'timeOfDeath', ask: 'What time was Bob killed?', decoys: 'times' },
    { kind: 'fact', fact: 'weapon', ask: 'What was the murder weapon?' },
    { kind: 'fact', fact: 'scene', ask: 'Where was Bob killed?' },
    { kind: 'standing', pick: 'lowest', ask: "Who's our prime suspect right now?" },
    { kind: 'standing', pick: 'highest', ask: "Who's our most trusted informant right now?" },
    {
      kind: 'stop',
      ask: 'Which bar are you in?',
      decoys: ["Albert's Schloss", 'The Whiskey Jar', 'Soup Kitchen', 'Night & Day Cafe', 'The Castle Hotel', 'Odd Bar'],
    },
    { kind: 'watch-count', ask: 'How many people are on our watch list?' },
    { kind: 'own', field: 'relation', ask: 'What did you tell us your relation to Bob was?' },
    { kind: 'own', field: 'height', ask: 'How tall did you tell us you were?' },
    { kind: 'whose', field: 'relation', ask: 'Who told us they were {value}?' },
  ],
  // What the booking desk asks about each player's relation to Bob (the police ask about it too).
  booking: {
    relations: [
      { id: 'lover', label: 'Lover', phrase: "Bob's lover" },
      { id: 'ex', label: 'Ex', phrase: "Bob's ex" },
      { id: 'sidepiece', label: 'Sidepiece', phrase: "Bob's sidepiece" },
      { id: 'best-friend', label: 'Best friend', phrase: "Bob's best friend" },
      { id: 'boss', label: 'Boss', phrase: "Bob's boss" },
      { id: 'parent', label: 'Parent', phrase: "Bob's parent" },
      { id: 'sibling', label: 'Sibling', phrase: "Bob's brother or sister" },
      { id: 'complicated', label: "It's complicated", phrase: 'on complicated terms with Bob' },
    ],
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
    // Between Oxford Road and the Northern Quarter, so the whole crawl (about two and a half kilometres) is in view.
    centre: { lat: 53.4731, lng: -2.2343 },
    zoom: 14,
    placeName: 'Manchester city centre',
    nearbyKm: 2,
    credit: null,
    routeStyle: 'footprints',
    // The GM's bar search covers all of Manchester (the city's bounding box), not just round the last stop.
    barSearch: { name: 'Manchester', south: 53.34, west: -2.32, north: 53.545, east: -2.146 },
  },
  venues: [],
  // The starting route through Manchester city centre, south to north for a Friday or Saturday night from about 7pm:
  // up Oxford Road while the walks are longest and everyone is fresh, the early closers before they close (The
  // Grosvenor, midnight to 2am; The Badger, midnight; Flok, 1am), then the Northern Quarter's few steps apart and The
  // Mother of Invention, open till 4am, to finish (it is shut on Sundays). Terrace NQ and Cane and Grain (Thomas Street,
  // open till 3am) are two minutes on if it is full. OpenStreetMap places and addresses; The Mother of Invention is
  // newer than the map, so its position comes from Google Maps and it has no placeRef. The GM can edit, reorder and
  // reveal it in the app, or swap a stop for another bar from the map's bar search.
  route: [
    { name: 'Big Hands', lat: 53.46292, lng: -2.23041, address: '296 Oxford Road, M13 9NS', placeRef: 'osm:node/258864504' },
    { name: 'The Grosvenor', lat: 53.47016, lng: -2.23691, address: '137 Grosvenor Street, M1 7DZ', placeRef: 'osm:node/30969134' },
    { name: 'YES', lat: 53.47401, lng: -2.23816, address: '38 Charles Street, M1 7DB', placeRef: 'osm:node/9062401417' },
    { name: 'The Badger', lat: 53.48162, lng: -2.23408, address: '24 Dale Street, M1 1FY', placeRef: 'osm:node/3114683531' },
    { name: 'Flok', lat: 53.48276, lng: -2.23372, address: '5 Stevenson Square, M1 1DN', placeRef: 'osm:node/6358776626' },
    { name: 'The Mother of Invention', lat: 53.48332, lng: -2.23481, address: '73-75 Oldham Street, M4 1EB' },
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
