/**
 * Whether the editor's right-hand panel is collapsed, remembered per browser
 * (docs/redesign/DESIGN.md §7).
 *
 * The rules, which is why this is a module and not three lines inside the canvas
 * component:
 *
 *   * the panel starts **open**, and stays open when nothing has been stored;
 *   * the stored choice is read **after mount**, never during render — reading
 *     it while rendering would make the server's markup and the browser's first
 *     markup disagree;
 *   * storage failures are tolerated. `localStorage` throws outright in a
 *     browser configured to block site data, so even *reaching* it is guarded;
 *     the panel then simply does not remember the choice.
 *
 * Both functions take the Storage to use, so a test can hand them a stub.
 */

/** localStorage key. Written as '1' (collapsed) or '0' (open). */
export const PANEL_COLLAPSED_KEY = 'paperheart.panelCollapsed';

/** The browser's own localStorage, or null where there is none or it throws. */
function defaultStorage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** The remembered choice; false (open) when nothing is stored or storage fails. */
export function readPanelCollapsed(storage: Storage | null = defaultStorage()): boolean {
	try {
		return storage?.getItem(PANEL_COLLAPSED_KEY) === '1';
	} catch {
		return false;
	}
}

/** Remember the choice. A storage failure is ignored: it only costs persistence. */
export function writePanelCollapsed(
	next: boolean,
	storage: Storage | null = defaultStorage()
): void {
	try {
		storage?.setItem(PANEL_COLLAPSED_KEY, next ? '1' : '0');
	} catch {
		// Storage unavailable: the choice just does not survive a reload.
	}
}
