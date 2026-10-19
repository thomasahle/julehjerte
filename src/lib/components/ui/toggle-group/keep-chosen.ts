/**
 * Handlers for a segment of a single-choice ToggleGroup that should keep its answer.
 *
 * bits-ui's single-choice group clears itself when its chosen segment is clicked
 * again, and the group then shows no answer although nothing has changed. Spread on
 * an item, `chosen` true for the item that is chosen, these stop that click (and
 * Enter, and Space) before the group sees it: bits-ui runs an item's own handlers
 * first and skips its toggle when they have called preventDefault.
 */
export function keepChosen(chosen: boolean) {
	return {
		onclick: (e: MouseEvent) => {
			if (chosen) e.preventDefault();
		},
		onkeydown: (e: KeyboardEvent) => {
			if (chosen && (e.key === "Enter" || e.key === " ")) e.preventDefault();
		}
	};
}
