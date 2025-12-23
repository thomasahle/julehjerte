<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import {
    t,
    langFromPathname,
    langPrefix,
    type Language,
  } from "$lib/i18n";
  import {
    getColors,
    setLeftColor,
    setRightColor,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import GitHubStarsButton from "$lib/components/GitHubStarsButton.svelte";
  
  let colors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });
  let lang = $derived(langFromPathname($page.url.pathname, base));
  let toggleHref = $derived.by(() => {
    const path = $page.url.pathname;
    const pathWithoutBase = base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
    const stripped = pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`;

    const otherLang = lang === 'en' ? 'da' : 'en';
    const withoutLangPrefix =
      stripped === '/en' ? '/' : stripped.startsWith('/en/') ? stripped.slice(3) : stripped;

    const targetPath = `${base}${langPrefix(otherLang)}${withoutLangPrefix}`;
    const search = browser ? $page.url.search : '';
    const hash = browser ? $page.url.hash : '';
    return `${targetPath}${search}${hash}`;
  });

  onMount(() => {
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });
  });
</script>

<footer class="page-footer">
  <div class="footer-controls">
    <div class="flex items-center gap-2">
      <Tooltip.Root>
        <Tooltip.Trigger>
          <label
            class="inline-flex size-8 rounded-full shadow-xs cursor-pointer overflow-hidden"
          >
            <input
              type="color"
              id="left-color"
              name="left-color"
              value={colors.left || '#ffffff'}
              oninput={(e) =>
                setLeftColor((e.target as HTMLInputElement).value)}
              class="w-full h-full border-0 cursor-pointer scale-150"
            />
          </label>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{t("leftColor", lang)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <label
            class="inline-flex size-8 rounded-full shadow-xs cursor-pointer overflow-hidden"
          >
            <input
              type="color"
              id="right-color"
              name="right-color"
              value={colors.right || '#cc0000'}
              oninput={(e) =>
                setRightColor((e.target as HTMLInputElement).value)}
              class="w-full h-full border-0 cursor-pointer scale-150"
            />
          </label>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{t("rightColor", lang)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </div>
    <Button
      variant="secondary"
      size="sm"
      href={toggleHref}
      title={lang === "da" ? "Switch to English" : "Skift til dansk"}
      class="rounded-full"
    >
      {lang === "da" ? "🇬🇧 EN" : "🇩🇰 DA"}
    </Button>
    <GitHubStarsButton repo="thomasahle/julehjerte" />
    <span class="made-by">
      {t("madeBy", lang)}
      <a href="https://thomasahle.com" target="_blank" rel="noopener"
        >Thomas Ahle</a
      >, {lang === "da" ? "julen" : "Christmas"} 2025
    </span>
  </div>
</footer>

<style>
  .page-footer {
    margin-top: 2rem;
    padding: 1.5rem 2rem;
    background: rgba(255, 255, 255, 0.3);
  }

  .footer-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .made-by {
    color: #888;
    font-size: 0.875rem;
  }

  .made-by a {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
  }

  .made-by a:hover {
    color: #cc0000;
  }
</style>
