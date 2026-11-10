import { CutGeometryError } from '$lib/inverse/toHeartDesign';
import { ConstructionError } from './geometry';

/** A way of making a heart saying it cannot: the construction found no room
 * (`ConstructionError`), or the cut check turned its cuts down
 * (`CutGeometryError`). The generator answers a refusal by trying another
 * way; anything else thrown is a fault in the code and must not be
 * swallowed as one. */
export type Refusal = ConstructionError | CutGeometryError;

export function isRefusal(error: unknown): error is Refusal {
	return error instanceof ConstructionError || error instanceof CutGeometryError;
}

/** For a `catch` that goes on to another way: what it caught is a refusal,
 * or it is thrown on. */
export function refusal(error: unknown): asserts error is Refusal {
	if (!isRefusal(error)) throw error;
}

/** What `make` gives, or nothing where it refuses. */
export function unlessRefused<T>(make: () => T): T | undefined {
	try {
		return make();
	} catch (error) {
		refusal(error);
		return undefined;
	}
}
