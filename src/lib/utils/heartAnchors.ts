const PREFIX = 'heart-';

export function makeHeartAnchorId(id: string): string {
  return `${PREFIX}${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * The card anchor the front page centres on load, from `location.hash`, or
 * null. Only `#heart-<id>` counts: a category hash (`#moenstre`) is left to the
 * browser's own anchor jump, which the section's scroll-margin-top lands under
 * the gallery bar. Centring a 26-heart section put its top 2000px above the
 * screen.
 */
export function heartAnchorFromHash(hash: string): string | null {
  const id = hash.replace(/^#/, '');
  return id.startsWith(PREFIX) && id.length > PREFIX.length ? id : null;
}

/**
 * The gallery anchor other than a card's (a category, `#skabeloner`) the front
 * page lands again once its gallery has been measured, or null: the browser's
 * own jump to it came before the gallery's pull-up, bar room and strands were
 * known. Only when the page was entered with that hash — loaded fresh (`enter`
 * with a `navigate` load) or by a link. A reload or a step through history
 * keeps the browser's restored position, which may be wherever the visitor
 * had scrolled to since, and a `goto` (ticking a card rewrites the URL, hash
 * and all) is no landing at all.
 *
 * @param navigation SvelteKit's navigation type (afterNavigate).
 * @param loadType The document's own load type (PerformanceNavigationTiming),
 *   when known; only consulted for `enter`.
 */
export function sectionAnchorToLand(
  navigation: string,
  hash: string,
  loadType: string | undefined
): string | null {
  if (navigation !== 'enter' && navigation !== 'link') return null;
  if (navigation === 'enter' && loadType !== undefined && loadType !== 'navigate') return null;
  if (heartAnchorFromHash(hash)) return null;
  let id = hash.replace(/^#/, '');
  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape: look the hash up as it is.
  }
  return id || null;
}
