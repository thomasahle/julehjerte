/** A choice in how hearts are made that the code deep below reads without its
 * being passed down to it: off, but for what is built inside `during`. */
export type AmbientSwitch = {
	readonly on: boolean;
	/** What `build` gives with the switch on; afterwards it is as it was,
	 * also where `build` throws. */
	during<T>(build: () => T): T;
};

/** The switches that have a name, for saying which are on (see `switchesOn`). */
const named: [string, AmbientSwitch][] = [];

/** A switch; with a `name`, one that `switchesOn` tells of while it is on. */
export function ambientSwitch(name?: string): AmbientSwitch {
	const state = {
		on: false,
		during<T>(build: () => T): T {
			const before = state.on;
			state.on = true;
			try {
				return build();
			} finally {
				state.on = before;
			}
		}
	};
	if (name) named.push([name, state]);
	return state;
}

/** The names of the switches on now, in the alphabet's order: how what is
 * built now differs from what is built with none (see `GeneratorResult.via`). */
export const switchesOn = (): string[] => named.filter(([, state]) => state.on).map(([name]) => name).sort();
