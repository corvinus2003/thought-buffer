import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendReframings,
  chooseReframing,
  setQuestions,
  changeRound,
  completeRound,
  currentRound,
  currentSession,
  answeredRounds,
  emptyState,
  migrateState,
  newThought,
  resumeThought,
} from '../lib/domain.ts';
import {
  callModel,
  createLocalApi,
  MODEL,
  validOutput,
} from '../lib/local-api.mjs';
import {
  svo,
  reframings,
  questions,
  unsolved,
  solved,
  withAnswer,
  output,
} from './translator-fixtures.mjs';

test('disk saves survive restarts, stale writes conflict, and cross-site requests cannot change state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'thought-buffer-test-'));
  const handler = createLocalApi({ directory });
  const req = (path, method = 'GET', data, origin = 'http://127.0.0.1:4317') =>
    new Request(`http://127.0.0.1:4317${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', origin },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  try {
    const state = {
      ...emptyState(),
      thoughts: [newThought('Private thought')],
    };
    assert.equal(
      (await handler(req('/api/state', 'PUT', { revision: 0, data: state })))
        .status,
      200,
    );
    const again = createLocalApi({ directory });
    assert.equal(
      (await (await again(req('/api/state'))).json()).data.thoughts[0].original,
      'Private thought',
    );
    assert.equal(
      (
        await handler(
          req('/api/state', 'PUT', { revision: 0, data: emptyState() }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await handler(
          req(
            '/api/state',
            'PUT',
            { revision: 1, data: emptyState() },
            'https://untrusted.example',
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (await stat(join(directory, 'buffer.json'))).mode & 0o777,
      0o600,
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, 'buffer.json'), 'utf8'))
        .revision,
      1,
    );
    assert.equal(
      (await handler(req('/api/state', 'PUT', { revision: 1, data: state })))
        .status,
      200,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(directory, 'buffer.previous.json'), 'utf8'),
      ).revision,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('refusals, malformed responses and billing limits are explicit errors rather than fabricated questions', async () => {
  const t = newThought('A thought');
  await assert.rejects(
    () =>
      callModel(
        'test',
        'questions',
        t,
        async () => new Response('{}', { status: 429 }),
      ),
    /billing limits/,
  );
  await assert.rejects(
    () =>
      callModel('test', 'questions', t, async () =>
        Response.json({ output: [{ content: [{ type: 'refusal' }] }] }),
      ),
    /could not help/,
  );
  await assert.rejects(
    () =>
      callModel('test', 'questions', t, async () =>
        Response.json({
          output: [
            {
              content: [
                { type: 'output_text', text: '{"questions":["only one"]}' },
              ],
            },
          ],
        }),
      ),
    /did not match/,
  );
});

test('one thought starts the workflow; choosing a reframing is required before questions', () => {
  assert.equal(emptyState().drafts.length, 1);
  let t = appendReframings(
    newThought('I want to play Lost Ark.'),
    svo,
    reframings,
  );
  assert.equal(t.original, 'I want to play Lost Ark.');
  assert.equal(t.current, t.original); // Generating options must not rewrite the seed.
  assert.equal(currentRound(t).chosen, '');
  assert.throws(() => setQuestions(t, questions), /Choose a reframing/);
  t = chooseReframing(t, '231');
  t = setQuestions(t, questions);
  assert.equal(currentRound(t).selected, '');
  assert.equal(answeredRounds(t), 0);
  assert.throws(() => completeRound(t, solved), /Select one question/);
});
test('ten answered cycles become Pending, successful cycle ten becomes Finished; explicit resume preserves history', () => {
  let t = newThought('I want a gaming PC.');
  for (let n = 0; n < 9; n++) t = completeRound(withAnswer(t), unsolved);
  const tenth = withAnswer(t);
  assert.equal(answeredRounds(tenth), 9);
  const pending = completeRound(tenth, unsolved);
  assert.equal(pending.status, 'Pending');
  assert.equal(answeredRounds(pending), 10);
  assert.throws(() => appendReframings(pending, svo, reframings), /resume/);
  const finished = completeRound(tenth, solved);
  assert.equal(finished.status, 'Finished');
  assert.deepEqual(finished.handoff, solved.handoff);
  assert.throws(() => resumeThought(finished), /Only pending/);
  const resumed = appendReframings(resumeThought(pending), svo, reframings);
  assert.equal(resumed.sessions.length, 2);
  assert.deepEqual(resumed.sessions[0], pending.sessions[0]);
  assert.equal(answeredRounds(resumed), 0);
});
test('yes or no answers do not make decisions and the model must supply a complete handoff', () => {
  const t = changeRound(withAnswer(newThought('A thought')), { answer: 'No' });
  assert.equal(completeRound(t, unsolved).status, 'In progress');
  assert.equal(completeRound(t, solved).status, 'Finished');
  assert.throws(
    () =>
      completeRound(t, {
        ...solved,
        handoff: { ...solved.handoff, destination: '' },
      }),
    /next step/,
  );
  assert.throws(
    () => completeRound(completeRound(t, unsolved), solved),
    /Select one question/,
  );
});
test('switching and JSON roundtrips retain the chosen option, answer draft and all completed cycles', () => {
  const first = completeRound(withAnswer(newThought('First')), unsolved);
  const drafted = changeRound(withAnswer(first), {
    answer: 'Unfinished answer',
  });
  const second = newThought('Second');
  const state = {
    ...emptyState(),
    thoughts: [drafted, second],
    activeId: second.id,
    screen: 'thought',
  };
  const restored = migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(currentRound(restored.thoughts[0]).answer, 'Unfinished answer');
  assert.equal(currentRound(restored.thoughts[0]).chosen, '231');
  assert.equal(currentRound(restored.thoughts[0]).selected, questions[0]);
  assert.equal(
    restored.thoughts[0].sessions[0].rounds[0].result.svo.rewrite,
    svo.rewrite,
  );
});
test('migration is idempotent, preserves legacy decisions/corrections/drafts, and never treats decisions as solved', () => {
  const old = {
    version: 1,
    drafts: ['first draft', '', 'third draft', '', ''],
    activeId: 'old',
    screen: 'thought',
    addDraft: 'another draft',
    thoughts: [
      {
        id: 'old',
        original: 'Original',
        current: 'More precise',
        status: 'Accepted',
        action: 'Learn guitar',
        sessions: [
          {
            id: 's',
            rounds: [
              {
                id: 'r',
                custom: 'My question',
                answer: 'Draft answer',
                userChanges: 'My correction',
                aiChanges: 'An idea',
              },
            ],
          },
        ],
        decisions: [
          { choice: 'Accepted', action: 'Learn guitar', at: 'yesterday' },
        ],
      },
    ],
  };
  const copy = structuredClone(old),
    migrated = migrateState(old);
  assert.deepEqual(old, copy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.thoughts[0].status, 'Pending');
  assert.deepEqual(migrated.thoughts[0].legacy, old.thoughts[0]);
  assert.equal(migrated.thoughts[0].current, 'More precise');
  assert.equal(migrated.thoughts[1].original, 'first draft');
  assert.equal(migrated.thoughts[2].original, 'third draft');
  assert.equal(migrated.addDraft, 'another draft');
  assert.deepEqual(migrateState(migrated), migrated);
  assert.throws(() => migrateState({ version: 99 }), /not supported/);
});
test('model requests include selected reframing, seed and complete history and retain Luna and store:false', async () => {
  const t = withAnswer(
    completeRound(withAnswer(newThought('Original')), unsolved),
  );
  let sent;
  const result = await callModel(
    'test-key',
    'changes',
    t,
    async (url, config) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      sent = JSON.parse(config.body);
      return output(unsolved);
    },
  );
  assert.equal(sent.model, MODEL);
  assert.equal(sent.store, false);
  assert.deepEqual(JSON.parse(sent.input).thought, t);
  assert.deepEqual(result, unsolved);
});
test('malformed reframings and incomplete or contradictory handoffs are rejected', async () => {
  assert.equal(validOutput('reframings', { svo, reframings }), true);
  assert.equal(
    validOutput('reframings', { svo, reframings: reframings.slice(1) }),
    false,
  );
  assert.equal(
    validOutput('reframings', {
      svo,
      reframings: reframings.map((r) => ({ ...r, order: '123' })),
    }),
    false,
  );
  assert.equal(validOutput('changes', { ...solved, handoff: null }), false);
  assert.equal(
    validOutput('changes', { ...unsolved, handoff: solved.handoff }),
    false,
  );
  assert.equal(validOutput('changes', { ...solved, solved: 'true' }), false);
  assert.equal(
    validOutput('questions', { questions: ['one', 'one ', 'three'] }),
    false,
  );
  await assert.rejects(
    () =>
      callModel(
        'test',
        'changes',
        withAnswer(newThought('Original')),
        async () => output({ ...solved, handoff: null }),
      ),
    /did not match/,
  );
});
test('API enforces the cycle sequence and limit and never sends invalid requests to the model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'translator-guard-'));
  const handler = createLocalApi({
    directory,
    environmentKey: '',
    fetcher: () => {
      throw new Error('Must not call OpenAI');
    },
  });
  const req = (kind, thought) =>
    new Request('http://127.0.0.1:4319/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, thought }),
    });
  try {
    const fresh = newThought('A thought');
    assert.equal((await handler(req('questions', fresh))).status, 400);
    assert.equal((await handler(req('changes', fresh))).status, 400);
    assert.equal((await handler(req('reframings', fresh))).status, 428);
    let t = fresh;
    for (let i = 0; i < 10; i++) t = completeRound(withAnswer(t), unsolved);
    for (const kind of ['questions', 'changes', 'reframings'])
      assert.equal(
        (await handler(req(kind, { ...t, status: 'In progress' }))).status,
        400,
      );
    assert.equal(
      (await handler(req('reframings', resumeThought(t)))).status,
      428,
    );
    assert.equal(
      (
        await handler(
          req('reframings', completeRound(withAnswer(fresh), solved)),
        )
      ).status,
      400,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('an immutable migration backup survives later saves; old clients cannot downgrade migrated data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'translator-migration-'));
  const handler = createLocalApi({ directory, environmentKey: '' });
  const req = (revision, data) =>
    new Request('http://127.0.0.1:4319/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, data }),
    });
  const legacy = {
    version: 1,
    drafts: ['keep me'],
    thoughts: [],
    screen: 'entry',
  };
  try {
    assert.equal((await handler(req(0, legacy))).status, 200);
    assert.equal((await handler(req(1, migrateState(legacy)))).status, 200);
    assert.equal((await handler(req(2, emptyState()))).status, 200);
    assert.equal((await handler(req(3, legacy))).status, 409);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(directory, 'buffer.before-translator.json'),
          'utf8',
        ),
      ).data,
      legacy,
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, 'buffer.json'), 'utf8')).data
        .version,
      2,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('the complete API cycle returns a rewrite and handoff after a grounded answer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'translator-cycle-'));
  const handler = createLocalApi({
    directory,
    environmentKey: 'test-key',
    fetcher: async (_, config) => {
      const input = JSON.parse(JSON.parse(config.body).input);
      if (input.task === 'reframings') return output({ svo, reframings });
      if (input.task === 'questions') {
        assert.equal(currentRound(input.thought).chosen, '231');
        return output({ questions });
      }
      assert.equal(
        currentRound(input.thought).answer,
        'I can check the official support site.',
      );
      return output(solved);
    },
  });
  const request = async (kind, thought) => {
    const response = await handler(
      new Request('http://127.0.0.1:4319/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, thought }),
      }),
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    let t = newThought('I want a gaming PC.');
    const first = await request('reframings', t);
    t = chooseReframing(
      appendReframings(t, first.svo, first.reframings),
      '231',
    );
    t = setQuestions(t, (await request('questions', t)).questions);
    t = changeRound(t, {
      selected: questions[0],
      answer: 'I can check the official support site.',
    });
    t = completeRound(t, await request('changes', t));
    assert.equal(t.status, 'Finished');
    assert.equal(t.original, 'I want a gaming PC.');
    assert.equal(t.current, svo.rewrite);
    assert.equal(answeredRounds(t), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fixed reframing orders use the correct focus even if the model mislabels them', async () => {
  const result = await callModel('test', 'reframings', newThought('I want to play.'), async () => output({
    svo, reframings: [...reframings].reverse().map(r => ({ ...r, focus: 'actor' })),
  }));
  assert.deepEqual(result.reframings.map(r => r.order), ['123', '132', '213', '231', '312', '321']);
  assert.deepEqual(result.reframings.map(r => r.focus), ['verb', 'verb', 'verb', 'verb', 'target', 'target']);
});
