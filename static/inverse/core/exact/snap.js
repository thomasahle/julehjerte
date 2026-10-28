/** The target's exact outline, as the exact search reads it: its structure,
 * the outline with the app's rules, and the rules for hidden routes. */
import {buildStructure} from './structure.js';
import {Outline, rules} from './outline.js';
import {targetSegments} from './target.js';
import {RouteRules} from './routes.js';

/** The exact outline of a prepared target: {st, outline, routes}. */
export function exactOutline(target, cfg, strictness = 'tight', {symmetry = []} = {}) {
  const st = buildStructure(targetSegments(target, {symmetry})), outline = new Outline(st, rules(cfg, strictness));
  return {st, outline, routes: new RouteRules(st, outline)};
}
