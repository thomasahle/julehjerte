<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import {
    t,
    getLanguage,
    setLanguage,
    subscribeLanguage,
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
  import { Separator } from "$lib/components/ui/separator";
  import GitHubStarsButton from "$lib/components/GitHubStarsButton.svelte";
  
  let lang = $state<Language>("da");
  let colors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });

  onMount(() => {
    lang = getLanguage();
    subscribeLanguage((l) => {
      lang = l;
    });
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });
  });

  function toggleLanguage() {
    const newLang = lang === "da" ? "en" : "da";
    setLanguage(newLang);
    lang = newLang;
  }
</script>

<footer class="page-footer">
  <Separator class="mb-6" />
  <div class="footer-controls">
    <div class="flex items-center gap-2">
      <Tooltip.Root>
        <Tooltip.Trigger>
          <label
            class="inline-flex size-8 rounded-full shadow-xs cursor-pointer overflow-hidden"
          >
            <input
              type="color"
              value={colors.left}
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
            class="inline-flex size-8 rounded-full border shadow-xs cursor-pointer overflow-hidden"
          >
            <input
              type="color"
              value={colors.right}
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
      onclick={toggleLanguage}
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
      >, 2025
    </span>
  </div>
</footer>

<style>
  .page-footer {
    margin-top: 2rem;
    padding: 0 2rem 2rem;
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
