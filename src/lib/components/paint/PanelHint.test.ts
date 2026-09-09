/**
 * The panel explanations, reachable without a mouse — PAINT.md §2.
 *
 * They were the heading's `title` for a round, which fires on neither touch nor
 * keyboard focus: the sentence was there for anyone pointing at it and gone for
 * everybody else. So what has to be true is that this is a real control — a
 * button, with `aria-expanded`, that a click and a key both work — and that the
 * sentence is out of the way until it is asked for, because the column's height
 * depends on it.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PanelHint from './PanelHint.svelte';
import SymmetryPanel from './SymmetryPanel.svelte';
import FramePanel from './FramePanel.svelte';
import { DEFAULT_FRAME } from '$lib/paint/frame';
import { NO_SYMMETRY } from '$lib/paint/symmetry';

/** What every one of these tests reads, whichever component drew it. */
function probe(target: HTMLElement, instance: object) {
	return {
		target,
		button: target.querySelector<HTMLButtonElement>('button[aria-expanded]'),
		hint: () => target.querySelector<HTMLParagraphElement>('p[id]')!,
		cleanup: () => {
			unmount(instance);
			target.remove();
		}
	};
}

function box(): HTMLElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

function render(props: Parameters<typeof PanelHint>[1]) {
	const target = box();
	const instance = mount(PanelHint, { target, props });
	flushSync();
	return probe(target, instance);
}

function renderSymmetry(props: Parameters<typeof SymmetryPanel>[1]) {
	const target = box();
	const instance = mount(SymmetryPanel, { target, props });
	flushSync();
	return probe(target, instance);
}

function renderFrame(props: Parameters<typeof FramePanel>[1]) {
	const target = box();
	const instance = mount(FramePanel, { target, props });
	flushSync();
	return probe(target, instance);
}

const HINT = 'Fundet i masken og slået til.';

describe('PanelHint', () => {
	it('keeps the sentence out of the column until it is asked for', () => {
		const panel = render({ heading: 'Symmetri', hint: HINT, lang: 'da' });
		try {
			expect(panel.button!.getAttribute('aria-expanded')).toBe('false');
			expect(panel.hint().hidden).toBe(true);
			// In the DOM even while hidden, so `aria-controls` names something real.
			expect(panel.button!.getAttribute('aria-controls')).toBe(panel.hint().id);
			expect(panel.hint().textContent).toBe(HINT);
		} finally {
			panel.cleanup();
		}
	});

	it('opens and closes on a press, and says which way it stands', () => {
		const panel = render({ heading: 'Symmetri', hint: HINT, lang: 'da' });
		try {
			panel.button!.click();
			flushSync();
			expect(panel.button!.getAttribute('aria-expanded')).toBe('true');
			expect(panel.hint().hidden).toBe(false);
			panel.button!.click();
			flushSync();
			expect(panel.button!.getAttribute('aria-expanded')).toBe('false');
			expect(panel.hint().hidden).toBe(true);
		} finally {
			panel.cleanup();
		}
	});

	it('names itself after its panel, so two of them can be told apart', () => {
		const da = render({ heading: 'Symmetri', hint: HINT, lang: 'da' });
		const en = render({ heading: 'Border', hint: HINT, lang: 'en' });
		try {
			expect(da.button!.getAttribute('aria-label')).toBe('Forklaring: Symmetri');
			expect(en.button!.getAttribute('aria-label')).toBe('Explanation: Border');
			// And two on one page control two different paragraphs.
			expect(da.hint().id).not.toBe(en.hint().id);
		} finally {
			da.cleanup();
			en.cleanup();
		}
	});
});

describe('the two panels that carry a hint', () => {
	it('gives Symmetri an "i" and no title on its heading', () => {
		const panel = renderSymmetry({
			value: { ...NO_SYMMETRY },
			onChange: () => {},
			found: null,
			lang: 'da'
		});
		try {
			// A `title` is mouse-only; that is the whole reason for the button.
			expect(panel.target.querySelector('h2')?.hasAttribute('title')).toBe(false);
			expect(panel.button!.getAttribute('aria-label')).toBe('Forklaring: Symmetri');
			expect(panel.hint().textContent).toContain('spejles med');
		} finally {
			panel.cleanup();
		}
	});

	it('gives Kanten one under Fast, where its two words explain nothing', () => {
		const panel = renderFrame({
			frame: { ...DEFAULT_FRAME },
			onFrame: () => {},
			onFrameStart: () => {},
			lang: 'da'
		});
		try {
			expect(panel.target.querySelector('h2')?.hasAttribute('title')).toBe(false);
			expect(panel.button!.getAttribute('aria-label')).toBe('Forklaring: Kanten');
			expect(panel.hint().textContent).toContain('Hele firkanten væves');
		} finally {
			panel.cleanup();
		}
	});

	it('drops it under Fri, where the panel already says what happens', () => {
		const panel = renderFrame({
			frame: { ...DEFAULT_FRAME, mode: 'free' },
			onFrame: () => {},
			onFrameStart: () => {},
			lang: 'da'
		});
		try {
			expect(panel.target.querySelector('button[aria-expanded]')).toBeNull();
			expect(panel.target.textContent).toContain('Motivet inden for formen');
		} finally {
			panel.cleanup();
		}
	});
});
