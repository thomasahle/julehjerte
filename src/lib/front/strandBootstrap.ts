/**
 * The gallery's hill-line layout, worked out while the page is still parsing —
 * docs/redesign/GALLERY-CURVE.md, amendment 4.
 *
 * On the desktop layout (≥ 900px) the gallery is pulled up into the hero's
 * snow and every grid column hangs from the hill line as a strand (amendment
 * 3). Gallery.svelte measures all of that after hydration, which on a reload
 * showed as a jump: the prerendered page painted the gallery flat at a
 * stylesheet estimate and then moved it into place. Nothing in that layout
 * needs the app, though. It is a function of the viewport's width and of the
 * hero's height, both known before the gallery has been parsed.
 *
 * So this script, emitted into the HTML right before the gallery
 * (Gallery.svelte), works it out first and leaves it on `<html>` as the very
 * custom properties the gallery sets itself once it has measured, which the
 * prerendered CSS falls back to:
 *
 *   --gallery-pull         the gallery wrap's margin-top (hillTop − the foot of the scene)
 *   --strand-0 … --strand-n  each grid column's drop at rest, drop_k
 *   --strand-room          D, the largest drop
 *   --gallery-bar-height   the bar's one-row height, for the first section's margin
 *
 * and the classes `strands-ready strands-<n>`, n the column count, which make
 * the cards read their column's strand before Svelte has given each card its
 * own (CategorySection.svelte). The hydrated measure then writes its exact
 * values over these; where they agree to a pixel nothing moves, and it removes
 * these (Gallery.svelte, `clearStrandBootstrap`).
 *
 * The chips cannot be placed this early, since they depend on laid-out text,
 * and they stay invisible until the bar has put them on the curve
 * (GalleryBar.svelte). Their row's span still decides which columns are under
 * it (+54px), so it is estimated here from the chip labels: the site's font is
 * a system stack, so a canvas measures them as the page will lay them out.
 *
 * It reads the foot of the hero from the DOM rather than spelling out the
 * header's and the hero's heights a second time: the scene has been parsed by
 * now and its height does not depend on anything that is still to come. The
 * rest follows from the width, `documentElement.clientWidth` less a classic
 * scrollbar the page does not have yet but will once the gallery is in.
 *
 * The difficulty filter (`?level=`, or the tab's sessionStorage; see
 * $lib/front/levelFilter) is applied here too, at every width: a `<style
 * data-level-bootstrap>` hides the cards of other levels and the categories
 * it empties, gives the first category on show the first one's margin, and
 * on the desktop layout hangs the cards on show from their columns as laid
 * out, skipping the hidden ones. The chips' span is then estimated with the
 * counts the filter leaves. The gallery removes the style once the page has
 * applied the same filter (`clearLevelBootstrap`).
 *
 * Plain source text, like $lib/front/heroBootstrap, because it must run inline
 * and before the gallery paints. strandBootstrap.test.ts runs this very string
 * and checks it against $lib/front/hillLine, which the hydrated measure uses.
 * Below 900px it does nothing at all.
 */
import { HILL_SEGMENTS, CARD_GAP, UNDER_CHIPS } from '$lib/front/hillLine';
import { LANDSCAPE_HEIGHT, LANDSCAPE_MAX_WIDTH, LANDSCAPE_WIDTH } from '$lib/landscape';

/** The layout the script needs to know, spelled the way the stylesheets spell it. */
export const STRAND_LAYOUT = {
	/** `.gallery` max-width and side padding (Gallery.svelte). */
	columnMax: 1280,
	columnPadding: 40,
	/** `.cat-grid`: `repeat(auto-fill, minmax(204px, 1fr))`, 16px column gap. */
	trackMin: 204,
	trackGap: 16,
	/** The chips' row (GalleryBar.svelte): 8px apart, 12px padding, 1px border, 6px label gap. */
	chipGap: 8,
	/** The toggles' group's extra margin before the category chips (their dots are not shown on the hill). */
	groupGap: 8,
	/** The one-row bar: 10px padding twice around a 13px × 1.2 chip with 6px padding and a border. */
	barHeight: 49.6,
	/** `font-family` of the page (`--font-sans` in app.css). */
	font: '"Helvetica Neue", Helvetica, Arial, sans-serif'
} as const;

