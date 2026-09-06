'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { emptyState, migrateState, type BufferState } from './domain';
const recoveryKey = 'thought-buffer-unsaved-v1';
export function useBuffer() {
  const [data, setData] = useState<BufferState>(emptyState);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading your thoughts…');
  const [saveError, setSaveError] = useState('');
  const ref = useRef(data),
    revision = useRef(0),
    queued = useRef<BufferState | null>(null),
    saving = useRef(false),
    blocked = useRef(false);
  const recovery = (value: BufferState) => {
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({ revision: revision.current, data: value }),
      );
    } catch {
      /* Disk persistence remains authoritative. */
    }
  };
  const pump = useCallback(async () => {
    if (saving.current || blocked.current) return;
    saving.current = true;
    while (queued.current) {
      const value = queued.current;
      queued.current = null;
      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, data: value }),
        });
        const result = (await response.json()) as {
          revision: number;
          data?: BufferState;
          error?: string;
        };
        if (!response.ok) {
          if (response.status === 409) blocked.current = true;
          throw new Error(result.error || 'Could not save your thoughts.');
        }
        revision.current = result.revision;
        if (!queued.current) {
          sessionStorage.removeItem(recoveryKey);
          setSaveStatus('Saved on this Mac');
          setSaveError('');
        } else recovery(queued.current);
      } catch (e) {
        queued.current ??= value;
        setSaveStatus('Changes waiting to save');
        setSaveError(
          e instanceof Error
            ? e.message
            : 'Could not save. Keep this window open and try again.',
        );
        break;
      }
    }
    saving.current = false;
  }, []);
  useEffect(() => {
    let stopped = false;
    fetch('/api/state')
      .then(async (response) => {
        const result = (await response.json()) as {
          revision: number;
          data?: BufferState;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error);
        if (stopped) return;
        revision.current = result.revision;
        let initial = migrateState(result.data);
        const raw = sessionStorage.getItem(recoveryKey);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.revision === result.revision) {
            initial = migrateState(draft.data);
            queued.current = initial;
          } else if (JSON.stringify(draft.data) !== JSON.stringify(initial)) {
            setSaveError(
              'A draft from another save is still kept in this browser. The latest saved collection has been loaded.',
            );
          }
        }
        ref.current = initial;
        setData(initial);
        setReady(true);
        setSaveStatus('Saved on this Mac');
        void pump();
      })
      .catch((e) => {
        if (!stopped) {
          setSaveError(
            e.message || 'Could not load your thoughts. Reload to try again.',
          );
          setSaveStatus('Unable to load');
        }
      });
    const unload = (event: BeforeUnloadEvent) => {
      if (saving.current || queued.current) {
        recovery(ref.current);
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      stopped = true;
      window.removeEventListener('beforeunload', unload);
    };
  }, [pump]);
  const update = useCallback(
    (fn: (state: BufferState) => BufferState) => {
      const next = fn(ref.current);
      ref.current = next;
      setData(next);
      recovery(next);
      queued.current = next;
      setSaveStatus('Saving…');
      void pump();
    },
    [pump],
  );
  return { data, update, ready, saveStatus, saveError, retrySave: pump };
}
