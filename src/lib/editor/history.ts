/**
 * Tegn's Fortryd and Gentag: the states edits left behind, the newest last, and the ones Fortryd
 * took back, the next for Gentag last.
 *
 * A state goes in as it is, not copied, and the history is never changed in place: every step makes
 * a new one. So a state must not be changed after it goes in; Tegn's are made of cuts it never
 * changes in place, only replaces.
 */
export type History<T> = { readonly undo: readonly T[]; readonly redo: readonly T[] };

/** How many Fortryd steps are kept: an edit past them lets the oldest go. */
export const HISTORY_LIMIT = 200;

export function emptyHistory<T>(): History<T> {
	return { undo: [], redo: [] };
}

/**
 * An edit made, `before` what Fortryd takes it back to: Gentag has nothing left to do. At most
 * `limit` steps are kept (Fortryd and Gentag together, as an edit starts Gentag over).
 */
export function recorded<T>(history: History<T>, before: T, limit = HISTORY_LIMIT): History<T> {
	const kept = history.undo.length < limit ? history.undo : history.undo.slice(history.undo.length - limit + 1);
	return { undo: [...kept, before], redo: [] };
}

/**
 * Fortryd, from the state `now` gives: the state to go back to, and the history after it, which
 * keeps `now` for Gentag. Null, with `now` not asked for, when there is nothing to take back.
 */
export function undone<T>(history: History<T>, now: () => T): { to: T; history: History<T> } | null {
	if (!history.undo.length) return null;
	const to = history.undo[history.undo.length - 1]!;
	return { to, history: { undo: history.undo.slice(0, -1), redo: [...history.redo, now()] } };
}

/** Gentag, from the state `now` gives: as `undone`, the other way. */
export function redone<T>(history: History<T>, now: () => T): { to: T; history: History<T> } | null {
	if (!history.redo.length) return null;
	const to = history.redo[history.redo.length - 1]!;
	return { to, history: { undo: [...history.undo, now()], redo: history.redo.slice(0, -1) } };
}
