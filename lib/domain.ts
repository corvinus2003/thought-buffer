export type Status = 'In progress' | 'Pending' | 'Finished';
export type SVO = {
  subject: string;
  verb: string;
  object: string;
  rewrite: string;
};
export const orders = ['123', '132', '213', '231', '312', '321'] as const;
export type Reframing = {
  order: string;
  text: string;
  focus: 'actor' | 'verb' | 'target';
};
export type Handoff = { step: string; destination: string; purpose: string };
export type Translation = {
  changes: string;
  unresolved: string;
  svo: SVO;
  solved: boolean;
  handoff: Handoff | null;
};
export type Round = {
  id: string;
  seed: string;
  svo: SVO;
  reframings: Reframing[];
  chosen: string;
  options: string[];
  selected: string;
  answer: string;
  result: Translation | null;
  stage: 'reframe' | 'questions' | 'answer' | 'done';
};
export type Session = { id: string; rounds: Round[] };
export type LegacyThought = {
  status: string;
  current?: string;
  action?: string;
  sessions?: {
    id: string;
    rounds: {
      id: string;
      selected?: string;
      custom?: string;
      answer?: string;
      aiChanges?: string;
      userChanges?: string;
    }[];
  }[];
  decisions?: { choice: string; action: string; at: string }[];
  [key: string]: unknown;
};
export type Thought = {
  id: string;
  original: string;
  title: string;
  current: string;
  svo: SVO | null;
  status: Status;
  sessions: Session[];
  handoff: Handoff | null;
  legacy?: LegacyThought;
};
export type BufferState = {
  version: 2;
  drafts: string[];
  thoughts: Thought[];
  activeId: string | null;
  screen: 'entry' | 'list' | 'thought';
  addDraft: string;
  legacyDrafts?: string[];
};
export const emptyState = (): BufferState => ({
  version: 2,
  drafts: [''],
  thoughts: [],
  activeId: null,
  screen: 'entry',
  addDraft: '',
});
export const newThought = (original: string): Thought => ({
  id: crypto.randomUUID(),
  original: original.trim(),
  title: original.trim().slice(0, 70),
  current: original.trim(),
  svo: null,
  status: 'In progress',
  sessions: [],
  handoff: null,
});
export function migrateState(value: any): BufferState {
  if (!value) return emptyState();
  if (value.version === 2) return value;
  if (
    value.version !== 1 ||
    !Array.isArray(value.thoughts) ||
    !Array.isArray(value.drafts)
  )
    throw new Error(
      'This save format is not supported. Your saved file has not been changed.',
    );
  const thoughts: Thought[] = value.thoughts.map((old: any) => ({
    ...newThought(old.original),
    id: old.id,
    current: old.current || old.original,
    svo: old.svo || null,
    status: ['Pending', 'Accepted', 'Rejected'].includes(old.status)
      ? 'Pending'
      : 'In progress',
    legacy: old,
  }));
  // Keep every old entry draft as an individual thought, with its exact source text archived.
  thoughts.push(
    ...value.drafts.filter((s: string) => s.trim()).map(newThought),
  );
  return {
    ...emptyState(),
    thoughts,
    drafts: [''],
    activeId: value.activeId || null,
    screen:
      value.screen === 'entry' && thoughts.length
        ? 'list'
        : value.screen || 'entry',
    addDraft: value.addDraft || '',
    legacyDrafts: [...value.drafts],
  };
}
export const currentSession = (t: Thought) => t.sessions.at(-1);
export const currentRound = (t: Thought) => currentSession(t)?.rounds.at(-1);
export const answeredRounds = (t: Thought) =>
  currentSession(t)?.rounds.filter((r) => r.stage === 'done').length || 0;
export function changeRound(t: Thought, update: Partial<Round>): Thought {
  const round = currentRound(t);
  if (!round) throw new Error('Start a cycle first.');
  return {
    ...t,
    sessions: t.sessions.map((s, i) =>
      i === t.sessions.length - 1
        ? {
            ...s,
            rounds: s.rounds.map((r) =>
              r.id === round.id ? { ...r, ...update } : r,
            ),
          }
        : s,
    ),
  };
}
export function appendReframings(
  t: Thought,
  svo: SVO,
  reframings: Reframing[],
): Thought {
  if (t.status !== 'In progress')
    throw new Error('Choose to resume a pending thought first.');
  if (answeredRounds(t) >= 10)
    throw new Error('This session has reached ten answered cycles.');
  if (currentRound(t) && currentRound(t)!.stage !== 'done')
    throw new Error('Complete this cycle first.');
  if (
    reframings.length !== 6 ||
    orders.some((order) => !reframings.some((r) => r.order === order)) ||
    reframings.some((r) => !r.text.trim()) ||
    new Set(reframings.map((r) => r.text.trim())).size !== 6
  )
    throw new Error('Six distinct reframings are required.');
  const sessions = t.sessions.length
    ? t.sessions.map((s) => ({ ...s, rounds: [...s.rounds] }))
    : [{ id: crypto.randomUUID(), rounds: [] }];
  sessions.at(-1)!.rounds.push({
    id: crypto.randomUUID(),
    seed: t.current,
    svo,
    reframings,
    chosen: '',
    options: [],
    selected: '',
    answer: '',
    result: null,
    stage: 'reframe',
  });
  return { ...t, svo, sessions };
}
export function chooseReframing(t: Thought, order: string): Thought {
  const r = currentRound(t);
  if (
    !r ||
    !['reframe', 'questions'].includes(r.stage) ||
    !r.reframings.some((x) => x.order === order)
  )
    throw new Error('Choose one of this cycle’s reframings.');
  return changeRound(t, { chosen: order, stage: 'questions' });
}
export function setQuestions(t: Thought, options: string[]): Thought {
  const r = currentRound(t);
  if (!r?.chosen || r.stage !== 'questions')
    throw new Error('Choose a reframing first.');
  if (
    options.length !== 3 ||
    options.some((q) => !q.trim()) ||
    new Set(options.map((q) => q.trim())).size !== 3
  )
    throw new Error('Three distinct questions are required.');
  return changeRound(t, { options, stage: 'answer' });
}
export function completeRound(t: Thought, result: Translation): Thought {
  const r = currentRound(t);
  if (
    !r ||
    r.stage !== 'answer' ||
    !r.options.includes(r.selected) ||
    !r.answer.trim()
  )
    throw new Error('Select one question and write your answer first.');
  if (
    result.solved &&
    (!result.handoff?.step.trim() ||
      !result.handoff.destination.trim() ||
      !result.handoff.purpose.trim())
  )
    throw new Error(
      'A finished thought needs a specific next step, destination and purpose.',
    );
  const updated = changeRound(t, { result, stage: 'done' });
  return {
    ...updated,
    current: result.svo.rewrite,
    svo: result.svo,
    handoff: result.solved ? result.handoff : null,
    status: result.solved
      ? 'Finished'
      : answeredRounds(updated) >= 10
        ? 'Pending'
        : 'In progress',
  };
}
export function resumeThought(t: Thought): Thought {
  if (t.status !== 'Pending')
    throw new Error('Only pending thoughts need another session.');
  return {
    ...t,
    status: 'In progress',
    sessions: [...t.sessions, { id: crypto.randomUUID(), rounds: [] }],
  };
}
