export function toggleNumberInList(list: number[], value: number): number[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function addNumbersToList(list: number[], values: number[]): number[] {
  const next = new Set(list);
  for (const v of values) next.add(v);
  return Array.from(next);
}

export function removeNumbersFromList(list: number[], values: number[]): number[] {
  const remove = new Set(values);
  return list.filter((x) => !remove.has(x));
}