/** What the script needs to know about the chips: label and count, in row order. */
export interface StrandChips {
	/**
	 * The gallery categories with hearts, in chip order, with their section
	 * id, and each heart's id and difficulty in gallery order (for the
	 * filter).
	 */
	categories: { id?: string; title: string; count: number; levels?: string[]; hearts?: string[] }[];
	/**
	 * The difficulty filter's toggles, first in the row after the download
	 * button: each level's word in `?level=`, its label, and where the tab
	 * keeps the choice. Absent: no filter.
	 */
	filter?: {
		levels: { level: string; slug: string; label: string }[];
		param: string;
		storageKey: string;
	};
	/** "Mine hjerter", shown once the visitor has drawn hearts (localStorage). */
	mine: string;
	/** "Hent skabeloner", the button shown first while hearts are ticked (`?selected=`). */
	download: string;
	/** The localStorage key the visitor's own hearts are kept under. */
	storageKey: string;
}

/** The whole inline `<script>` element, ready to be written into the HTML. */
export function strandBootstrapScript(chips: StrandChips): string {
	return `<script>${strandBootstrapSource(chips)}</script>`;
}

/** The source alone, so the test can run it without an HTML parser. */
export function strandBootstrapSource(chips: StrandChips): string {
	const config = {
		...STRAND_LAYOUT,
		segments: HILL_SEGMENTS,
		landWidth: LANDSCAPE_WIDTH,
		landHeight: LANDSCAPE_HEIGHT,
		landMax: LANDSCAPE_MAX_WIDTH,
		cardGap: CARD_GAP,
		underChips: UNDER_CHIPS,
		chips
	};
	// The labels are data: a `<` in them is escaped so none can close the
	// script early (the source itself never has a `</`).
	const data = JSON.stringify(config).replace(/</g, '\\u003c');
	return `(function(C){${SOURCE}})(${data})`;
}

