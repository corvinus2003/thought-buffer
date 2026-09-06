'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Menu,
  Plus,
  Settings2,
  X,
  LoaderCircle,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBuffer } from '@/lib/use-buffer';
import {
  appendReframings,
  changeRound,
  chooseReframing,
  setQuestions,
  completeRound,
  currentRound,
  currentSession,
  answeredRounds,
  newThought,
  resumeThought,
  type BufferState,
  type Thought,
  type Round,
  type SVO,
  type Reframing,
  type Translation,
} from '@/lib/domain';

function Brand() {
  return (
    <div className="wordmark">
      <span className="mark" aria-hidden="true">
        [ ]
      </span>{' '}
      thought buffer
    </div>
  );
}
function Status({ thought }: { thought: Thought }) {
  return (
    <span
      className={`status status-${thought.status.toLowerCase().replaceAll(' ', '-')}`}
    >
      {thought.status}
    </span>
  );
}
function Navigation({
  data,
  openThought,
  overview,
  newEntry,
  connection,
}: {
  data: BufferState;
  openThought: (id: string) => void;
  overview: () => void;
  newEntry: () => void;
  connection: () => void;
}) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const navigate = (fn: () => void) => {
    fn();
    setOpenMobile(false);
  };
  return (
    <>
      <Sidebar className="buffer-sidebar">
        <SidebarHeader className="nav-header">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="nav-content">
          <button className="secondary" onClick={() => navigate(newEntry)}>
            <Plus size={17} /> New thought
          </button>
          <button className="nav-overview" onClick={() => navigate(overview)}>
            All thoughts <span>{data.thoughts.length}</span>
          </button>
          {data.thoughts.map((t, i) => (
            <button
              key={t.id}
              className={`thought-nav ${data.activeId === t.id && data.screen === 'thought' ? 'active' : ''}`}
              onClick={() => navigate(() => openThought(t.id))}
            >
              <span className="nav-number">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="nav-thought">
                <span>{t.original}</span>
                <span className="nav-current">Current: {t.current}</span>
                <Status thought={t} />
              </span>
            </button>
          ))}
        </SidebarContent>
        <SidebarFooter className="nav-footer">
          <button className="quiet" onClick={connection}>
            <Settings2 size={17} /> Connection
          </button>
          <span className="small muted">One thought at a time.</span>
        </SidebarFooter>
      </Sidebar>
      <button
        className="menu-button"
        aria-label="Toggle thought list"
        onClick={toggleSidebar}
      >
        <Menu size={21} />
      </button>
    </>
  );
}
function Changes({ result }: { result: Translation }) {
  return (
    <section className="translation-changes" aria-label="What changes">
      <h2>What changes</h2>
      <p className="preserve">{result.changes}</p>
      {result.unresolved && (
        <p className="muted preserve">
          <strong>Still unresolved: </strong>
          {result.unresolved}
        </p>
      )}
    </section>
  );
}
function History({ thought }: { thought: Thought }) {
  const completed = thought.sessions.flatMap((s, si) =>
    s.rounds.filter((r) => r.stage === 'done').map((r, ri) => ({ r, si, ri })),
  );
  return (
    <>
      {completed.length > 0 && (
        <details className="translation-history">
          <summary>Cycle history ({completed.length})</summary>
          {completed.map(({ r, si, ri }) => (
            <article key={r.id} className="history-cycle">
              <h2>
                Session {si + 1} · Cycle {ri + 1}
              </h2>
              <p>
                <strong>Starting statement: </strong>
                {r.seed}
              </p>
              <p>
                <strong>Your reframing: </strong>
                {r.reframings.find((x) => x.order === r.chosen)?.text}
              </p>
              <p>
                <strong>Question: </strong>
                {r.selected}
              </p>
              <p className="preserve">
                <strong>Your answer: </strong>
                {r.answer}
              </p>
              {r.result && (
                <>
                  <Changes result={r.result} />
                  <p>
                    <strong>Updated statement: </strong>
                    {r.result.svo.rewrite}
                  </p>
                  {r.result.handoff && (
                    <p>
                      <strong>Handoff: </strong>
                      {r.result.handoff.step} · {r.result.handoff.destination} ·{' '}
                      {r.result.handoff.purpose}
                    </p>
                  )}
                </>
              )}
            </article>
          ))}
        </details>
      )}
      {thought.legacy && (
        <details className="translation-history">
          <summary>Earlier app history · {thought.legacy.status}</summary>
          <p className="small muted">
            Preserved from the previous workflow. These rounds do not count
            toward translator sessions.
          </p>
          {thought.legacy.current && (
            <p>
              <strong>Previous statement: </strong>
              {thought.legacy.current}
            </p>
          )}
          {thought.legacy.action && (
            <p>
              <strong>Previous action: </strong>
              {thought.legacy.action}
            </p>
          )}
          {thought.legacy.sessions
            ?.flatMap((s) => s.rounds)
            .map((r, i) => (
              <article key={`${r.id}-${i}`} className="history-cycle">
                <p>
                  <strong>Question: </strong>
                  {r.custom?.trim() || r.selected}
                </p>
                <p className="preserve">
                  <strong>Answer: </strong>
                  {r.answer}
                </p>
                <p className="preserve">
                  <strong>What changes: </strong>
                  {r.aiChanges}
                </p>
                {r.userChanges && (
                  <p className="preserve">
                    <strong>Your additions: </strong>
                    {r.userChanges}
                  </p>
                )}
              </article>
            ))}
          {thought.legacy.decisions?.map((d, i) => (
            <p key={i}>
              {d.at} · {d.choice} · {d.action}
            </p>
          ))}
        </details>
      )}
    </>
  );
}
export default function Home() {
  const { data, update, ready, saveStatus, saveError, retrySave } = useBuffer();
  const [connected, setConnected] = useState(false),
    [connectionOpen, setConnectionOpen] = useState(false),
    [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(''),
    [errorThought, setErrorThought] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(''),
    [checking, setChecking] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    fetch('/api/connection')
      .then((r) => r.json())
      .then((v) =>
        setConnected(Boolean((v as { connected?: boolean }).connected)),
      )
      .catch(() => {});
  }, []);
  const thought = data.thoughts.find((t) => t.id === data.activeId);
  const round = thought && currentRound(thought);
  const session = thought && currentSession(thought);
  const latestResult = thought?.sessions
    .flatMap((s) => s.rounds)
    .filter((r) => r.result)
    .at(-1)?.result;
  const modify = (id: string, fn: (t: Thought) => Thought) =>
    update((s) => ({
      ...s,
      thoughts: s.thoughts.map((t) => (t.id === id ? fn(t) : t)),
    }));
  const patchRound = (changes: Partial<Round>) =>
    thought && modify(thought.id, (t) => changeRound(t, changes));
  const openThought = (id: string) => {
    setError('');
    update((s) => ({ ...s, activeId: id, screen: 'thought' }));
  };
  const overview = () => {
    setError('');
    update((s) => ({ ...s, activeId: null, screen: 'list' }));
  };
  const newEntry = () => {
    setError('');
    update((s) => ({ ...s, activeId: null, screen: 'entry' }));
  };
  const call = async <T,>(kind: string, t: Thought): Promise<T> => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, thought: t }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      if (response.status === 428) {
        setConnected(false);
        setConnectionOpen(true);
      }
      throw new Error(result.error || 'Please try again.');
    }
    return result as T;
  };
  const run = async (id: string, fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(id);
    setError('');
    setErrorThought(id);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      running.current = false;
      setBusy(null);
    }
  };
  const generateReframings = async (t: Thought) => {
    const result = await call<{ svo: SVO; reframings: Reframing[] }>(
      'reframings',
      t,
    );
    modify(t.id, (latest) =>
      appendReframings(latest, result.svo, result.reframings),
    );
  };
  const beginCycle = (t: Thought) => run(t.id, () => generateReframings(t));
  const getQuestions = (t: Thought) =>
    run(t.id, async () => {
      const result = await call<{ questions: string[] }>('questions', t);
      modify(t.id, (latest) => setQuestions(latest, result.questions));
    });
  const submitAnswer = (t: Thought) =>
    run(t.id, async () => {
      const result = await call<Translation>('changes', t);
      const translated = completeRound(t, result);
      modify(t.id, () => translated);
      if (translated.status === 'In progress')
        await generateReframings(translated);
    });
  const resume = (t: Thought) => {
    if (running.current) return;
    const resumed = resumeThought(t);
    modify(t.id, () => resumed);
    if (connected) void beginCycle(resumed);
  };
  const addThought = () => {
    const text = data.thoughts.length ? data.addDraft : data.drafts[0];
    if (!text.trim() || running.current) return;
    const added = newThought(text);
    update((s) => ({
      ...s,
      thoughts: [...s.thoughts, added],
      activeId: added.id,
      screen: 'thought',
      ...(s.thoughts.length ? { addDraft: '' } : { drafts: [''] }),
    }));
    if (connected) void beginCycle(added);
  };
  const saveConnection = async () => {
    setChecking(true);
    setConnectionError('');
    try {
      const response = await fetch('/api/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setConnected(true);
      setApiKey('');
      setConnectionOpen(false);
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setChecking(false);
    }
  };
  const entry = data.screen === 'entry';
  const hasThoughts = data.thoughts.length > 0;
  const entryDraft = hasThoughts ? data.addDraft : data.drafts[0];
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '290px' } as React.CSSProperties}
    >
      {hasThoughts && (
        <Navigation
          data={data}
          openThought={openThought}
          overview={overview}
          newEntry={newEntry}
          connection={() => setConnectionOpen(true)}
        />
      )}
      <main className={hasThoughts ? 'workspace' : 'entry'}>
        {hasThoughts ? (
          <header className="topbar">
            <span className="breadcrumb">
              Your buffer{' '}
              {thought && data.screen === 'thought' && (
                <>
                  <ChevronRight size={15} /> Thought{' '}
                  {data.thoughts.indexOf(thought) + 1}
                </>
              )}
            </span>
            <span className="save-state" role="status">
              {saveStatus}
            </span>
            {data.screen !== 'list' && (
              <button
                className="icon-button"
                aria-label="Close and return to thought list"
                onClick={overview}
              >
                <X size={21} />
              </button>
            )}
          </header>
        ) : (
          <div className="entry-top">
            <Brand />
            <button
              className="quiet small"
              onClick={() => setConnectionOpen(true)}
            >
              <span
                className={`connection-dot ${connected ? 'connected' : ''}`}
              />
              {connected ? 'Luna connected' : 'Connect Luna'}
            </button>
          </div>
        )}
        {saveError && (
          <div role="alert" className="notice error">
            {saveError}
            <button onClick={() => void retrySave()}>Retry save</button>
          </div>
        )}
        {!ready ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            {saveStatus}
          </div>
        ) : entry ? (
          <section className="single-entry">
            <div className="intro">
              <p className="eyebrow">ONE THOUGHT AT A TIME</p>
              <h1>
                Give a thought
                <br />a little room.
              </h1>
              <p>
                Start with what’s on your mind. We’ll work toward a concrete
                next step.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addThought();
              }}
            >
              <label className="field-label" htmlFor="original-thought">
                Your thought
              </label>
              <textarea
                id="original-thought"
                className="original-input"
                maxLength={8000}
                placeholder="Write a thought, just as it arrives…"
                value={entryDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  update((s) =>
                    hasThoughts
                      ? { ...s, addDraft: value }
                      : { ...s, drafts: [value] },
                  );
                }}
              />
              <div className="actions">
                <span className="small muted">
                  Choose a reframing. Answer a question. Get clearer.
                </span>
                <button
                  className="primary"
                  disabled={!!busy || !entryDraft?.trim()}
                  type="submit"
                >
                  Begin <ArrowRight size={18} />
                </button>
              </div>
            </form>
            <p className="entry-note small muted">
              {saveStatus}. Unresolved after ten cycles? It can wait in Pending.
            </p>
          </section>
        ) : data.screen === 'list' || !thought ? (
          <section className="overview">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR COLLECTION</p>
                <h1>Your thoughts.</h1>
              </div>
              <button className="primary" onClick={newEntry}>
                <Plus size={17} /> New thought
              </button>
            </div>
            <p className="muted">
              The starting thought stays. The current statement evolves.
            </p>
            <div className="collection">
              {data.thoughts.map((t) => (
                <button
                  className="collection-item"
                  key={t.id}
                  onClick={() => openThought(t.id)}
                >
                  <span className="collection-text">
                    <span className="source-label">STARTING THOUGHT</span>
                    {t.original}
                    <small>
                      <strong>Current statement: </strong>
                      {t.current}
                    </small>
                  </span>
                  <Status thought={t} />
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
            {data.drafts[0]?.trim() && (
              <button
                className="secondary"
                onClick={() => {
                  update((s) => ({
                    ...s,
                    addDraft: s.drafts[0],
                    drafts: [''],
                    screen: 'entry',
                  }));
                }}
              >
                Continue saved starting draft
              </button>
            )}
          </section>
        ) : (
          <section className="thought-work translator-work">
            <div className="thought-title">
              <div>
                <p className="eyebrow">STARTING THOUGHT</p>
                <p className="original-statement preserve">
                  {thought.original}
                </p>
              </div>
              <Status thought={thought} />
            </div>
            <section className="current-statement">
              <p className="eyebrow">CURRENT STATEMENT</p>
              <h1>{thought.current}</h1>
              {thought.svo && (
                <dl className="meaning-grid">
                  <div>
                    <dt>Actor</dt>
                    <dd>{thought.svo.subject}</dd>
                  </div>
                  <div>
                    <dt>Action or state</dt>
                    <dd>{thought.svo.verb}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{thought.svo.object}</dd>
                  </div>
                </dl>
              )}
            </section>
            {latestResult && <Changes result={latestResult} />}
            {error && errorThought === thought.id && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {!connected && thought.status === 'In progress' && (
              <div className="notice">
                Connect Luna to continue. Your thought is saved.
                <button onClick={() => setConnectionOpen(true)}>
                  Connect Luna <ArrowRight size={16} />
                </button>
              </div>
            )}
            {thought.status === 'Finished' && thought.handoff ? (
              <section
                className="resolution handoff"
                aria-label="Finished handoff"
              >
                <p className="eyebrow">FINISHED · READY FOR HANDOFF</p>
                <h2>{thought.handoff.step}</h2>
                <p>
                  <strong>Where or with whom: </strong>
                  {thought.handoff.destination}
                </p>
                <p>
                  <strong>What this resolves or accomplishes: </strong>
                  {thought.handoff.purpose}
                </p>
                <p className="small muted">
                  The translation is finished. Taking the next step is up to
                  you.
                </p>
                <div className="actions">
                  <button className="secondary" onClick={overview}>
                    All thoughts
                  </button>
                  <button className="primary" onClick={newEntry}>
                    <Plus size={17} /> New thought
                  </button>
                </div>
              </section>
            ) : thought.status === 'Pending' ? (
              <section className="resolution">
                <p className="eyebrow">PENDING</p>
                <h2>This thought can wait.</h2>
                <p>
                  {answeredRounds(thought) >= 10
                    ? 'Ten answered cycles, with no concrete handoff yet.'
                    : 'This thought was left pending in the earlier workflow.'}{' '}
                  Your statement and history are saved.
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => resume(thought)}
                  >
                    Start another session
                  </button>
                  <button className="primary" onClick={newEntry}>
                    <Plus size={17} /> New thought
                  </button>
                </div>
              </section>
            ) : (
              <section className="cycle-panel" aria-label="Current cycle">
                <div className="section-heading">
                  <h2>
                    {!round ||
                    round.stage === 'done' ||
                    ['reframe', 'questions'].includes(round.stage)
                      ? 'Which statement do you identify with most?'
                      : 'Choose one question to answer'}
                  </h2>
                  <span className="round-counter">
                    Session {thought.sessions.length || 1} · Cycle{' '}
                    {Math.min(
                      10,
                      (session?.rounds.length || 0) +
                        (!round || round.stage === 'done' ? 1 : 0),
                    )}{' '}
                    of 10
                  </span>
                </div>
                {!round || round.stage === 'done' ? (
                  <button
                    className="primary"
                    disabled={!!busy || !connected}
                    onClick={() => void beginCycle(thought)}
                  >
                    {busy === thought.id
                      ? 'Preparing reframings…'
                      : 'Get six reframings'}
                    <ArrowRight size={17} />
                  </button>
                ) : ['reframe', 'questions'].includes(round.stage) ? (
                  <>
                    <RadioGroup
                      className="reframing-grid"
                      aria-label="Six reframings"
                      value={round.chosen}
                      disabled={!!busy}
                      onValueChange={(order) =>
                        modify(thought.id, (t) => chooseReframing(t, order))
                      }
                    >
                      {round.reframings.map((r, i) => (
                        <label
                          className={`question-option reframing-option ${round.chosen === r.order ? 'selected' : ''}`}
                          key={r.order}
                        >
                          <RadioGroupItem value={r.order} aria-label={r.text} />
                          <span>
                            <small>{String(i + 1).padStart(2, '0')}</small>
                            {r.text}
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                    <div className="next-row">
                      <button
                        className="primary"
                        disabled={!!busy || !connected || !round.chosen}
                        onClick={() => void getQuestions(thought)}
                      >
                        Get three questions <ArrowRight size={17} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="chosen-reframing">
                      <span className="source-label">YOUR REFRAMING</span>
                      {
                        round.reframings.find((r) => r.order === round.chosen)
                          ?.text
                      }
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitAnswer(thought);
                      }}
                    >
                      <fieldset disabled={!!busy}>
                        <RadioGroup
                          className="question-list"
                          aria-label="Three questions"
                          value={round.selected}
                          onValueChange={(selected) => patchRound({ selected })}
                        >
                          {round.options.map((q, i) => (
                            <label
                              key={q}
                              className={`question-option ${round.selected === q ? 'selected' : ''}`}
                            >
                              <RadioGroupItem value={q} aria-label={q} />
                              <span>
                                <small>QUESTION {i + 1}</small>
                                {q}
                              </span>
                            </label>
                          ))}
                        </RadioGroup>
                        <label
                          className="field-label answer-label"
                          htmlFor="cycle-answer"
                        >
                          Your answer
                          {round.selected && (
                            <span className="answer-question">
                              {round.selected}
                            </span>
                          )}
                        </label>
                        <textarea
                          id="cycle-answer"
                          className="answer-box"
                          maxLength={12000}
                          placeholder="Answer in your own words…"
                          value={round.answer}
                          onChange={(e) =>
                            patchRound({ answer: e.target.value })
                          }
                        />
                        <div className="next-row">
                          <button
                            className="primary"
                            type="submit"
                            disabled={
                              !connected ||
                              !round.selected ||
                              !round.answer.trim()
                            }
                          >
                            Translate my answer <ArrowRight size={17} />
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  </>
                )}
              </section>
            )}
            <History thought={thought} />
          </section>
        )}
        {busy && (
          <div className="working-indicator" role="status">
            <LoaderCircle className="spin" size={17} />
            Luna is working on thought{' '}
            {data.thoughts.findIndex((t) => t.id === busy) + 1}…
          </div>
        )}
      </main>
      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <DialogContent className="connection-dialog">
          <DialogHeader>
            <DialogTitle>Connect GPT-5.6 Luna</DialogTitle>
            <DialogDescription>
              Use your OpenAI API key to power the questions and reflections.
            </DialogDescription>
          </DialogHeader>
          <p className="small">
            Your collection is saved on this Mac. The thought you’re working on
            and its history are sent to OpenAI for each response.
          </p>
          <p className="small muted">
            Your key is stored in a private local file, outside the browser. API
            usage is billed separately from ChatGPT.
          </p>
          <label className="field-label">
            OpenAI API key
            <input
              autoComplete="off"
              type="password"
              value={apiKey}
              placeholder={
                connected
                  ? 'Enter a new key to replace your connection'
                  : 'Paste your API key here'
              }
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          {connectionError && (
            <p className="error-text" role="alert">
              {connectionError}
            </p>
          )}
          <a
            className="text-link small"
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            Open OpenAI API keys ↗
          </a>
          <button
            className="primary"
            disabled={checking || !apiKey.trim()}
            onClick={() => void saveConnection()}
          >
            {checking && <LoaderCircle className="spin" size={17} />}
            {checking ? 'Checking Luna…' : 'Connect & verify'}
          </button>
          <p className="small muted">
            Verification makes one short test request without using your
            thoughts.
          </p>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
