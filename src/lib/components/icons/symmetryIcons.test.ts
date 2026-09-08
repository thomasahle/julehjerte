import { describe, expect, it } from 'vitest';
import {
	SYMMETRY_ICON_MODES,
	SYMMETRY_ICON_PATHS,
	SYMMETRY_ICON_ROWS,
	type SymmetryIconPath
} from './symmetryIcons';

/** What a glyph actually draws: its paths, each with where it is placed. */
function drawing(paths: SymmetryIconPath[]): string {
	return paths.map((p) => `${p.transform ?? ''}|${p.d}`).join(' ');
}

describe('symmetry icon paths', () => {
	it('has a glyph for every row and mode', () => {
		for (const row of SYMMETRY_ICON_ROWS) {
			for (const mode of SYMMETRY_ICON_MODES) {
				const paths = SYMMETRY_ICON_PATHS[row][mode];
				expect(paths.length, `${row}/${mode}`).toBeGreaterThan(0);
				for (const path of paths) {
					// A path that is empty or does not start with a move draws nothing,
					// and the segment would sit there with a hole in it.
					expect(path.d, `${row}/${mode}`).toMatch(/^M/);
				}
			}
		}
	});

	// Nine pictures that a visitor is meant to tell apart: if two of them came out
	// the same, a row or a mode would be saying nothing.
	it('draws all nine differently', () => {
		const drawings = SYMMETRY_ICON_ROWS.flatMap((row) =>
			SYMMETRY_ICON_MODES.map((mode) => drawing(SYMMETRY_ICON_PATHS[row][mode]))
		);
		expect(new Set(drawings).size).toBe(drawings.length);
	});

	// Within a row the three share their setting and their first cut; the whole
	// difference between Fra, Sym and Anti is the second cut.
	it('changes exactly the following cut between the modes of a row', () => {
		for (const row of SYMMETRY_ICON_ROWS) {
			const [off, sym, anti] = SYMMETRY_ICON_MODES.map((mode) => SYMMETRY_ICON_PATHS[row][mode]);
			expect(off.length, row).toBe(sym.length);
			expect(sym.length, row).toBe(anti.length);
			for (let i = 0; i < off.length - 1; i++) {
				expect(sym[i], `${row} path ${i}`).toEqual(off[i]);
				expect(anti[i], `${row} path ${i}`).toEqual(off[i]);
			}
			const last = off.length - 1;
			expect(sym[last].d, row).not.toBe(off[last].d);
			expect(anti[last].d, row).not.toBe(off[last].d);
			expect(anti[last].d, row).not.toBe(sym[last].d);
		}
	});

	// The shape a cut sits in is context, held back so the cuts read first; a cut
	// drawn faint would be the icon losing its subject.
	it('softens the outline and nothing else', () => {
		for (const row of SYMMETRY_ICON_ROWS) {
			for (const mode of SYMMETRY_ICON_MODES) {
				const paths = SYMMETRY_ICON_PATHS[row][mode];
				const soft = paths.filter((p) => p.soft);
				expect(soft.length, `${row}/${mode}`).toBeLessThanOrEqual(1);
				if (soft.length === 1) expect(paths[0].soft, `${row}/${mode}`).toBe(true);
			}
		}
	});
});
