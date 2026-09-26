# First-Round ASR Model Pre-selection

The initial ASR model pool was defined by the models officially supported by the React Native inference runtime used in the mobile implementation, `whisper.rn`. The runtime supports Whisper models through `whisper.cpp` and NVIDIA Parakeet TDT 0.6B v3. The corresponding official model repositories were therefore used to establish the initial candidate pool.

The purpose of this first-round screening is **not to identify the best-performing model**, but to remove models that fall outside the technical scope, application requirements, or current deployment focus of the project. Performance-dependent properties such as recognition accuracy, inference latency and runtime memory are reserved for subsequent empirical evaluation.

## 1. Runtime Compatibility

Only models officially supported by the selected mobile inference runtime are considered.

For Whisper, the model pool is obtained from the official `ggerganov/whisper.cpp` model repository. For Parakeet, `whisper.rn` supports Parakeet TDT 0.6B v3 through the Parakeet implementation provided by `whisper.cpp`, with the corresponding model files distributed through the `ggml-org/parakeet-GGUF` repository.

The initial technical scope is therefore:

```text
Models supported by whisper.rn
│
├── Whisper
│   └── whisper.cpp model variants
│
└── Parakeet
    └── Parakeet TDT 0.6B v3
        ├── F32
        ├── F16
        ├── Q8_0
        ├── Q4_0
        └── Q4_K
```

Models requiring a different inference framework or additional native runtime are outside the scope of this comparison.

## 2. Language Coverage

LetsVoice Local is designed to support multilingual speech transcription. Language coverage is therefore used as an application-level eligibility criterion.

Whisper provides both multilingual models and English-only variants identified by the `.en` suffix. Where an equivalent multilingual model is available, the English-only variant is excluded.

This exclusion does not imply that English-only models are inferior. They are excluded because their language coverage does not satisfy the multilingual requirement of the application.

Parakeet TDT 0.6B v3 is retained because it supports multilingual transcription.

## 3. Model Generation

Where multiple generations of the same model family are available, superseded generations are excluded in favour of the latest generation.

This applies particularly to the Whisper Large family, for which `large-v1`, `large-v2` and `large-v3` represent successive generations. Since the objective of this study is to select models for **current mobile deployment**, rather than to investigate the historical development of Whisper, earlier Large checkpoints are excluded when the newer `large-v3` generation is available.

`large-v3` and `large-v3-turbo` are both retained. Although they belong to the same general model family, Turbo represents a distinct speed–accuracy configuration rather than simply an older checkpoint superseded by `large-v3`.

| Whisper Large variant | Decision | Reason                          |
| --------------------- | -------- | ------------------------------- |
| Large v1              | Excluded | Superseded generation           |
| Large v2              | Excluded | Superseded generation           |
| Large v3              | Retained | Current generation              |
| Large v3 Turbo        | Retained | Current speed-optimised variant |

The purpose of this criterion is to avoid benchmarking historical checkpoints that are not candidates for a new deployment while preserving current alternatives with potentially different deployment characteristics.

## 4. No Performance-Based Exclusion

No model is excluded during the first round solely because of its model size, numerical precision, quantisation level, expected latency or expected memory consumption.

For example, Whisper provides full-precision and quantised variants such as Q5 and Q8, while Parakeet TDT 0.6B v3 is available as F32, F16, Q8_0, Q4_0 and Q4_K.

All such representations are retained because quantisation and numerical precision may affect multiple competing properties:

- recognition accuracy;
- inference latency;
- runtime memory consumption; and
- model storage.

Removing a representation because it is larger or expected to be slower would predetermine part of the subsequent evaluation.

Likewise, Whisper Medium, Large v3 and Large v3 Turbo are not excluded simply because they have greater expected resource requirements. Whether they are feasible on the target mobile hardware is determined experimentally.

## 5. First-Round Candidate Set

After applying the three pre-selection criteria—runtime compatibility, multilingual language coverage, and model generation—the first-round screening produced **22 candidate model variants: 17 Whisper variants and 5 Parakeet variants**.

### 5.1 Whisper

English-only (`.en`) variants were excluded because they do not satisfy the multilingual requirement of LetsVoice Local. For the Large family, the superseded Large v1 and Large v2 generations and their quantised variants were also excluded in favour of the current Large v3 generation.

