'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Menu,
  Plus,
  Settings2,
  X,
  LoaderCircle,
  PencilLine,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBuffer } from '@/lib/use-buffer';
import {
  appendRound,
  changeRound,
  currentRound,
  currentSession,
  decide,
  finishReview,
  newThought,
  nextThought,
  resumeThought,
  roundQuestion,
  type BufferState,
  type Thought,
  type Round,
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
function Navigation({
  data,
  openThought,
  overview,
  connection,
}: {
  data: BufferState;
  openThought: (id: string) => void;
  overview: () => void;
  connection: () => void;
}) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  return (
    <>
      <Sidebar className="buffer-sidebar">
        <SidebarHeader className="nav-header">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="nav-content">
          <button
            className="nav-overview"
            onClick={() => {
              overview();
              setOpenMobile(false);
            }}
          >
            All thoughts <span>{data.thoughts.length}</span>
          </button>
          <p className="eyebrow nav-label">YOUR BUFFER</p>
          {data.thoughts.map((t, i) => (
            <button
              key={t.id}
              className={`thought-nav ${data.activeId === t.id && data.screen === 'thought' ? 'active' : ''}`}
              onClick={() => {
                openThought(t.id);
                setOpenMobile(false);
              }}
            >
              <span className="nav-number">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="nav-thought">
                <span>{t.title}</span>
                <span
                  className={`status status-${t.status.replaceAll(' ', '-').toLowerCase()}`}
                >
                  {t.status}
                </span>
              </span>
            </button>
          ))}
        </SidebarContent>
        <SidebarFooter className="nav-footer">
          <button className="quiet" onClick={connection}>
            <Settings2 size={17} /> Connection
          </button>
          <span className="small muted">Your pace. Your decision.</span>
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
export default function Home() {
  const { data, update, ready, saveStatus, saveError, retrySave } = useBuffer();
  const [connected, setConnected] = useState(false),
    [connectionOpen, setConnectionOpen] = useState(false),
    [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(''),
    [connectionError, setConnectionError] = useState(''),
    [checking, setChecking] = useState(false);
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
  const editable =
    thought?.status === 'In progress' || thought?.status === 'Not started';
  const modify = (id: string, fn: (t: Thought) => Thought) =>
    update((s) => ({
      ...s,
      thoughts: s.thoughts.map((t) => (t.id === id ? fn(t) : t)),
    }));
  const patch = (changes: Partial<Thought>) =>
    thought && modify(thought.id, (t) => ({ ...t, ...changes }));
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
  const call = async (kind: string, t: Thought) => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, thought: t }),
    });
    const result = (await response.json()) as {
      error?: string;
      subject: string;
      verb: string;
      object: string;
      rewrite: string;
      action: string;
      questions: string[];
      changes: string;
    };
    if (!response.ok) {
      if (response.status === 428) setConnectionOpen(true);
      throw new Error(result.error || 'Please try again.');
    }
    return result;
  };
  const run = async (id: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };
  const rewrite = (t: Thought) =>
    run(t.id, async () => {
      const result = await call('svo', t);
      modify(t.id, (latest) => ({
        ...latest,
        svo: {
          subject: result.subject,
          verb: result.verb,
          object: result.object,
          rewrite: result.rewrite,
        },
        current: result.rewrite,
        action: result.action,
        status: 'In progress',
      }));
    });
  const questions = (t: Thought) =>
    run(t.id, async () => {
      const result = await call('questions', t);
      modify(t.id, (latest) => appendRound(latest, result.questions));
    });
  const submitAnswer = (t: Thought) =>
    run(t.id, async () => {
      const result = await call('changes', t);
      modify(t.id, (latest) =>
        changeRound(latest, { aiChanges: result.changes, stage: 'review' }),
      );
    });
  const advance = (t: Thought) => {
    const updated = finishReview(t);
    if (updated.status === 'Pending') {
      update((s) => nextThought(s, updated));
      setError('');
    } else {
      modify(t.id, () => updated);
      void questions(updated);
    }
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
      const result = (await response.json()) as {
        error?: string;
        subject: string;
        verb: string;
        object: string;
        rewrite: string;
        action: string;
        questions: string[];
        changes: string;
      };
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
  const decideNow = (choice: 'Accepted' | 'Rejected') => {
    if (thought) {
      const updated = decide(thought, choice);
      modify(thought.id, () => updated);
    }
  };
  const pending = () =>
    thought && update((s) => nextThought(s, { ...thought, status: 'Pending' }));
  const entry = data.screen === 'entry';
  return (
    <SidebarProvider
      defaultOpen={true}
      style={{ '--sidebar-width': '270px' } as React.CSSProperties}
    >
      {!entry && (
        <Navigation
          data={data}
          openThought={openThought}
          overview={overview}
          connection={() => setConnectionOpen(true)}
        />
      )}
      <main className={entry ? 'entry' : 'workspace'}>
        {entry ? (
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
        ) : (
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
            {data.screen === 'thought' && (
              <button
                className="icon-button"
                aria-label="Close thought and return to list"
                onClick={overview}
              >
                <X size={21} />
              </button>
            )}
          </header>
        )}
        {saveError && (
          <div role="alert" className="notice error">
            {saveError}{' '}
            <button onClick={() => void retrySave()}>Retry save</button>
          </div>
        )}
        {!ready ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            {saveStatus}
          </div>
        ) : entry ? (
          <>
            <div className="intro">
              <p className="eyebrow">A PLACE TO BEGIN</p>
              <h1>
                Give your thoughts
                <br />a little room.
              </h1>
              <p>Add at least five thoughts that you want to deconstruct.</p>
            </div>
            <div className="thought-inputs">
              {data.drafts.map((v, i) => (
                <label className="thought-input" key={i}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <textarea
                    maxLength={8000}
                    aria-label={`Thought ${i + 1}`}
                    placeholder="Write a thought, just as it arrives…"
                    value={v}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        drafts: s.drafts.map((text, j) =>
                          j === i ? e.target.value : text,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="actions">
              <button
                className="secondary"
                onClick={() =>
                  update((s) => ({ ...s, drafts: [...s.drafts, ''] }))
                }
              >
                <Plus size={17} />
                Add another thought
              </button>
              <div className="inline">
                <span className="small muted">
                  {data.drafts.filter((v) => v.trim()).length} / 5 minimum
                </span>
                <button
                  className="primary"
                  disabled={data.drafts.filter((v) => v.trim()).length < 5}
                  onClick={() =>
                    update((s) => {
                      const thoughts = s.drafts
                        .filter((v) => v.trim())
                        .map(newThought);
                      return {
                        ...s,
                        thoughts,
                        drafts: ['', '', '', '', ''],
                        activeId: thoughts[0].id,
                        screen: 'thought',
                      };
                    })
                  }
                >
                  Begin
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
            <p className="entry-note small muted">
              {saveStatus}. You can leave any thought unresolved.
            </p>
          </>
        ) : data.screen === 'list' || !thought ? (
          <section className="overview">
            <p className="eyebrow">YOUR COLLECTION</p>
            <h1>A little more perspective.</h1>
            <p className="muted">Pick up a thought wherever you left it.</p>
            <div className="collection">
              {data.thoughts.map((t, i) => (
                <button
                  className="collection-item"
                  key={t.id}
                  onClick={() => openThought(t.id)}
                >
                  <span className="nav-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="collection-text">
                    {t.original}
                    <small>
                      {t.decisions.at(-1) &&
                      ['Accepted', 'Rejected'].includes(t.status)
                        ? `${t.status === 'Accepted' ? 'YES' : 'NO'} · ${t.decisions.at(-1)!.action}`
                        : `${t.sessions.reduce((n, s) => n + s.rounds.filter((r) => r.stage !== 'answer').length, 0)} answered rounds`}
                    </small>
                  </span>
                  <span
                    className={`status status-${t.status.replaceAll(' ', '-').toLowerCase()}`}
                  >
                    {t.status}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
            <div className="add-thought">
              <label htmlFor="add-thought">Another thought on your mind?</label>
              <textarea
                id="add-thought"
                maxLength={8000}
                value={data.addDraft}
                placeholder="Write it here…"
                onChange={(e) =>
                  update((s) => ({ ...s, addDraft: e.target.value }))
                }
              />
              <button
                className="secondary"
                disabled={!data.addDraft.trim()}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    thoughts: [...s.thoughts, newThought(s.addDraft)],
                    addDraft: '',
                  }))
                }
              >
                <Plus size={17} />
                Add thought
              </button>
            </div>
          </section>
        ) : (
          <section className="thought-work">
            <div className="thought-title">
              <div>
                <p className="eyebrow">
                  THOUGHT{' '}
                  {String(data.thoughts.indexOf(thought) + 1).padStart(2, '0')}
                </p>
                <h1>{thought.original}</h1>
              </div>
              <span
                className={`status status-${thought.status.replaceAll(' ', '-').toLowerCase()}`}
              >
                {thought.status}
              </span>
            </div>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {!connected && (
              <div className="notice">
                Connect GPT-5.6 Luna to start the questions. Your thoughts stay
                saved while you set it up.
                <button onClick={() => setConnectionOpen(true)}>
                  Connect Luna <ArrowRight size={15} />
                </button>
              </div>
            )}
            {!thought.svo ? (
              <div className="svo-start">
                <span className="step-number">01</span>
                <h2>Find the subject, verb, and object.</h2>
                <p className="muted">
                  Start with an editable rewrite. Keep the meaning yours.
                </p>
                <button
                  className="primary"
                  disabled={!!busy || !connected || !editable}
                  onClick={() => void rewrite(thought)}
                >
                  {busy === thought.id ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <PencilLine size={18} />
                  )}
                  Rewrite into SVO
                </button>
              </div>
            ) : (
              <>
                <div className="svo-section">
                  <div className="section-heading">
                    <h2>Subject · Verb · Object</h2>
                    <span className="small muted">
                      {thought.confirmed
                        ? 'Starting interpretation'
                        : 'Review your starting interpretation'}
                    </span>
                  </div>
                  <fieldset disabled={!!busy || !editable}>
                    <div className="svo-grid">
                      {(['subject', 'verb', 'object'] as const).map(
                        (part, i) => (
                          <label key={part}>
                            <span className="svo-label">
                              <b>{['S', 'V', 'O'][i]}</b>
                              {part}
                            </span>
                            <input
                              maxLength={8000}
                              aria-label={`SVO ${part}`}
                              value={thought.svo![part]}
                              onChange={(e) =>
                                patch({
                                  svo: {
                                    ...thought.svo!,
                                    [part]: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <label className="field-label">
                      SVO rewrite
                      <textarea
                        maxLength={8000}
                        value={thought.svo.rewrite}
                        onChange={(e) =>
                          patch({
                            svo: { ...thought.svo!, rewrite: e.target.value },
                            ...(!thought.confirmed
                              ? { current: e.target.value }
                              : {}),
                          })
                        }
                      />
                    </label>
                  </fieldset>
                  {!thought.confirmed && (
                    <div className="actions">
                      <p className="small muted">
                        Edit anything that doesn’t fit.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          !!busy || !editable || !thought.svo.rewrite.trim()
                        }
                        onClick={() => {
                          const t = {
                            ...thought,
                            confirmed: true,
                            status: 'In progress' as const,
                          };
                          modify(thought.id, () => t);
                          if (connected) void questions(t);
                        }}
                      >
                        Use this rewrite
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
                <fieldset
                  disabled={!!busy || !editable}
                  className="current-fields"
                >
                  <label>
                    <span className="field-label">Current thought</span>
                    <textarea
                      maxLength={8000}
                      value={thought.current}
                      onChange={(e) => patch({ current: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="field-label">Action being considered</span>
                    <textarea
                      maxLength={8000}
                      value={thought.action}
                      placeholder="Name the specific action you might take…"
                      onChange={(e) => patch({ action: e.target.value })}
                    />
                  </label>
                </fieldset>
                {thought.confirmed && (
                  <>
                    <div className="section-heading round-heading">
                      <h2>Make a little more sense of it.</h2>
                      <span className="round-counter">
                        Session {thought.sessions.length || 1} · Round{' '}
                        {session?.rounds.length || 1} of 10
                      </span>
                    </div>
                    <Table className="round-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <span>01</span> Question
                          </TableHead>
                          <TableHead>
                            <span>02</span> Your answer
                          </TableHead>
                          <TableHead>
                            <span>03</span> What changes
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {thought.sessions.flatMap((s, si) =>
                          s.rounds.map((r, ri) => {
                            const active = r.id === round?.id && !!editable;
                            return (
                              <TableRow
                                key={r.id}
                                className={
                                  active ? 'active-round' : 'past-round'
                                }
                              >
                                <TableCell>
                                  <span className="round-meta">
                                    Session {si + 1} / Round {ri + 1}
                                  </span>
                                  {active && r.stage === 'answer' ? (
                                    <fieldset disabled={!!busy}>
                                      <RadioGroup
                                        aria-label="Choose a question"
                                        value={
                                          r.custom.trim() ? '' : r.selected
                                        }
                                        onValueChange={(v) =>
                                          patchRound({
                                            selected: String(v),
                                            custom: '',
                                          })
                                        }
                                      >
                                        {r.options.map((q, qi) => (
                                          <label
                                            className={`question-option ${!r.custom.trim() && r.selected === q ? 'selected' : ''}`}
                                            key={q}
                                          >
                                            <RadioGroupItem
                                              value={q}
                                              aria-label={q}
                                            />
                                            <span>
                                              <small>
                                                {String(qi + 1).padStart(
                                                  2,
                                                  '0',
                                                )}
                                              </small>
                                              {q}
                                            </span>
                                          </label>
                                        ))}
                                      </RadioGroup>
                                      <label className="own-label">
                                        Or write your own question
                                        <textarea
                                          maxLength={8000}
                                          aria-label="Your own question"
                                          placeholder="What would you like to ask?"
                                          value={r.custom}
                                          onChange={(e) =>
                                            patchRound({
                                              custom: e.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                    </fieldset>
                                  ) : (
                                    <>
                                      <p>{roundQuestion(r)}</p>
                                      <details>
                                        <summary>Question options</summary>
                                        {r.options.map((q) => (
                                          <p className="small muted" key={q}>
                                            {q}
                                          </p>
                                        ))}
                                        {r.custom && (
                                          <p className="small">
                                            Your question: {r.custom}
                                          </p>
                                        )}
                                      </details>
                                    </>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {active && r.stage === 'answer' ? (
                                    <>
                                      <label
                                        className="sr-only"
                                        htmlFor={`answer-${r.id}`}
                                      >
                                        Your answer
                                      </label>
                                      <textarea
                                        id={`answer-${r.id}`}
                                        className="answer-box"
                                        maxLength={12000}
                                        placeholder="Take your time. What comes to mind?"
                                        value={r.answer}
                                        disabled={!!busy}
                                        onChange={(e) =>
                                          patchRound({ answer: e.target.value })
                                        }
                                      />
                                      <button
                                        className="primary full"
                                        disabled={
                                          !!busy ||
                                          !r.answer.trim() ||
                                          !roundQuestion(r).trim() ||
                                          !connected
                                        }
                                        onClick={() =>
                                          void submitAnswer(thought)
                                        }
                                      >
                                        {busy === thought.id ? (
                                          <LoaderCircle
                                            className="spin"
                                            size={17}
                                          />
                                        ) : null}
                                        Review my answer
                                        <ArrowRight size={17} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <p className="preserve">{r.answer}</p>
                                      {active && r.stage === 'review' && (
                                        <button
                                          className="quiet small"
                                          disabled={!!busy}
                                          onClick={() =>
                                            patchRound({ stage: 'answer' })
                                          }
                                        >
                                          Edit answer
                                        </button>
                                      )}
                                    </>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {r.aiChanges ? (
                                    <>
                                      <div className="ai-change">
                                        <span className="source-label">
                                          LUNA
                                        </span>
                                        <p>{r.aiChanges}</p>
                                      </div>
                                      {active && r.stage === 'review' ? (
                                        <>
                                          <label className="own-label">
                                            Your additions or corrections
                                            <textarea
                                              maxLength={12000}
                                              aria-label="Your changes"
                                              placeholder="What else changed—or what did Luna misunderstand?"
                                              value={r.userChanges}
                                              disabled={!!busy}
                                              onChange={(e) =>
                                                patchRound({
                                                  userChanges: e.target.value,
                                                })
                                              }
                                            />
                                          </label>
                                          <p className="small muted">
                                            Both boxes inform the next
                                            questions.
                                          </p>
                                          <button
                                            className="primary full"
                                            disabled={
                                              !!busy || (ri < 9 && !connected)
                                            }
                                            onClick={() => advance(thought)}
                                          >
                                            {ri === 9
                                              ? 'Leave pending & move on'
                                              : 'Next questions'}
                                            <ArrowRight size={17} />
                                          </button>
                                        </>
                                      ) : (
                                        r.userChanges && (
                                          <div className="your-change">
                                            <span className="source-label">
                                              YOU
                                            </span>
                                            <p className="preserve">
                                              {r.userChanges}
                                            </p>
                                          </div>
                                        )
                                      )}
                                    </>
                                  ) : (
                                    <div className="awaiting">
                                      <span className="source-label">
                                        A LITTLE SPACE TO REFLECT
                                      </span>
                                      <p>
                                        Luna will describe what your answer
                                        changes.
                                      </p>
                                      <label className="own-label">
                                        Your additions or corrections
                                        <textarea
                                          disabled
                                          placeholder="Add anything Luna misses after the review."
                                        />
                                      </label>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          }),
                        )}
                      </TableBody>
                    </Table>
                    {(!round || round.stage === 'done') &&
                      editable &&
                      (session?.rounds.length || 0) < 10 && (
                        <div className="next-row">
                          <button
                            className="primary"
                            disabled={!!busy || !connected}
                            onClick={() => void questions(thought)}
                          >
                            {busy === thought.id ? (
                              <LoaderCircle className="spin" size={18} />
                            ) : null}
                            {round
                              ? 'Get next questions'
                              : 'Get three questions'}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      )}
                  </>
                )}
              </>
            )}
            {editable ? (
              <div className="decision-bar">
                <div>
                  <span className="source-label">YOUR DECISION</span>
                  <p>
                    {thought.action.trim() ||
                      'Name an action above to choose YES or NO.'}
                  </p>
                </div>
                <div className="decision-buttons">
                  <button
                    className="accept"
                    disabled={!!busy || !thought.action.trim()}
                    onClick={() => decideNow('Accepted')}
                  >
                    <Check size={18} />
                    <span>
                      YES<small>I choose to do this</small>
                    </span>
                  </button>
                  <button
                    className="reject"
                    disabled={!!busy || !thought.action.trim()}
                    onClick={() => decideNow('Rejected')}
                  >
                    <X size={18} />
                    <span>
                      NO<small>I choose not to</small>
                    </span>
                  </button>
                  <button className="quiet" disabled={!!busy} onClick={pending}>
                    <Clock3 size={17} />
                    Pending
                  </button>
                </div>
              </div>
            ) : (
              <div className="resolution">
                <span className="source-label">
                  {thought.status === 'Pending'
                    ? 'ROOM TO COME BACK'
                    : 'DECISION SAVED'}
                </span>
                <h2>
                  {thought.status === 'Pending'
                    ? 'This thought can wait.'
                    : thought.status === 'Accepted'
                      ? 'You choose to act.'
                      : 'You choose not to act.'}
                </h2>
                <p>
                  {thought.status === 'Pending'
                    ? 'Your wording, answers, and changes are all here when you return.'
                    : thought.decisions.at(-1)?.action}
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => modify(thought.id, resumeThought)}
                  >
                    {thought.status === 'Pending' &&
                    (session?.rounds.length || 0) >= 10 &&
                    round?.stage === 'done'
                      ? 'Start another 10-round session'
                      : 'Revisit this thought'}
                  </button>
                  <button
                    className="primary"
                    onClick={() => update((s) => nextThought(s, thought))}
                  >
                    Move on
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            )}
            {thought.decisions.length > 0 && (
              <details className="decision-history">
                <summary>Decision history ({thought.decisions.length})</summary>
                {thought.decisions.map((d, i) => (
                  <p key={i} className="small">
                    {new Date(d.at).toLocaleString()} ·{' '}
                    {d.choice === 'Accepted' ? 'YES' : 'NO'} · {d.action}
                  </p>
                ))}
              </details>
            )}
            {busy === thought.id && (
              <div className="working-indicator" role="status">
                <LoaderCircle size={17} className="spin" />
                Luna is thinking…
              </div>
            )}
          </section>
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
