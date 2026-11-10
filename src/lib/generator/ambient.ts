/** A choice in how hearts are made that the code deep below reads without its
 * being passed down to it: off, but for what is built inside `during`. */
export type AmbientSwitch = {
	readonly on: boolean;
	/** What `build` gives with the switch on; afterwards it is as it was,
	 * also where `build` throws. */
	during<T>(build: () => T): T;
};

export function ambientSwitch(): AmbientSwitch {
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
	return state;
}