const SOURCE = `
try {
	var root = document.documentElement;
	var shown = filterLevels();
	var counts = [];
	for (var c = 0; c < C.chips.categories.length; c++) {
		var cat = C.chips.categories[c];
		counts.push(shown ? countShown(cat.levels || [], shown) : cat.count);
	}
	var css = shown ? filterRules(shown, counts) : '';
	var desktop = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
	if (!desktop) {
		writeStyle(css);
		return;
	}
	var land = document.querySelector('[data-scene-land]');
	var scene = land && land.parentElement;
	if (!scene) {
		writeStyle(css);
		return;
	}

	// The width the page will have once it scrolls: the gallery below makes
	// it taller than any window, so a classic scrollbar will take its room.
	var width = root.clientWidth;
	if (window.innerWidth - width < 1 && document.body) {
		var probe = document.createElement('div');
		probe.style.cssText = 'position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden';
		document.body.appendChild(probe);
		width -= probe.offsetWidth - probe.clientWidth;
		document.body.removeChild(probe);
	}

	// The landscape (Scene.svelte): min(width, 2000) wide at the drawing's
	// aspect, its wrapper's bottom 1px below the scene's.
	var sceneBottom = scene.getBoundingClientRect().bottom + window.scrollY;
	var landW = Math.min(width, C.landMax);
	var scale = landW / C.landWidth;
	var landTop = sceneBottom + 1 - C.landHeight * scale;

	// The content column (.gallery) and its grid's tracks.
	var columnW = Math.min(width, C.columnMax);
	var left = (width - columnW) / 2 + C.columnPadding;
	var right = left + columnW - 2 * C.columnPadding;
	var inner = right - left;
	var n = Math.max(1, Math.floor((inner + C.trackGap) / (C.trackMin + C.trackGap)));
	var track = (inner - C.trackGap * (n - 1)) / n;

	var units = function (x) { return x / scale; };
	var page = function (y) { return landTop + y * scale; };
	var hillTop = page(hillTopBetween(units(left), units(right)));
	var pull = round(hillTop - sceneBottom);

	var span = chipSpan(left, right, counts);
	var drops = [];
	var D = 0;
	for (var k = 0; k < n; k++) {
		var x = left + k * (track + C.trackGap) + track / 2;
		var under = x >= span[0] && x <= span[1];
		var drop = round(page(hillY(units(x))) - hillTop + (under ? C.underChips : 0));
		drops.push(drop);
		D = Math.max(D, drop);
	}

	var style = root.style;
	style.setProperty('--gallery-pull', pull + 'px');
	style.setProperty('--gallery-bar-height', C.barHeight + 'px');
	style.setProperty('--strand-room', D + 'px');
	for (var d = 0; d < drops.length; d++) style.setProperty('--strand-' + d, drops[d] + 'px');
	root.classList.add('strands-ready', 'strands-' + n);
	if (shown) css += strandRules(shown, n);
	writeStyle(css);
} catch (err) {
	// The stylesheet's estimate, as before, beats a broken page.
}

function round(px) {
	return Math.round(px * 10) / 10;
}

// The chips' row, right-aligned against the column's right edge (GalleryBar):
// the download button while hearts are ticked, one chip per category with
// hearts, "Mine hjerter" once the visitor has drawn any.
function chipSpan(left, right, counts) {
	var ch = C.chips;
	var measure = textMeasurer();
	var chip = function (title, count) {
		// 12px padding and a 1px border either side, 6px between the label and
		// its count; the gallery reads offsetWidth, which rounds.
		return Math.round(26 + measure(title, 600) + 6 + measure(String(count), 500));
	};
	var widths = [];
	var ticked = selectedCount();
	if (ticked > 0) {
		// 12px + 8px padding, a 16px icon, 6px gaps, the count's 8px padding.
		widths.push(Math.round(20 + 16 + 12 + measure(ch.download, 600) + 16 + measure(String(ticked), 600)));
	}
	var filter = ch.filter;
	if (filter) {
		// The word alone, inside a chip's padding and border: the dots are not shown on the hill.
		for (var l = 0; l < filter.levels.length; l++) {
			widths.push(Math.round(26 + measure(filter.levels[l].label, 600)));
		}
	}
	for (var i = 0; i < ch.categories.length; i++) {
		widths.push(chip(ch.categories[i].title, counts[i]));
	}
	var mine = myHeartCount();
	if (mine > 0) widths.push(chip(ch.mine, mine));
	var total = C.chipGap * (widths.length - 1) + (filter && filter.levels.length ? C.groupGap : 0);
	for (var w = 0; w < widths.length; w++) total += widths[w];
	var start = Math.max(left, right - total);
	return [start, start + total];
}

// The difficulty filter: the levels '?level=' names, or else the ones the
// tab last chose, as an object of level: true; null for none (all shown).
function filterLevels() {
	var filter = C.chips.filter;
	if (!filter) return null;
	var raw = null;
	var match = new RegExp('[?&]' + filter.param + '=([^&#]*)').exec(location.search);
	if (match && match[1]) {
		try {
			raw = decodeURIComponent(match[1]);
		} catch (err) {
			raw = match[1];
		}
	} else {
		try {
			raw = sessionStorage.getItem(filter.storageKey);
		} catch (err) {
			raw = null;
		}
	}
	if (!raw) return null;
	var words = raw.toLowerCase().split(',');
	var shown = null;
	for (var i = 0; i < words.length; i++) {
		for (var j = 0; j < filter.levels.length; j++) {
			if (filter.levels[j].slug === words[i].trim()) {
				shown = shown || {};
				shown[filter.levels[j].level] = true;
			}
		}
	}
	// No filter that hides what the page was entered at (#moenstre from a
	// breadcrumb, #heart-<id>): the page drops it then too.
	return shown && hidesAnchor(shown) ? null : shown;
}

function hidesAnchor(shown) {
	var anchor = location.hash.slice(1);
	try {
		anchor = decodeURIComponent(anchor);
	} catch (err) {
		// As it is.
	}
	if (!anchor) return false;
	var cats = C.chips.categories;
	for (var c = 0; c < cats.length; c++) {
		var levels = cats[c].levels || [];
		if (cats[c].id === anchor) return countShown(levels, shown) === 0;
		var hearts = cats[c].hearts || [];
		for (var h = 0; h < hearts.length; h++) {
			if ('heart-' + hearts[h].replace(/[^a-zA-Z0-9_-]/g, '-') === anchor) return !shown[levels[h]];
		}
	}
	return false;
}

function countShown(levels, shown) {
	var count = 0;
	for (var i = 0; i < levels.length; i++) if (shown[levels[i]]) count++;
	return count;
}

// What CategorySection and HeartCard will do once the page has the filter:
// hide the other levels' cards and the categories left empty, and move the
// first category's margin to the first one on show.
function filterRules(shown, counts) {
	var css = '';
	var levels = C.chips.filter.levels;
	for (var l = 0; l < levels.length; l++) {
		if (!shown[levels[l].level]) {
			css += '#skabeloner .cat:not(.apart) .cat-grid > [data-level="' + levels[l].level + '"]{display:none}';
		}
	}
	var first = -1;
	for (var c = 0; c < counts.length; c++) {
		var id = C.chips.categories[c].id;
		if (!id) continue;
		if (counts[c] === 0) css += '#skabeloner > #' + id + '{display:none}';
		else if (first < 0) first = c;
	}
	if (first > 0) {
		var sel = '#skabeloner > #' + C.chips.categories[first].id;
		css += sel + '{margin-top:8px}';
		css += '@media (min-width: 900px){' + sel +
			'{margin-top:calc(6px - var(--gallery-bar-height, 49px) - var(--bar-room, 0px))}}';
	}
	return css;
}

// The strands for the cards on show: CategorySection's nth-child rules count
// the hidden cards too, so these count only those of the levels shown.
function strandRules(shown, n) {
	var of = [];
	var levels = C.chips.filter.levels;
	for (var l = 0; l < levels.length; l++) {
		if (shown[levels[l].level]) of.push('[data-level="' + levels[l].level + '"]');
	}
	var css = '';
	for (var k = 0; k < n; k++) {
		css += 'html.strands-' + n + ' #skabeloner .cat:not(.apart) .cat-grid > :nth-child(' + n + 'n + ' + (k + 1) +
			' of ' + of.join(',') + '){--strand:var(--strand-' + k + ')}';
	}
	return css;
}

function writeStyle(css) {
	if (!css) return;
	var style = document.createElement('style');
	style.setAttribute('data-level-bootstrap', '');
	style.textContent = css;
	(document.head || root).appendChild(style);
}

function textMeasurer() {
	var ctx = null;
	try {
		ctx = document.createElement('canvas').getContext('2d');
	} catch (err) {
		ctx = null;
	}
	return function (text, weight) {
		if (!ctx) return text.length * 7.4;
		ctx.font = weight + ' 13px ' + C.font;
		return ctx.measureText(text).width;
	};
}

function selectedCount() {
	var match = /[?&]selected=([^&#]*)/.exec(location.search);
	if (!match) return 0;
	var ids = decodeURIComponent(match[1]).split(',');
	var seen = {};
	var count = 0;
	for (var i = 0; i < ids.length; i++) {
		if (ids[i] && !seen[ids[i]]) {
			seen[ids[i]] = true;
			count++;
		}
	}
	return count;
}

function myHeartCount() {
	try {
		var raw = JSON.parse(localStorage.getItem(C.chips.storageKey) || '[]');
		return Array.isArray(raw) ? raw.length : 0;
	} catch (err) {
		return 0;
	}
}

// $lib/front/hillLine, in drawing units: the hill line's y at x (past the
// drawing's right edge, its mirror image), and its highest point in a range.
function fold(x) {
	var W = C.landWidth;
	var m = x > W ? 2 * W - x : x;
	return Math.min(Math.max(m, 0), W);
}

function cubic(a, b, c, d, t) {
	var u = 1 - t;
	return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function hillY(x) {
	x = fold(x);
	var segs = C.segments;
	var s = segs[segs.length - 1];
	for (var i = 0; i < segs.length; i++) {
		if (x <= segs[i][3][0]) {
			s = segs[i];
			break;
		}
	}
	var lo = 0;
	var hi = 1;
	for (var j = 0; j < 40; j++) {
		var mid = (lo + hi) / 2;
		if (cubic(s[0][0], s[1][0], s[2][0], s[3][0], mid) < x) lo = mid;
		else hi = mid;
	}
	var t = (lo + hi) / 2;
	return cubic(s[0][1], s[1][1], s[2][1], s[3][1], t);
}

function hillTopBetween(x0, x1) {
	var W = C.landWidth;
	var lo = Math.min(x0, x1);
	var hi = Math.max(x0, x1);
	if (hi > W) {
		var mirrored = hillTopWithin(fold(hi), fold(Math.max(lo, W)));
		return lo >= W ? mirrored : Math.min(mirrored, hillTopWithin(lo, W));
	}
	return hillTopWithin(lo, hi);
}

function hillTopWithin(x0, x1) {
	var W = C.landWidth;
	var from = Math.min(Math.max(Math.min(x0, x1), 0), W);
	var to = Math.min(Math.max(Math.max(x0, x1), 0), W);
	var top = Math.min(hillY(from), hillY(to));
	var segs = C.segments;
	for (var i = 0; i < segs.length; i++) {
		var p = segs[i];
		if (p[3][0] < from || p[0][0] > to) continue;
		var y0 = p[0][1], y1 = p[1][1], y2 = p[2][1], y3 = p[3][1];
		var a = -y0 + 3 * y1 - 3 * y2 + y3;
		var b = 2 * (y0 - 2 * y1 + y2);
		var c = y1 - y0;
		var roots = [];
		if (Math.abs(a) < 1e-12) {
			if (Math.abs(b) >= 1e-12) roots.push(-c / b);
		} else {
			var disc = b * b - 4 * a * c;
			if (disc >= 0) {
				var sq = Math.sqrt(disc);
				roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
			}
		}
		for (var r = 0; r < roots.length; r++) {
			var t = roots[r];
			if (!(t > 0 && t < 1)) continue;
			var x = cubic(p[0][0], p[1][0], p[2][0], p[3][0], t);
			if (x >= from && x <= to) top = Math.min(top, cubic(y0, y1, y2, y3, t));
		}
	}
	return top;
}
`;

/** Undo the script's difficulty filter: the page has applied it itself. */
export function clearLevelBootstrap(doc: Document = document): void {
	for (const style of doc.querySelectorAll('style[data-level-bootstrap]')) style.remove();
}

/** Everything the script leaves on `<html>`, for the gallery to clear once it has measured. */
const STRAND_BOOTSTRAP_PROPERTIES = ['--gallery-pull', '--gallery-bar-height', '--strand-room'];

/** Undo the script: the gallery has measured and set its own values. */
export function clearStrandBootstrap(root: HTMLElement = document.documentElement): void {
	if (!root.classList.contains('strands-ready')) return;
	for (const name of STRAND_BOOTSTRAP_PROPERTIES) root.style.removeProperty(name);
	// The column count never reaches this: 1280px fits five.
	for (let k = 0; k < 12; k++) root.style.removeProperty(`--strand-${k}`);
	for (const name of Array.from(root.classList)) {
		if (name.startsWith('strands-')) root.classList.remove(name);
	}
	if (root.getAttribute('style') === '') root.removeAttribute('style');
}
