/**
 * Promise-based sleep that can be interrupted (used so Pause/Stop take effect
 * immediately instead of waiting out a long inter-email delay).
 */
export const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });

/** Adds +/- 20% random jitter so sends look less robotic to spam filters. */
export const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));
