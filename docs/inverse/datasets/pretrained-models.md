# Pretrained models for photographic heart reconstruction

Reviewed 2026-10-12. **Start with `timm/mobilenetv3_small_100.lamb_in1k` and new boundary, junction and connection-scoring heads.** Keep DINOv2-S/14 as an optional offline feature teacher. This historical selection pass did not run training, inference or ONNX export. Later experiments use TorchVision's ImageNet-pretrained MobileNetV3-Small and official pretrained MobileSAM; see the [current inventory and measured results](README.md). No learned model is deployed.

The selected checkpoint has been downloaded and its actual length and SHA-256 checked against the publisher's metadata. Exact revisions, artifact hashes, license sources and retrieval status are in [pretrained-model-sources.json](pretrained-model-sources.json). The binary is untracked under `tmp/heart-training-models/`; it is not included in the website.

## Candidate comparison

Sizes describe published models, including their original heads where applicable. Our replacement heads will change both size and runtime. License entries report the publishers' declarations separately for code and weights; an implementation's license does not by itself establish a separately hosted checkpoint's terms.

| Candidate | Available pretraining and size | Code / weight license evidence | Intended experiment |
| --- | --- | --- | --- |
| **MobileNetV3-Small, timm LAMB checkpoint** | ImageNet-1k classification; approximately 2.5M parameters; downloaded safetensors file 10,241,912 bytes | [timm code: Apache-2.0](https://github.com/huggingface/pytorch-image-models/blob/cfc742eb6a4bc4bb35ef20c9b2d5a2a31f599bba/LICENSE); [checkpoint card: Apache-2.0](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k/blob/1824797e7887cbec1990e4adbd6675960a36c589/README.md) | **First student.** Convolutional feature pyramid and lightweight new heads. Generic visual initialization, not a pretrained heart parser. |
| MobileNetV4-Conv-Small, timm `e2400_r224_in1k` | ImageNet-1k; approximately 3.8M parameters; safetensors metadata 15,223,016 bytes | Same timm code license; [checkpoint card: Apache-2.0](https://huggingface.co/timm/mobilenetv4_conv_small.e2400_r224_in1k/blob/331fb803779522b685cf942e15f914fb6741c1eb/README.md) | Second student/backbone ablation. Convolution-only variant avoids needing attention, but greater ImageNet accuracy does not prove better thin-boundary recovery or browser speed. |
| MobileViT-XXS | ImageNet-1k; approximately 1.3M parameters; published weights available | [Apple implementation: Apple sample-code license](https://github.com/apple/ml-cvnets/blob/main/LICENSE); [checkpoint card declares the same license](https://huggingface.co/apple/mobilevit-xx-small) | Smaller parameter-count alternative with global context. Attention and reshape overhead mean it cannot be ranked by parameter count alone. |
| M-LSD Tiny | Trained line detector; official 512px FP32 TFLite artifact 2,491,732 bytes | [Code and bundled model repository: Apache-2.0](https://github.com/navervision/mlsd/tree/453cafa09467d0272760578d35c1fda38e8895a5); no separate weight-specific statement found | Very useful straight-line/crop baseline. [Official release is TensorFlow/TFLite](https://github.com/navervision/mlsd#how-to-convert-ckpt-models-to-tflite-models), not verified ONNX. It does not natively model curves or invisible shared cuts. |
| HAWPv3 ImageNet checkpoint | Self-supervised wireframe prediction on 100k ImageNet images; official `.pth` asset 47,315,279 bytes | [Code: MIT](https://github.com/cherubicXN/hawp/blob/92ae446875ef9296fc95de7313519aabd638ebb5/LICENSE); release checkpoint has no separate license statement identified in the inspected sources | Structured-prediction research baseline. [Published weights and training domains](https://github.com/cherubicXN/hawp/blob/92ae446875ef9296fc95de7313519aabd638ebb5/docs/HAWPv3.md). Its junction/line formulation is relevant; visible straight wireframes are not our hidden curved graph. Do not assume redistribution clearance or browser compatibility from its code license. |
| **DINOv2-S/14** | Self-supervised/distilled features, LVD-142M; approximately 21M parameters; selected HF safetensors metadata 88,249,960 bytes | [Core DINOv2 code and these weights: Apache-2.0](https://github.com/facebookresearch/dinov2/blob/7764ea0f912e53c92e82eb78a2a1631e92725fc8/MODEL_CARD.md); [selected model card](https://huggingface.co/facebook/dinov2-small/blob/ed25f3a31f01632728cabb09d1542f84ab7b0056/README.md) | **Optional offline teacher** or frozen-feature baseline. Useful for photo variation and dataset clustering. Patch size 14 makes it unsuitable as the sole source of precise seam/corner labels. |
| SAM 2.1 Hiera Tiny | Promptable object masks; 38.9M parameters; official checkpoint available | [Code and checkpoints explicitly Apache-2.0](https://github.com/facebookresearch/sam2#license); optional third-party component has its own notice | Assisted annotation of whole hearts in cluttered photos. Its [published model and task](https://github.com/facebookresearch/sam2#model-description) do not establish two-paper segmentation, overlap-square corners or cut topology. Keep human review. |
| SegFormer-B0 ADE20K | Dense semantic segmentation; approximately 3.75M parameters; available 15,036,944-byte safetensors artifact | [Original code: NVIDIA research/evaluation-only license](https://github.com/NVlabs/SegFormer/blob/master/LICENSE); [checkpoint card: `other`, linked NVIDIA license](https://huggingface.co/nvidia/segformer-b0-finetuned-ade-512-512) | Technically relevant segmentation baseline, **not the default deployment candidate**. Do not substitute Transformers' code license for these checkpoint terms. |

The newer Cell-DINO and XRay-DINO assets in the DINOv2 repository have different licenses. This recommendation names the ordinary `dinov2-small` checkpoint specifically, not every model in that repository. No browser timing claim is inferred from a paper's GPU or native-mobile benchmark.

## Concrete first initialization

Checkpoint: `timm/mobilenetv3_small_100.lamb_in1k`, revision `1824797e7887cbec1990e4adbd6675960a36c589`.

- [Pinned safetensors download](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k/resolve/1824797e7887cbec1990e4adbd6675960a36c589/model.safetensors)
- Local verified file: `tmp/heart-training-models/mobilenetv3_small_100.lamb_in1k-1824797e7887.safetensors`
- SHA-256: `46d2c063b18125884c48937afa4c49e18128869e52e8db96df48bf0a4d7ff697`

The upstream [feature-extraction API](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k#feature-map-extraction) and [revision parser](https://github.com/huggingface/pytorch-image-models/blob/cfc742eb6a4bc4bb35ef20c9b2d5a2a31f599bba/timm/models/_hub.py#L131) support this proposed initialization; it has not been executed here:

```python
encoder = timm.create_model(
    "hf-hub:timm/mobilenetv3_small_100.lamb_in1k@1824797e7887cbec1990e4adbd6675960a36c589",
    pretrained=True,
    features_only=True,
    exportable=True,
)
```

Keep the pretrained RGB stem. Feed the existing soft paper mask and uncertainty into a separate shallow branch and the decoder, rather than silently changing the stem's three input channels. Preserve the whole rectified square during preprocessing; classification-style center cropping would discard precisely the border information needed for slit inference.

Use fixed 384px and 512px input sizes as an ablation. A final stride-32 feature map alone cannot represent small rays and corners reliably. Fuse early stride-2/4 detail with deeper context into a stride-4 decoder, with subpixel junction offsets and a shallow full-resolution boundary refinement branch. Compare a dilated `output_stride=16` encoder—the [feature implementation supports this parameter](https://github.com/huggingface/pytorch-image-models/blob/cfc742eb6a4bc4bb35ef20c9b2d5a2a31f599bba/timm/models/mobilenetv3.py#L360)—against the ordinary encoder with skips. These are design choices to measure, not demonstrated preservation of tiny features. Dilation increases feature-map cost and cannot restore details already destroyed by downsampling.

Predict soft paper membership, visible-boundary distance/tangent fields, junction heatmaps and offsets, border endpoint hypotheses, and compact local feature embeddings. Score proposed connections with a small MLP using endpoint embeddings, tangent compatibility, length, sampled image evidence, clearance and context. Generate multiple plausible junction/connection hypotheses; score alone cannot recover a connection omitted by candidate generation. Keep graph decoding, geometric pruning and MILP constraints explicit.

## Teacher and supervision

First try frozen DINOv2-S/14 features with a shallow trained decoder; distill into the small CNN only if this improves held-out real-photo performance. Treat its output as a noisy auxiliary signal, never ground truth for invisible shared cuts. Use synthetic validated template pairs for precise cut/junction labels and manually checked real photographs for paper colors, visible contours and crop geometry.

Group related photos, templates, synthetic variants and motifs before splitting the dataset. Unlabeled real photos can contribute augmentation-consistency training, but the final real-photo test set must not enter this training. An unused edge in one valid reference is not automatically a negative: multiple template pairs can produce the same mask. Use multiple validated targets where available, permutation-invariant sheet assignment, uncertainty for unobservable junctions, and downstream valid-solution recall as the main graph objective. Supervise shared cuts as shared geometry so later refinement cannot separate them into false seams.

The local [boundary/junction study](../README.md#follow-up-boundary-quality-versus-junction-placement) found 9/24 valid cases for one raster strategy versus 24/24 with exact boundaries and reference subdivision. This is an oracle comparison, not an expected neural-network score; reference junctions can contain information absent from the image. It also shows why larger candidate pools alone are not the objective.

## Export and evaluation gates

[timm provides ONNX export tooling](https://github.com/huggingface/pytorch-image-models/blob/cfc742eb6a4bc4bb35ef20c9b2d5a2a31f599bba/onnx_export.py), and ONNX Runtime Web offers [WASM and WebGPU](https://onnxruntime.ai/docs/tutorials/web/). This does **not** verify the proposed custom model. Start with batch one, fixed shapes, ordinary convolution/activation/resize layers and FP32. Keep dynamic junction extraction and graph assembly outside the ONNX graph. A separate fixed-capacity edge-scoring graph with padding/masks is an exportable design to test.

Check the actual exported operator/opset list against the selected runtime version. Its current [WebGPU support table](https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md) includes Conv, HardSwish (opset 14+), Gather and Resize, but lists a downsampling restriction for Resize with `align_corners`. CPU/WASM fallback is a separate measured target. HAWP's current [detector](https://github.com/cherubicXN/hawp/blob/92ae446875ef9296fc95de7313519aabd638ebb5/hawp/ssl/models/detector.py) includes NumPy/CPU uniqueness processing and data-dependent junction selection; it is not a drop-in exported network.

Compare (1) existing vectorization and a simple geometric edge ranker, (2) identical small CNN from random initialization, (3) pretrained MobileNetV3, (4) MobileNetV4 and (5) optional frozen/teacher DINOv2. Separate clean-mask graph tests from the entire photo pipeline. Measure valid solutions within ten seconds **including preprocessing and network inference**, image/feature error, boundary and junction precision, graph size, candidate coverage, and stability under crop/color/noise perturbations. A small edge-count target must not erase rare valid routes; retain the existing fallback and independent validation.

Before serving any model, record numerical agreement between Python and ONNX, cold download/startup and warm inference, peak memory, total solve time, and operator failures on Chromium/WebKit with WASM and supported WebGPU devices. Check FP16/INT8 only after the FP32 baseline; small coordinate or probability shifts can alter topology. None of those deployment checks has been performed in this research pass.
