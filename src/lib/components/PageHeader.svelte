<!--
  The site nav — docs/redesign/DESIGN.md §3 "Nav".

  Two variants:
    site   (default) logo · Skabeloner / Design / Sådan gør du / Om · paper colours ·
           EN pill · GitHub pill, collapsing to a 44px burger with a drop-down
           menu under 900px, where the paper colours are a row of their own.
    editor logo at the left and the page's own buttons (passed as
           children) at the right, then the paper colours and the EN pill —
           no nav links, no GitHub, no back link: the logo leads home, and
           the browser's own back button works. The design tools have no
           colour controls of their own, so the bar keeps the paper colours
           (Tegn and Mal only from 900px, where there is room beside the
           Tegn / Mal switch).

  Every page mounts this component, so keep the prop names stable:
    lang      the page language
    active    which nav link is current: 'templates' | 'design' | 'howto' | 'about'
    variant   'site' | 'editor'
    mode      editor variant: which of the editor's two modes this page is, and
              with it the Tegn / Mal switch in the middle of the bar
    children  right-hand slot, rendered in both variants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref, otherLanguageUrl } from '$lib/i18n/routes';
	import { ImageIcon, MenuIcon, CloseIcon, PencilIcon } from '$lib/components/icons';
	import GitHubLink from '$lib/components/GitHubLink.svelte';
	import ColorControls from '$lib/components/ColorControls.svelte';

	type NavSection = 'templates' | 'design' | 'howto' | 'about';

	/** The front page's gallery section (Gallery.svelte), in both languages. */
	const GALLERY_ANCHOR = 'skabeloner';

	/**
	 * Which of the editor's two modes the page is (docs/redesign/PAINT.md §1), and
	 * what a plain click on the other one does instead of following its link, for
	 * a page that carries something over (Tegn takes its heart to Mal). A click
	 * that opens a new tab follows the link as it is.
	 */
	type EditorMode = { current: 'draw' | 'paint'; switchTo?: () => void };

	interface Props {
		lang: Language;
		active?: NavSection;
		variant?: 'site' | 'editor';
		/** Override for tools whose current inputs live in a shallow URL hash. */
		languageUrl?: string;
		/**
		 * Editor variant only: renders the Tegn / Mal switch in the middle of the
		 * bar. Absent on every other page, which has no second mode to switch to.
		 */
		mode?: EditorMode;
		/**
		 * The <header> element, for a page that has to measure it. Bind to it
		 * rather than reaching in with a selector: the markup inside is ours to
		 * change.
		 */
		ref?: HTMLElement | null;
		children?: Snippet;
	}

	let {
		lang,
		active = undefined,
		variant = 'site',
		languageUrl = undefined,
		mode = undefined,
		ref = $bindable(null),
		children
	}: Props = $props();

	let menuOpen = $state(false);
	// Escape closes the menu, which unmounts whatever link had focus — so the
	// burger takes it back instead of letting it fall to <body>.
	let burgerEl = $state<HTMLButtonElement | null>(null);

	let homeHref = $derived(routeHref('home', lang));
	let links = $derived([
		// The gallery, not the top of the hero: on a phone that is a whole hero
		// and the landscape band above the first heart. The front page lands
		// the hash under the gallery bar once the gallery has been measured.
		{ id: 'templates' as NavSection, href: `${homeHref}#${GALLERY_ANCHOR}`, label: t('navTemplates', lang) },
		{ id: 'design' as NavSection, href: routeHref('generator', lang), label: t('navDesign', lang) },
		{ id: 'howto' as NavSection, href: routeHref('howTo', lang), label: t('navHowTo', lang) },
		{ id: 'about' as NavSection, href: routeHref('about', lang), label: t('navAbout', lang) }
	]);

	// The same page in the other language. Query and hash only exist client-side.
	let languageHref = $derived(
		languageUrl ?? otherLanguageUrl(
			$page.url.pathname,
			browser ? $page.url.search : '',
			browser ? $page.url.hash : ''
		)
	);

	// The two modes, in the order the switch shows them.
	let modes = $derived([
		{ id: 'draw' as const, href: routeHref('editor', lang), label: t('paintModeDraw', lang), icon: PencilIcon },
		{ id: 'paint' as const, href: routeHref('paint', lang), label: t('paintModePaint', lang), icon: ImageIcon }
	]);

	// The active section's link is `page` only on the page it points at (the
	// front page for "Skabeloner"); on a page inside the section, such as a
	// heart's, it is `true`: the visitor is in that section, not on that page.
	const trimSlash = (path: string) => path.replace(/\/+$/, '') || '/';
	function ariaCurrent(link: { id: NavSection; href: string }): 'page' | 'true' | undefined {
		if (active !== link.id) return undefined;
		return trimSlash($page.url.pathname) === trimSlash(link.href.split('#')[0]!) ? 'page' : 'true';
	}

	afterNavigate(() => {
		menuOpen = false;
	});


	function switchMode(e: MouseEvent, id: EditorMode['current']): void {
		if (!mode?.switchTo || id === mode.current || e.defaultPrevented || e.button !== 0 ||
			e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		mode.switchTo();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !menuOpen) return;
		menuOpen = false;
		burgerEl?.focus();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The first focusable element on every page: the front page has 15 stops
     (logo, nav, pills, hero buttons, toolbar) before the first heart card. Each
     route marks its own <main id="main-content">. -->
<a class="skip-link" href="#main-content">{t('skipToContent', lang)}</a>

<header bind:this={ref} class="nav" class:editor={variant === 'editor'}>
	{#if variant === 'site'}
		<!-- Without JavaScript the burger is dead, so html.no-js swaps in a
		     label for this checkbox, which opens the same menu by CSS alone
		     (pages-edges QA 7). Both are display: none once the script runs, so
		     nothing of it is focusable or announced then. Visually hidden rather
		     than hidden, so a keyboard can still reach it without JavaScript. -->
		<input
			type="checkbox"
			class="nav-toggle"
			id="nav-menu-toggle"
			aria-controls="nav-menu"
			aria-label={t('navOpenMenu', lang)}
		/>
	{/if}
	<div class="nav-start">
		<a class="nav-logo" href={homeHref}>{t('siteWordmark', lang)}</a>
	</div>

	{#if mode}
		<!-- The middle cell of the editor bar. It is a nav rather than a group of
		     buttons because switching mode is ordinary navigation: each mode is a
		     page with its own URL, and the state that survives the move lives in
		     the editor session, not in either page. -->
		<nav class="mode-switch" aria-label={t('paintModeSwitch', lang)}>
			{#each modes as item (item.id)}
				<a
					class="mode-link"
					class:active={mode.current === item.id}
					href={item.href}
					aria-current={mode.current === item.id ? 'page' : undefined}
					title={item.label}
					onclick={(e) => switchMode(e, item.id)}
				>
					<item.icon size={16} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	{/if}

	{#if variant === 'site'}
		<nav class="nav-links" aria-label={t('siteNavigation', lang)}>
			{#each links as link (link.id)}
				<a
					class="nav-link"
					class:active={active === link.id}
					href={link.href}
					aria-current={ariaCurrent(link)}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="nav-actions">
		{#if children}
			{@render children()}
		{/if}
		<!-- The site's paper colours and the colourful mode (ColorControls), on
		     every page: the design tools (Tegn, Mal, the designer) have no colour
		     controls of their own, so this is where their paper is chosen too. -->
		<ColorControls {lang} variant="bar" />
		<!-- The language toggle belongs on every page type, the editor included:
		     /editor/ and /en/editor/ both exist, and the editor has neither nav
		     links nor a footer to reach the other one from. Below 900px the site
		     variant hides it (see the stylesheet) because the drawer carries it. -->
		<a class="pill" href={languageHref} title={t('switchLanguage', lang)}>
			{lang === 'da' ? 'EN' : 'DA'}
		</a>
		{#if variant === 'site'}
			<GitHubLink class="nav-github" />
			<button
				type="button"
				class="nav-burger"
				bind:this={burgerEl}
				aria-expanded={menuOpen}
				aria-controls="nav-menu"
				aria-label={menuOpen ? t('navCloseMenu', lang) : t('navOpenMenu', lang)}
				onclick={() => (menuOpen = !menuOpen)}
			>
				{#if menuOpen}
					<CloseIcon size={22} />
				{:else}
					<MenuIcon size={22} />
				{/if}
			</button>
			<label class="nav-burger nav-burger-nojs" for="nav-menu-toggle" aria-hidden="true">
				<span class="nojs-open"><MenuIcon size={22} /></span>
				<span class="nojs-close"><CloseIcon size={22} /></span>
			</label>
		{/if}
	</div>

	{#if variant === 'site'}
		<!-- A class rather than the `hidden` attribute: Tailwind's preflight makes
		     [hidden] display: none !important from a layer, which no rule of ours
		     could undo for the checkbox. Closed is display: none all the same. -->
		<div class="nav-menu" id="nav-menu" class:open={menuOpen}>
			{#each links as link (link.id)}
				<a
					class="menu-link"
					class:active={active === link.id}
					href={link.href}
					aria-current={ariaCurrent(link)}
				>
					{link.label}
				</a>
			{/each}
			<ColorControls {lang} variant="menu" />
			<a class="menu-link" href={languageHref}>
				{lang === 'da' ? 'English' : 'Dansk'}
			</a>
			<GitHubLink variant="plain" class="menu-link" />
		</div>
	{/if}
</header>

<style>
	/* Off screen until it takes focus, then a normal pill at the top-left. */
	.skip-link {
		position: absolute;
		top: 8px;
		left: 8px;
		z-index: 60;
		padding: 10px 16px;
		border: 1.5px solid var(--green);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		transform: translateY(calc(-100% - 16px));
	}

	.skip-link:focus {
		transform: none;
	}

	.nav {
		position: relative;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		height: var(--nav-height);
		padding: 0 40px;
		box-sizing: border-box;
		background: var(--page);
		border-bottom: 1px solid var(--line);
	}

	/* The site's wordmark lines up with the hero's text column (Hero.svelte
	   .hero-inner: 80px from 1200px up, 56px from 900px). The design tools'
	   bar keeps its own, tighter, edges. */
	@media (min-width: 1200px) {
		.nav:not(.editor) {
			padding-left: 80px;
		}
	}

	@media (min-width: 900px) and (max-width: 1199px) {
		.nav:not(.editor) {
			padding-left: 56px;
		}
	}

	.nav-start {
		display: flex;
		align-items: center;
		gap: 20px;
		min-width: 0;
	}

	.nav-logo {
		text-decoration: none;
		font-size: 28px;
		font-weight: 600;
		color: var(--deep);
		line-height: 1;
		white-space: nowrap;
	}

	.nav-logo:hover {
		color: var(--green);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.nav-link {
		text-decoration: none;
		font-size: 15px;
		font-weight: 500;
		color: var(--green);
		padding: 6px 2px;
		border-bottom: 2px solid transparent;
	}

	.nav-link:hover {
		color: var(--red);
	}

	.nav-link.active {
		color: var(--red);
		border-bottom-color: var(--red);
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Tegn / Mal, centred in the bar: the two halves either side of it are the
	   back link with the wordmark and the page's own buttons, and neither is a
	   fixed width, so the switch is centred by the grid rather than by margins. */
	.mode-switch {
		display: inline-flex;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: var(--white);
	}

	.mode-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		text-decoration: none;
		color: var(--green);
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
	}

	.mode-link:hover {
		background: var(--cream2);
	}

	.mode-link.active {
		background: var(--green);
		color: var(--white);
	}

	.nav-burger {
		display: none;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border-radius: 10px;
		color: var(--green);
		background: var(--white);
		border: 1.5px solid var(--line);
		cursor: pointer;
	}

	/* The checkbox behind the no-JavaScript burger: on the page only under
	   html.no-js below 900, and then visually hidden (still focusable). */
	.nav-toggle {
		display: none;
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		opacity: 0;
		pointer-events: none;
	}

	/* The drop-down under the burger. Absolutely positioned so it covers the
	   hero rather than pushing the page down. */
	.nav-menu {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		flex-direction: column;
		padding: 10px 16px 16px;
		background: var(--page);
		border-bottom: 1px solid var(--line);
		box-shadow: var(--shadow-nav);
	}

	.menu-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 2px;
		text-decoration: none;
		font-size: 16px;
		font-weight: 500;
		color: var(--green);
		border-bottom: 1px solid var(--line);
	}

	.menu-link:last-child {
		border-bottom: 0;
	}

	.menu-link.active {
		color: var(--red);
	}

	.editor {
		height: auto;
		min-height: var(--nav-height);
		padding: 10px 24px;
	}

	/* With a mode switch the bar is three cells, so the switch sits in the middle
	   of the window and not in the middle of whatever is left over. */
	.editor:has(.mode-switch) {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
	}

	.editor:has(.mode-switch) .nav-actions {
		justify-content: flex-end;
	}

	.editor .nav-logo {
		font-size: 22px;
	}

	@media (max-width: 899px) {
		.nav {
			padding: 0 16px;
			height: var(--nav-height-sm);
		}

		.nav-logo {
			font-size: 24px;
		}

		/* The drawer already lists the language, GitHub and the paper colours, so the bar drops its
		   own copies rather than showing the same control twice in one viewport.
		   The editor keeps its pill: it has no drawer to fall back on. */
		.nav-links,
		.nav:not(.editor) .pill,
		.nav-actions :global(.nav-github),
		.nav:not(.editor) .nav-actions :global(.colors-bar) {
			display: none;
		}

		/* Tegn and Mal: below 900px their tools, the language pill and the
		   Tegn / Mal switch fill the bar, and the paper colours would push the
		   switch over the wordmark (and crush it on a phone). The designer's bar
		   has neither switch nor tools, and keeps them. */
		.editor:has(.mode-switch) .nav-actions :global(.colors-bar) {
			display: none;
		}

		.nav-burger:not(.nav-burger-nojs) {
			display: inline-flex;
		}

		.nav-menu.open {
			display: flex;
		}

		/* No JavaScript: the label opens the menu through its checkbox. */
		:global(html.no-js) .nav-burger:not(.nav-burger-nojs) {
			display: none;
		}

		:global(html.no-js) .nav-burger-nojs {
			display: inline-flex;
		}

		:global(html.no-js) .nav-toggle {
			display: block;
		}

		:global(html.no-js) .nav-toggle:checked ~ .nav-menu {
			display: flex;
		}

		:global(html.no-js) .nav-toggle:focus-visible ~ .nav-actions .nav-burger-nojs {
			outline: 3px solid var(--blue);
			outline-offset: 2px;
		}

		.nojs-close,
		:global(html.no-js) .nav-toggle:checked ~ .nav-actions .nojs-open {
			display: none;
		}

		:global(html.no-js) .nav-toggle:checked ~ .nav-actions .nojs-close {
			display: contents;
		}

		.editor {
			padding: 8px 16px;
		}
	}

	/* The editor's bar carries a back link, three tools and the language pill,
	   and none of them can go: below 700px that is more than fits next to the
	   wordmark, which is the one thing there twice — "Tilbage" leads to the same
	   place. The site variant keeps its wordmark; it only has a burger beside it. */
	@media (max-width: 699px) {
		.editor .nav-logo {
			display: none;
		}
	}

	/* Phones: the switch keeps its icons, and its words go on the title. The back
	   link keeps only its arrow, because with a switch in the middle there is no
	   room for two labels and three buttons beside it. */
	@media (max-width: 599px) {
		.mode-link {
			padding: 8px 12px;
		}

		.mode-link span {
			display: none;
		}

	}
</style>
