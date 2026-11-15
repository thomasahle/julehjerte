/** A motif from the open icon sets (`iconSearch`), as Iconify names it: `set:icon`. The site's own have no colon. */
export const ICON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isIconId = (id: string) => id.length <= 100 && ICON_ID.test(id);
