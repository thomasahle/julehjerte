import { it } from 'vitest';

/**
 * A generator regression that builds whole hearts and takes seconds. These run
 * with `npm run test:slow`, not in the deploy workflow, which has to finish
 * well inside ten minutes on GitHub's slower machines.
 */
export const slow = it.runIf(process.env.GENERATOR_SLOW);
