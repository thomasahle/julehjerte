/**
 * Which client-side navigations send their own GA4 page_view: only a change of
 * pathname. The stream's history-based page views are off, so this decision is
 * all there is between a ?selected= tick and an inflated page-view count.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

const { isPageViewNavigation, trackPageView } = await import('./analytics');

const nav = (from: string | null, to: string) => ({
	from: from === null ? null : { url: new URL(from, 'https://juleflet.dk') },
	to: { url: new URL(to, 'https://juleflet.dk') }
});

describe('isPageViewNavigation', () => {
	it('leaves the initial load to the config call', () => {
		expect(isPageViewNavigation(nav(null, '/'))).toBe(false);
	});

	it('ignores a ?selected= rewrite on the same path', () => {
		expect(isPageViewNavigation(nav('/', '/?selected=jul'))).toBe(false);
		expect(isPageViewNavigation(nav('/?selected=jul', '/?selected=jul,stjerne'))).toBe(false);
	});

	it('ignores a hash jump', () => {
		expect(isPageViewNavigation(nav('/', '/#skabeloner'))).toBe(false);
		expect(isPageViewNavigation(nav('/#skabeloner', '/#heart-jul'))).toBe(false);
	});

	it('counts a change of path', () => {
		expect(isPageViewNavigation(nav('/', '/hjerte/jul/'))).toBe(true);
		expect(isPageViewNavigation(nav('/?selected=jul#skabeloner', '/om/'))).toBe(true);
		expect(isPageViewNavigation(nav('/', '/en/'))).toBe(true);
	});

	it('counts a step back through history to another path', () => {
		// popstate: from and to as SvelteKit reports them, the target being an
		// earlier entry; the decision does not depend on the navigation type.
		const popstate = { ...nav('/hjerte/jul/', '/?selected=jul'), type: 'popstate', delta: -1 };
		expect(isPageViewNavigation(popstate)).toBe(true);
		const backToSamePath = { ...nav('/?selected=jul,stjerne', '/?selected=jul'), type: 'popstate', delta: -1 };
		expect(isPageViewNavigation(backToSamePath)).toBe(false);
	});

	it('does nothing without a destination', () => {
		expect(isPageViewNavigation({ from: { url: new URL('https://juleflet.dk/') }, to: null })).toBe(false);
	});
});

describe('trackPageView', () => {
	afterEach(() => {
		delete (window as { gtag?: unknown }).gtag;
	});

	it('sends page_view with location, path, title and the in-site referrer', () => {
		const gtag = vi.fn();
		window.gtag = gtag;
		trackPageView(new URL('https://juleflet.dk/hjerte/jul/?ref=x#top'), 'Jul', new URL('https://juleflet.dk/?selected=jul'));
		expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
			page_location: 'https://juleflet.dk/hjerte/jul/?ref=x',
			page_path: '/hjerte/jul/',
			page_title: 'Jul',
			page_referrer: 'https://juleflet.dk/?selected=jul'
		});
	});
});
