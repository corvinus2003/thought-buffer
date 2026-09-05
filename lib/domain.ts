export type Status =
  | 'Not started'
  | 'In progress'
  | 'Pending'
  | 'Accepted'
  | 'Rejected';
export type SVO = {
  subject: string;
  verb: string;
  object: string;
  rewrite: string;
};
export type Round = {
  id: string;
  options: string[];
  selected: string;
  custom: string;
  answer: string;
  aiChanges: string;
  userChanges: string;
  stage: 'answer' | 'review' | 'done';
};
export type Session = { id: string; rounds: Round[] };
export type Decision = {
  choice: 'Accepted' | 'Rejected';
  action: string;
  at: string;
};
export type Thought = {
  id: string;
  original: string;
  title: string;
  svo: SVO | null;
  confirmed: boolean;
  current: string;
  action: string;
  status: Status;
  sessions: Session[];
  decisions: Decision[];
};
export type BufferState = {
  version: 1;
  drafts: string[];
  thoughts: Thought[];
  activeId: string | null;
  screen: 'entry' | 'list' | 'thought';
  addDraft: string;
};
export const emptyState = (): BufferState => ({
  version: 1,
  drafts: ['', '', '', '', ''],
  thoughts: [],
  activeId: null,
  screen: 'entry',
  addDraft: '',
});
export const newThought = (original: string): Thought => ({
  id: crypto.randomUUID(),
  original: original.trim(),
  title: original.trim().slice(0, 70),
  svo: null,
  confirmed: false,
  current: original.trim(),
  action: '',
  status: 'Not started',
  sessions: [],
  decisions: [],
});
export const currentSession = (t: Thought) => t.sessions.at(-1);
export const currentRound = (t: Thought) => currentSession(t)?.rounds.at(-1);
export const roundQuestion = (r: Round) => r.custom.trim() || r.selected;
export function appendRound(t: Thought, options: string[]): Thought {
  if (
    options.length !== 3 ||
    options.some((q) => !q.trim()) ||
    new Set(options).size !== 3
  )
    throw new Error('Three distinct questions are required.');
  const sessions = t.sessions.length
    ? t.sessions.map((s) => ({ ...s, rounds: [...s.rounds] }))
    : [{ id: crypto.randomUUID(), rounds: [] }];
  const s = sessions[sessions.length - 1];
  if (s.rounds.length >= 10)
    throw new Error('This session has reached ten rounds.');
  if (s.rounds.at(-1) && s.rounds.at(-1)!.stage !== 'done')
    throw new Error('Finish reviewing the current round first.');
  s.rounds.push({
    id: crypto.randomUUID(),
    options,
    selected: options[0],
    custom: '',
    answer: '',
    aiChanges: '',
    userChanges: '',
    stage: 'answer',
  });
  return { ...t, status: 'In progress', sessions };
}
export function changeRound(t: Thought, update: Partial<Round>): Thought {
  const r = currentRound(t);
  if (!r) return t;
  return {
    ...t,
    sessions: t.sessions.map((s, i) =>
      i === t.sessions.length - 1
        ? {
            ...s,
            rounds: s.rounds.map((x) =>
              x.id === r.id ? { ...x, ...update } : x,
            ),
          }
        : s,
    ),
  };
}
export function finishReview(t: Thought): Thought {
  const r = currentRound(t);
  if (!r || r.stage !== 'review')
    throw new Error('Review the changes before continuing.');
  const next = changeRound(t, { stage: 'done' });
  return currentSession(next)!.rounds.length >= 10
    ? { ...next, status: 'Pending' }
    : next;
}
export function resumeThought(t: Thought): Thought {
  const s = currentSession(t);
  if (s && s.rounds.length >= 10 && s.rounds.at(-1)?.stage === 'done') {
    return {
      ...t,
      status: 'In progress',
      sessions: [...t.sessions, { id: crypto.randomUUID(), rounds: [] }],
    };
  }
  return { ...t, status: 'In progress' };
}
export function decide(t: Thought, choice: 'Accepted' | 'Rejected'): Thought {
  if (!t.action.trim()) throw new Error('Name the action before deciding.');
  return {
    ...t,
    status: choice,
    decisions: [
      ...t.decisions,
      { choice, action: t.action.trim(), at: new Date().toISOString() },
    ],
  };
}
export function nextThought(state: BufferState, updated: Thought): BufferState {
  const thoughts = state.thoughts.map((t) =>
    t.id === updated.id ? updated : t,
  );
  const index = thoughts.findIndex((t) => t.id === updated.id);
  const ordered = [...thoughts.slice(index + 1), ...thoughts.slice(0, index)];
  const next = ordered.find((t) => t.status === 'Not started');
  return {
    ...state,
    thoughts,
    activeId: next?.id ?? null,
    screen: next ? 'thought' : 'list',
  };
}
