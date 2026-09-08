<!--
  The site nav — docs/redesign/DESIGN.md §3 "Nav".

  Two variants:
    site   (default) logo · Skabeloner / Sådan gør du / Om · EN pill · GitHub pill,
           collapsing to a 44px burger with a drop-down menu under 900px.
    editor logo with a back link at the left and the page's own buttons
           (passed as children) at the right — no nav links, no pills.

  Every page mounts this component, so keep the prop names stable:
    lang      the page language
    active    which nav link is current: 'templates' | 'howto' | 'about'
    variant   'site' | 'editor'
    backHref  editor variant: where the back link goes (default: the gallery)
    onBack    editor variant: intercept the back click (the editor returns to
              the detail page it came from)
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
	import { ArrowLeftIcon, ImageIcon, MenuIcon, CloseIcon, PencilIcon } from '$lib/components/icons';
	import GitHubLink from '$lib/components/GitHubLink.svelte';

	type NavSection = 'templates' | 'howto' | 'about';

	/** Which of the editor's two modes the page is (docs/redesign/PAINT.md §1). */
	type EditorMode = { current: 'draw' | 'paint' };

	interface Props {
		lang: Language;
		active?: NavSection;
		variant?: 'site' | 'editor';
		backHref?: string;
		onBack?: (event: MouseEvent) => void;
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
		backHref = undefined,
		onBack = undefined,
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
		{ id: 'templates' as NavSection, href: homeHref, label: t('navTemplates', lang) },
		{ id: 'howto' as NavSection, href: routeHref('howTo', lang), label: t('navHowTo', lang) },
		{ id: 'about' as NavSection, href: routeHref('about', lang), label: t('navAbout', lang) }
	]);

	// The same page in the other language. Query and hash only exist client-side.
	let languageHref = $derived(
		otherLanguageUrl(
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

	afterNavigate(() => {
		menuOpen = false;
	});

	function handleBack(e: MouseEvent) {
		if (onBack) {
			onBack(e);
			return;
		}
		if (browser && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
			e.preventDefault();
			window.history.back();
		}
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
	<div class="nav-start">
		{#if variant === 'editor'}
			<!-- The label is a span so the editor bar can drop it on a phone, where
			     the mode switch takes the middle and the arrow still says "back". -->
			<a
				class="back-link"
				href={backHref ?? homeHref}
				onclick={handleBack}
				aria-label={t('back', lang)}
			>
				<ArrowLeftIcon size={16} />
				<span>{t('back', lang)}</span>
			</a>
		{/if}
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
					aria-current={active === link.id ? 'page' : undefined}
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
		{/if}
	</div>

	{#if variant === 'site'}
		<div class="nav-menu" id="nav-menu" hidden={!menuOpen}>
			{#each links as link (link.id)}
				<a
					class="menu-link"
					class:active={active === link.id}
					href={link.href}
					aria-current={active === link.id ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
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

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		color: var(--green);
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
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

		/* The drawer already lists the language and GitHub, so the bar drops its
		   own copies rather than showing the same control twice in one viewport.
		   The editor keeps its pill: it has no drawer to fall back on. */
		.nav-links,
		.nav:not(.editor) .pill,
		.nav-actions :global(.nav-github) {
			display: none;
		}

		.nav-burger {
			display: inline-flex;
		}

		.nav-menu:not([hidden]) {
			display: flex;
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

		.editor:has(.mode-switch) .back-link span {
			display: none;
		}
	}
</style>
