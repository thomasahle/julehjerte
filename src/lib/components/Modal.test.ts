/**
 * The modal's keyboard behaviour in a DOM. Most of it lives on the dialog's own
 * keydown handler; these tests are about the keys that reach the window from
 * outside the dialog, which is where they go when focus falls to <body> (a
 * button that disables itself while it works drops it there in Chromium).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte';
import Modal from './Modal.svelte';

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
});

const body = createRawSnippet(() => ({
	render: () =>
		'<div><h2 id="t">Title</h2><button class="first">One</button><button class="last">Two</button></div>'
}));

async function render(open = true) {
	const onClose = vi.fn();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Modal, {
		target,
		props: { open, labelledBy: 't', onClose, children: body }
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	await tick();
	return { target, onClose, dialog: () => target.querySelector<HTMLElement>('[role="dialog"]') };
}

function press(el: EventTarget, key: string, shiftKey = false) {
	const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
	el.dispatchEvent(event);
	return event;
}

describe('Modal', () => {
	it('closes on Escape pressed inside the dialog', async () => {
		const { onClose, target } = await render();
		press(target.querySelector('.first')!, 'Escape');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on Escape when focus has fallen to <body>', async () => {
		const { onClose } = await render();
		(document.activeElement as HTMLElement | null)?.blur();
		expect(document.activeElement).toBe(document.body);
		press(document.body, 'Escape');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on Escape dispatched on the document', async () => {
		const { onClose } = await render();
		press(document, 'Escape');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('does not listen while closed', async () => {
		const { onClose } = await render(false);
		press(document.body, 'Escape');
		expect(onClose).not.toHaveBeenCalled();
	});

	it('brings a Tab from <body> back into the dialog', async () => {
		const { target } = await render();
		// jsdom lays nothing out, so every element has a null offsetParent; the
		// trap's visibility filter would otherwise see no buttons at all.
		for (const el of target.querySelectorAll<HTMLElement>('button')) {
			Object.defineProperty(el, 'offsetParent', { get: () => document.body });
		}
		(document.activeElement as HTMLElement | null)?.blur();
		const forward = press(document.body, 'Tab');
		expect(forward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(target.querySelector('.first'));
		(document.activeElement as HTMLElement).blur();
		press(document.body, 'Tab', true);
		expect(document.activeElement).toBe(target.querySelector('.last'));
	});
});
