// Story missions (catalogue.story): side quests the GM fires in the pack's order. Shared by the functions, the app's
// GM console and the tests.
import type { StoryQuest } from './packs/types.ts';
import type { GlobalQuestStatus } from './types.ts';

/** Where a story mission is: never fired, open now (live, checking or voting), or fired and closed. */
export type StoryState = 'not-yet' | 'running' | 'done';

/** What the story needs to know of a fired side quest. */
export interface FiredQuest {
  storyId?: string | null;
  status: GlobalQuestStatus;
}

/** Each story mission's state, by id. Fired quests that are not story missions, or name one the pack lacks, are ignored. */
export function storyStates(story: readonly StoryQuest[], quests: readonly FiredQuest[]): Record<string, StoryState> {
  const states: Record<string, StoryState> = {};
  for (const s of story) {
    const runs = quests.filter((q) => q.storyId === s.id);
    states[s.id] = runs.some((q) => q.status !== 'closed') ? 'running' : runs.length > 0 ? 'done' : 'not-yet';
  }
  return states;
}

/** The first story mission, in the pack's order, that has never been fired; null when every one has. */
export function nextStoryId(story: readonly StoryQuest[], quests: readonly FiredQuest[]): string | null {
  const states = storyStates(story, quests);
  return story.find((s) => states[s.id] === 'not-yet')?.id ?? null;
}
