import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendRound,
  changeRound,
  currentRound,
  decide,
  emptyState,
  finishReview,
  newThought,
  nextThought,
  resumeThought,
  roundQuestion,
} from '../lib/domain.ts';
import { callModel, createLocalApi, MODEL } from '../lib/local-api.mjs';
const options = [
  'What do you want?',
  'What would change?',
  'What is your next step?',
];

test('ten answered reviews stop; revisiting creates a new session and keeps all history', () => {
  let t = {
    ...newThought('A gaming PC will make me happy.'),
    action: 'Buy a gaming PC',
  };
  for (let n = 0; n < 10; n++) {
    t = appendRound(t, options);
    t = changeRound(t, {
      answer: 'Still unsure',
      aiChanges: 'The action is undecided.',
      userChanges: `My correction ${n}`,
      stage: 'review',
    });
    t = finishReview(t);
  }
  assert.equal(t.status, 'Pending');
  assert.equal(t.sessions[0].rounds.length, 10);
  assert.throws(() => appendRound(t, options), /ten rounds/);
  const resumed = appendRound(resumeThought(t), options);
  assert.equal(resumed.sessions.length, 2);
  assert.equal(resumed.sessions[0].rounds[9].userChanges, 'My correction 9');
  assert.equal(resumed.sessions[1].rounds.length, 1);
});
test('your question replaces the selected suggestion; a yes answer does not decide', () => {
  let t = appendRound(newThought('I want to play guitar.'), options);
  t = changeRound(t, {
    custom: 'Do I want to practise tonight?',
    answer: 'Yes',
    stage: 'review',
    aiChanges: 'You want to practise.',
  });
  assert.equal(
    roundQuestion(currentRound(t)),
    'Do I want to practise tonight?',
  );
  assert.equal(t.status, 'In progress');
  assert.throws(() => decide(t, 'Accepted'), /Name the action/);
  const accepted = decide(
    { ...t, action: 'Practise for ten minutes tonight' },
    'Accepted',
  );
  assert.equal(
    accepted.decisions[0].action,
    'Practise for ten minutes tonight',
  );
  assert.equal(accepted.decisions[0].choice, 'Accepted');
  const changed = decide(
    { ...resumeThought(accepted), action: 'Buy a guitar' },
    'Rejected',
  );
  assert.equal(changed.decisions[0].action, 'Practise for ten minutes tonight');
  assert.equal(changed.decisions[1].action, 'Buy a guitar');
});
test('pausing and switching keep draft fields and choose the next unprocessed thought', () => {
  let t = appendRound(newThought('First thought'), options);
  t = changeRound(t, {
    answer: 'Unfinished answer',
    custom: 'My question',
    userChanges: 'Keep this',
  });
  const second = newThought('Second thought');
  const state = nextThought(
    { ...emptyState(), thoughts: [t, second] },
    { ...t, status: 'Pending' },
  );
  assert.equal(state.activeId, second.id);
  const resumed = resumeThought(state.thoughts[0]);
  assert.equal(currentRound(resumed).answer, 'Unfinished answer');
  assert.equal(currentRound(resumed).custom, 'My question');
  assert.equal(resumed.sessions.length, 1);
});
test('a next question request includes both change boxes and uses only the requested Luna model', async () => {
  let t = appendRound(newThought('I want a PC.'), options);
  t = changeRound(t, {
    answer: 'I miss Windows.',
    aiChanges: 'Perhaps you miss gaming.',
    userChanges: 'No, I want a familiar desktop, not games.',
    stage: 'done',
  });
  let request;
  const result = await callModel(
    'test-key',
    'questions',
    t,
    async (url, config) => {
      request = JSON.parse(config.body);
      assert.equal(url, 'https://api.openai.com/v1/responses');
      return Response.json({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ questions: options }),
              },
            ],
          },
        ],
      });
    },
  );
  assert.equal(request.model, MODEL);
  assert.equal(request.store, false);
  const sent = JSON.parse(request.input).thought.sessions[0].rounds[0];
  assert.equal(sent.aiChanges, 'Perhaps you miss gaming.');
  assert.equal(sent.userChanges, 'No, I want a familiar desktop, not games.');
  assert.deepEqual(result.questions, options);
});
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
test('API enforces ten rounds even if the client requests another, and reports missing connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'thought-buffer-test-'));
  const handler = createLocalApi({
    directory,
    fetcher: async () => {
      throw new Error('Must not call OpenAI');
    },
  });
  const request = (thought) =>
    new Request('http://127.0.0.1:4317/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'questions', thought }),
    });
  try {
    const t = {
      ...newThought('A thought'),
      sessions: [
        {
          id: 's',
          rounds: Array.from({ length: 10 }, () => ({ answer: 'Maybe' })),
        },
      ],
    };
    assert.equal((await handler(request(t))).status, 400);
    if (!process.env.OPENAI_API_KEY)
      assert.equal(
        (await handler(request(newThought('A thought')))).status,
        428,
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
