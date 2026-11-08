import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchForUpdates, UPDATE_CHECK_INTERVAL_MS } from './updates.js';

/** A stand-in for `navigator.serviceWorker`, firing its events on demand. */
function fakeWorkers({ controlled = true, update = () => Promise.resolve() } = {}) {
  const listeners = {};
  const registration = { update: vi.fn(update) };
  return {
    registration,
    container: {
      controller: controlled ? {} : null,
      register: vi.fn(() => Promise.resolve(registration)),
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    },
    fire: (type) => (listeners[type] ?? []).forEach((fn) => fn()),
  };
}

/** A stand-in for `document`, with a visibility that can be changed. */
function fakeDocument() {
  const listeners = [];
  const doc = {
    visibilityState: 'visible',
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.push(fn); },
    show() { doc.visibilityState = 'visible'; listeners.forEach((fn) => fn()); },
    hide() { doc.visibilityState = 'hidden'; listeners.forEach((fn) => fn()); },
  };
  return doc;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('looking for a newer build', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  // @spec PRESENT-BUILD-007
  it('registers the worker that fetches new builds, and asks again on an interval', async () => {
    const workers = fakeWorkers();
    watchForUpdates({ container: workers.container, document: fakeDocument(), onAvailable: () => {} });
    await flush();

    expect(workers.container.register).toHaveBeenCalledTimes(1);
    expect(workers.registration.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(workers.registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(workers.registration.update).toHaveBeenCalledTimes(2);
  });

  // @spec PRESENT-BUILD-007
  it('asks again when the page comes back to the foreground, and not when it leaves', async () => {
    const workers = fakeWorkers();
    const doc = fakeDocument();
    watchForUpdates({ container: workers.container, document: doc, onAvailable: () => {} });
    await flush();

    doc.hide();
    expect(workers.registration.update).not.toHaveBeenCalled();
    doc.show();
    expect(workers.registration.update).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-BUILD-007
  it('shrugs off a check that fails, as one offline will', async () => {
    const workers = fakeWorkers({ update: () => Promise.reject(new Error('offline')) });
    watchForUpdates({ container: workers.container, document: fakeDocument(), onAvailable: () => {} });
    await flush();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    await flush();
    expect(workers.registration.update).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-BUILD-007
  it('does nothing where there are no service workers', () => {
    expect(() => watchForUpdates({ container: undefined, document: fakeDocument(), onAvailable: () => {} }))
      .not.toThrow();
  });
});

describe('announcing a newer build', () => {
  // @spec PRESENT-BUILD-008
  it('announces a build installed in place of the one running', () => {
    const workers = fakeWorkers({ controlled: true });
    const onAvailable = vi.fn();
    watchForUpdates({ container: workers.container, document: fakeDocument(), onAvailable });

    workers.fire('controllerchange');
    expect(onAvailable).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-BUILD-010
  it('says nothing when the page comes under its first worker, and speaks up after', () => {
    const workers = fakeWorkers({ controlled: false });
    const onAvailable = vi.fn();
    watchForUpdates({ container: workers.container, document: fakeDocument(), onAvailable });

    workers.fire('controllerchange');
    expect(onAvailable).not.toHaveBeenCalled();

    workers.fire('controllerchange');
    expect(onAvailable).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-BUILD-009
  it('never reloads the page itself', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    try {
      const workers = fakeWorkers({ controlled: true });
      watchForUpdates({ container: workers.container, document: fakeDocument(), onAvailable: () => {} });
      workers.fire('controllerchange');
      expect(reload).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
