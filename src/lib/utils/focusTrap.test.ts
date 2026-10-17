import { describe, expect, it } from 'vitest';
import { openerOf } from './focusTrap';

describe('openerOf', () => {
	it('takes the clicked control, not the focused element (Safari leaves taps unfocused)', () => {
		const main = document.createElement('main');
		main.tabIndex = -1;
		const button = document.createElement('button');
		main.appendChild(button);
		document.body.appendChild(main);
		main.focus();
		let opener: HTMLElement | null = null;
		button.addEventListener('click', (event) => (opener = openerOf(event)));
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.activeElement).toBe(main);
		expect(opener).toBe(button);
		main.remove();
	});

	it('falls back to the focused element without an event', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();
		expect(openerOf()).toBe(input);
		input.remove();
	});
});
