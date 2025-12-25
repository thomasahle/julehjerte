export function toggleNumberInList(list: number[], value: number): number[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