No remaining model was excluded because of model size, quantisation level, expected latency, or expected memory consumption.

The resulting **17 Whisper candidates** are:

|   # | Model                 | Variant        |
| --: | --------------------- | -------------- |
|   1 | `tiny`                | Full precision |
|   2 | `tiny-q5_1`           | Q5_1           |
|   3 | `tiny-q8_0`           | Q8_0           |
|   4 | `base`                | Full precision |
|   5 | `base-q5_1`           | Q5_1           |
|   6 | `base-q8_0`           | Q8_0           |
|   7 | `small`               | Full precision |
|   8 | `small-q5_1`          | Q5_1           |
|   9 | `small-q8_0`          | Q8_0           |
|  10 | `medium`              | Full precision |
|  11 | `medium-q5_0`         | Q5_0           |
|  12 | `medium-q8_0`         | Q8_0           |
|  13 | `large-v3`            | Full precision |
|  14 | `large-v3-q5_0`       | Q5_0           |
|  15 | `large-v3-turbo`      | Full precision |
|  16 | `large-v3-turbo-q5_0` | Q5_0           |
|  17 | `large-v3-turbo-q8_0` | Q8_0           |

These 17 variants represent the current multilingual Whisper model families and their officially available quantised representations within the selected runtime.

### 5.2 Parakeet

`whisper.rn` currently supports NVIDIA Parakeet TDT 0.6B v3 through the Parakeet implementation provided by `whisper.cpp`. The official `ggml-org/parakeet-GGUF` repository provides five numerical representations of this model.

No representation is removed during the first-round screening because the effects of numerical precision and quantisation on mobile storage, memory consumption, latency and recognition accuracy are intended to be evaluated empirically.

The resulting **5 Parakeet candidates** are:

|   # | Model                       | Variant |
| --: | --------------------------- | ------- |
|  18 | `parakeet-tdt-0.6b-v3-f32`  | F32     |
|  19 | `parakeet-tdt-0.6b-v3-f16`  | F16     |
|  20 | `parakeet-tdt-0.6b-v3-q8_0` | Q8_0    |
|  21 | `parakeet-tdt-0.6b-v3-q4_0` | Q4_0    |
|  22 | `parakeet-tdt-0.6b-v3-q4_k` | Q4_K    |

### 5.3 First-Round Result

The first-round candidate pool is therefore:

| Model family           | Number of candidates |
| ---------------------- | -------------------: |
| Whisper Tiny           |                    3 |
| Whisper Base           |                    3 |
| Whisper Small          |                    3 |
| Whisper Medium         |                    3 |
| Whisper Large v3       |                    2 |
| Whisper Large v3 Turbo |                    3 |
| Parakeet TDT 0.6B v3   |                    5 |
| **Total**              |               **22** |

These 22 candidates proceed to real-device feasibility testing.

At this stage, the objective is to determine whether each candidate can successfully load and complete transcription on the target mobile hardware. Recognition accuracy, inference latency, runtime memory consumption and storage requirements are subsequently used for empirical comparison rather than as assumptions during pre-selection.

## 6. Selection Process

The complete selection process is therefore:

```text
Models officially supported by whisper.rn
                    │
                    ▼
         1. Runtime Compatibility
                    │
                    ▼
          2. Language Coverage
       exclude English-only models
                    │
                    ▼
           3. Model Generation
       exclude superseded checkpoints
                    │
                    ▼
        First-round candidate pool
                    │
                    ▼
       Real-device feasibility test
        ├── model loads successfully
        ├── transcription completes
        └── no OOM / application failure
                    │
                    ▼
          Feasible candidate set
                    │
                    ▼
           Empirical benchmark
        ├── recognition accuracy
        ├── inference latency
        ├── runtime memory
        └── model storage
                    │
                    ▼
        Multi-objective comparison
                    │
                    ▼
          Final model selection
```

The first-round screening therefore establishes **eligibility rather than performance superiority**. Models are removed only because they fall outside the selected runtime, do not satisfy the multilingual requirement, or have been superseded by a newer generation.

Performance and resource-efficiency differences between the remaining candidates are determined through subsequent real-device evaluation.
