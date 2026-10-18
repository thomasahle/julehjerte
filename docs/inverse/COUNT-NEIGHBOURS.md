# Unequal count neighbours: useful proposals, insufficient selection policy

The previous star diagnosis found a manually added 3+4 hypothesis with lower
final error than the original shortlist. A bounded, image-only expansion was
therefore tested before changing production count selection. Its measurements
are retained in [COUNT-NEIGHBOURS.json](COUNT-NEIGHBOURS.json).

The experiment first runs the unchanged initializer. If opposite inset bands
have no consistent count pair and the best initialized grid exceeds the ordinary
3% error limit, it adds the four possible one-cut increments/decrements of either
family of that best grid, in both colour phases. Existing hypotheses are retained;
duplicates and out-of-range counts are removed. All candidates use the same
initializer, existing ranking, three-finalist selection and common fitter.

Five fixed automatic crops were selected before full comparison: the five-point
star, narrow/wide checker, nested red heart, arranged r1c2 and arranged r4c2.
There are six or eight additional count/phase hypotheses, not an exhaustive
128-option search. No published cutting paths, corrected corners or known counts
enter these runs. Source masks and settings remain unchanged; fitting has ten
seconds, with early stopping disabled in both the experiment and its baseline.

| Photograph | Previous independent error | Expanded search | Result |
| --- | ---: | ---: | --- |
| Five-point star | 3.165% | 3.165% | Still misses two regions |
| Narrow/wide checker | 2.026875% | 2.178125% | Both pass; fitted count orientation changes |
| Nested red heart | 2.806875% | 1.525% | Both pass; 4+4 becomes 4+3 |
| Arranged r1c2 | 2.7175% | 2.7175% | Still misses 17 regions |
| Arranged r4c2 | 3.79625% | 3.79625% | Still misses one region |

Counts in this table are unordered sheet counts; the detailed record preserves
left/right order. The nested heart's improvement is substantial, but the narrow/
wide checker worsens and there are no newly passing cases. The expansion is
therefore **not promoted to the production default**.

## Ranking is also a limitation

On the star, the expanded initialization puts 3+4 with the useful phase fifth,
behind 3+3, 4+4, 4+3 and 2+3. It still does not receive curve refinement in the
ordinary three-finalist path. Even a separate 150-step grid refinement of all
six leading seeds ranks it fourth under the existing error-plus-count score.
The earlier restricted 3+4 experiment demonstrated that its freely fitted curves
can be better despite that weaker grid rank.

On the narrow/wide checker, new candidates displace the previous successful count
orientation from the first three. On the nested heart, an added unequal pair
creates the better result. Thus neither merely broadening the count list nor
ranking additional grids by their image error establishes a generally better
policy. The next comparison needs to retain the original viable candidates and
test how to allocate refinement to genuinely different routings. The new
[committed hard-photo corpus](../../scripts/inverse/fixtures/hard-photos/README.md)
provides the original 31 complete hearts for that broader comparison.

The screening times (about 0.91–1.17 seconds to initialize original plus extra
hypotheses) are individual measurements, not a repeated speed study. Final
photographic mask error is not ground-truth cutting-path recovery. The more
extensive earlier speed comparison remains in [COUNT-STRATEGIES.md](COUNT-STRATEGIES.md).
