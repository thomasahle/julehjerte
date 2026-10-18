# Preserve learned foreground when adding paper identities

The offline material model has two outputs: selected heart body and the paper
identity conditional on that body. Constructing a fresh two-output head would
discard the already trained foreground output. `material_from_foreground`
now copies the learned encoder and decoder, retains that output row and adds a
neutral material row. The two-paper loss already chooses one consistent A/B
assignment per image, allowing the zero-initialized row to receive a gradient.

The parent model remains independent and unchanged. The transfer preserves
module modes, frozen feature parameters, floating-point dtype and pretrained
provenance without consuming the CPU random stream. The new output layer is
trainable; the caller still controls the subsequent training policy.

Four focused tests cover retained predictions, non-aliased parameters and
buffers, a material-training update with a frozen encoder, double precision,
independent provenance metadata and rejection of an already expanded model.
All 81 tests across fourteen offline learning modules pass. The
[record](material-transfer.json) pins the source and test log.

This is the model handoff for the next training experiment. It does not add a
trained material model, establish improved reconstruction, or change the app.
