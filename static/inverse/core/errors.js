/** Exceptions the solver survives with a fallback value (a catch that goes on
 * as if the step had failed): noted here, never rethrown, so a crash is not
 * invisible while the search does what it did before. The last MAX_NOTED are
 * on globalThis.__malErrors as {where, name, message}; each place warns on the
 * console once. */
const MAX_NOTED = 50;
const warned = new Set();

/** Note `error`, caught at `where` (file and step), and return nothing. */
export function noteError(where, error) {
  try {
    const noted = (globalThis.__malErrors ??= []);
    noted.push({where, name: error?.name ?? typeof error, message: String(error?.message ?? error)});
    if (noted.length > MAX_NOTED) noted.splice(0, noted.length - MAX_NOTED);
    if (!warned.has(where)) {
      warned.add(where);
      console.warn(`Mal: ${where} failed; going on with its fallback.`, error);
    }
  } catch {
    // Noting never changes what the caller does: a failure to note is dropped.
  }
}
