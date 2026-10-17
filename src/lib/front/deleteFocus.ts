/**
 * Where keyboard focus goes once a visitor's heart has been deleted. The card
 * and its delete button are gone, so focus would fall to <body> and a keyboard
 * or screen-reader user would be thrown back to the top of the page. It goes to
 * the heading of the section the card was in ("Mine hjerter") instead: the
 * nearest thing that still exists and says where they are.
 */
export function focusSectionHeading(section: HTMLElement | null): HTMLElement | null {
	const heading = section?.querySelector<HTMLElement>('h2, h3') ?? null;
	if (!heading) return null;
	if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
	heading.focus({ preventScroll: true });
	const top = heading.getBoundingClientRect().top;
	if (top < 0 || top > window.innerHeight) section?.scrollIntoView({ block: 'start' });
	return heading;
}
