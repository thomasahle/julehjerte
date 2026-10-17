import { afterEach, describe, expect, it } from 'vitest';
import { focusSectionHeading } from './deleteFocus';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('focusSectionHeading', () => {
	it('focuses the section heading, making it focusable first', () => {
		document.body.innerHTML =
			'<section id="mine"><h3>Mine hjerter</h3><button>Slet Mit hjerte 2</button></section>';
		const heading = focusSectionHeading(document.getElementById('mine'));
		expect(heading?.textContent).toBe('Mine hjerter');
		expect(document.activeElement).toBe(heading);
		expect(heading?.getAttribute('tabindex')).toBe('-1');
	});

	it('does nothing without a section or a heading', () => {
		expect(focusSectionHeading(null)).toBeNull();
		document.body.innerHTML = '<section id="mine"></section>';
		expect(focusSectionHeading(document.getElementById('mine'))).toBeNull();
		expect(document.activeElement).toBe(document.body);
	});
});
