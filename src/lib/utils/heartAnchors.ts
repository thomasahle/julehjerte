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
