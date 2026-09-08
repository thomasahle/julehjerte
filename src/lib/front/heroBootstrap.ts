/**
 * The hero's hearts, chosen and hung while the page is still parsing —
 * docs/redesign/DESIGN.md §3 "Hero".
 *
 * The hero shows five (three, stacked) hearts drawn at random from the gallery.
 * That used to happen after hydration, which meant the visitor waited for the
 * app and for 295 KB of geometry before the top of the page had anything in it.
 * Nothing about it needs either: the gallery below already contains every
 * heart's finished SVG, so the pick is a shuffle and the drawing is a
 * `cloneNode`.
 *
 * So it is done by this script, emitted into the HTML right after the gallery
 * (front/HeroBootstrap.svelte) — the first point at which the cards it copies
 * from have been parsed. It runs during parsing, before any module script and
 * before DOMContentLoaded, and the slots stay invisible until it has finished,
 * so no frame ever shows the fixed set the page is prerendered with. That fixed
 * set is what a visitor without JavaScript sees instead (`html.no-js`).
 *
 * It is plain source text rather than a module because it must run inline, off
 * the critical path of the bundle. The DOM is the contract: `data-heart-id` /
 * `data-heart-name` on a gallery card, `data-hero-layer` on a hero layer, and
 * `.slot`, `.ribbon`, `.heart` inside them. heroBootstrap.test.ts runs the very
 * string this returns against that DOM.
 *
 * What it chose goes back on `<html data-hero-hearts>` (HERO_PICKS_ATTRIBUTE),
 * because the page has to agree with it: each slot is a link to its heart's
 * card, and hydration would otherwise write the prerendered heart's href and
 * label back over the ones set here. The front page's load reads the attribute
 * and renders the hearts the script actually hung.
 */

/** Where the script leaves its draw, on the root element. */
export const HERO_PICKS_ATTRIBUTE = 'data-hero-hearts';

/**
 * The whole inline `<script>` element, ready to be written into the HTML.
 *
 * `goToHeartLabel` is `t('heroGoToHeart', lang)` with its `{name}` placeholder
 * still in it — the script fills in whichever heart it hangs in the slot.
 */
export function heroBootstrapScript(goToHeartLabel: string): string {
	return `<script>${heroBootstrapSource(goToHeartLabel)}</script>`;
}

/** The source alone, so the test can run it without an HTML parser. */
export function heroBootstrapSource(goToHeartLabel: string): string {
	return `(function(label){${SOURCE}})(${JSON.stringify(goToHeartLabel)})`;
}

const SOURCE = `
try {
	var cards = document.querySelectorAll('#skabeloner [data-heart-id]:not([data-user])');
	var layers = document.querySelectorAll('[data-hero-layer]');
	if (!cards.length || !layers.length) return reveal();

	var need = 0;
	for (var l = 0; l < layers.length; l++) {
		need = Math.max(need, layers[l].querySelectorAll('.slot').length);
	}

	// Partial Fisher-Yates over the gallery's own cards: distinct hearts, and no
	// heart the visitor drew — those are not in the HTML yet, which is the same
	// pool rule $lib/utils/randomHearts states for the prerendered set.
	var pool = Array.prototype.slice.call(cards);
	var picked = [];
	for (var i = 0; i < need && i < pool.length; i++) {
		var j = i + Math.floor(Math.random() * (pool.length - i));
		var swap = pool[i];
		pool[i] = pool[j];
		pool[j] = swap;
		picked.push(pool[i]);
	}

	// The stacked hero shows the first few of the same draw, so resizing the
	// window does not change which hearts are hanging.
	for (var k = 0; k < layers.length; k++) {
		var slots = layers[k].querySelectorAll('.slot');
		var prefix = layers[k].getAttribute('data-hero-layer');
		for (var s = 0; s < slots.length && s < picked.length; s++) {
			hang(slots[s], picked[s], prefix + '-' + s);
		}
	}

	// Tell the page which hearts these are, so hydration renders the same links.
	var chosen = [];
	for (var p = 0; p < picked.length; p++) chosen.push(picked[p].getAttribute('data-heart-id'));
	document.documentElement.setAttribute('data-hero-hearts', chosen.join(' '));
} catch (err) {
	// A hero with the prerendered hearts in it beats an empty one.
}
reveal();

function reveal() {
	document.documentElement.classList.add('hero-ready');
}

function hang(slot, card, prefix) {
	var svg = card.querySelector('svg');
	var box = slot.querySelector('.heart');
	if (!svg || !box) return;

	var clone = svg.cloneNode(true);
	// PaperHeartSVG's clip-path ids are document-global, so the copy needs its
	// own or every heart after the first would be clipped by this one's.
	var owners = clone.querySelectorAll('[id]');
	for (var i = 0; i < owners.length; i++) {
		var from = owners[i].getAttribute('id');
		var to = prefix + '-' + from;
		owners[i].setAttribute('id', to);
		var users = clone.querySelectorAll('[clip-path="url(#' + from + ')"]');
		for (var u = 0; u < users.length; u++) users[u].setAttribute('clip-path', 'url(#' + to + ')');
	}

	// Replace, so the comments Svelte hydrates this block by stay put.
	var current = box.querySelector('svg');
	if (current) box.replaceChild(clone, current);
	else box.appendChild(clone);

	// The ribbon is cut from the same paper as the heart, and the card's ribbon
	// already follows that rule (its own right-hand colour, or the site's).
	var ribbon = slot.querySelector('.ribbon');
	var cardRibbon = card.querySelector('.ribbon');
	if (ribbon && cardRibbon) ribbon.style.background = cardRibbon.style.background;

	var link = slot.querySelector('a');
	if (link) {
		link.setAttribute('href', '#' + card.getAttribute('id'));
		link.setAttribute('aria-label', label.replace('{name}', card.getAttribute('data-heart-name') || ''));
	}
}
`;
