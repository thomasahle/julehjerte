# Score paper identity without hiding missing paper

The offline material evaluator scores the body and the two paper identities
separately, then measures their joint output. A model that excludes a difficult
paper region still receives an error for that region; correct identity inside
only its easiest predicted foreground is insufficient.

Each image receives one global A/B exchange, chosen from all annotated material
pixels. The same assignment is retained for joint scoring. Local exchanges are
errors, unknown material never becomes background, and body-labelled regions
without material labels still contribute to the body score. Fractional synthetic
coverage contributes expected classification error rather than being rounded
into a different target. Counts and the number of contributing images accompany
the averages; an image with no material labels has no material-accuracy claim.

Eight analytic tests cover these cases, including an all-missing body, hiding
exactly the wrong material prediction, local versus global label exchange,
fractional boundaries, unknown pixels and invalid data. All **90 offline
learning tests across fifteen modules** pass, including the concurrent source
profile-preservation fix. The [evidence record](material-evaluation.json) pins
the sources and complete log.

These metrics measure partial known regions. They do not establish complete
boundary localization, a correct crop, or valid reconstructed cutting paths.
No new model has been trained or deployed by this change.
