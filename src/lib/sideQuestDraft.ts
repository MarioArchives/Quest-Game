// The GM's side-quest form (written from scratch, or a drawn template being edited): the text fields as typed,
// what is wrong with them, and what changed from where they started.

export interface SideQuestDraft {
  title: string;
  description: string;
  /** As typed: checked by `sideQuestProblem`. */
  windowMin: string;
  points: string;
}

/** The first thing to fix, in the server's limits, or null when the draft can be sent. */
export function sideQuestProblem(d: SideQuestDraft): string | null {
  if (!d.title.trim()) return 'Give it a title.';
  if (d.title.trim().length > 80) return 'The title can be 80 characters at most.';
  if (d.description.length > 500) return 'The description can be 500 characters at most.';
  const w = Number(d.windowMin);
  if (!/^\d+$/.test(d.windowMin.trim()) || w < 5 || w > 180) return 'The window is 5 to 180 minutes.';
  if (!/^\d+$/.test(d.points.trim())) return 'Points are a whole number, 0 or more.';
  return null;
}

export interface SideQuestFieldsOut {
  title?: string;
  description?: string;
  windowMin?: number;
  points?: number;
}

/** Only the fields that differ from `from` (trimmed, numbers parsed), for sending a drawn template with edits. */
export function changedFields(d: SideQuestDraft, from: SideQuestDraft): SideQuestFieldsOut {
  const out: SideQuestFieldsOut = {};
  if (d.title.trim() !== from.title.trim()) out.title = d.title.trim();
  if (d.description.trim() !== from.description.trim()) out.description = d.description.trim();
  if (Number(d.windowMin) !== Number(from.windowMin)) out.windowMin = Number(d.windowMin);
  if (Number(d.points) !== Number(from.points)) out.points = Number(d.points);
  return out;
}
