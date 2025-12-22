export function makeHeartAnchorId(id: string): string {
  return `heart-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
