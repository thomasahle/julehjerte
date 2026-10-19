import test from 'node:test';

/**
 * Fresh searches whose quality/path assertions depend on how much optimization
 * fits into a wall-clock allowance. Keep every original assertion and budget.
 * npm test runs these normally; release CI reports them in its advisory job.
 * Fixed-work geometry, paper, image-loss and export tests remain release gates.
 */
export function qualityBenchmark(name,...args){
  return test(`benchmark: ${name}`,...args);
}
