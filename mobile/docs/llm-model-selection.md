# First-Round LLM Model Pre-selection

The initial LLM model pool was defined by the inference runtime used in the
mobile implementation, `llama.rn`.

`llama.rn` provides React Native bindings for `llama.cpp`. Unlike the relatively
restricted model catalogues used for STT and TTS, `llama.cpp` supports a broad
range of GGUF-based language models. Therefore, selecting LLM candidates
requires defining a reproducible search space before application-level
screening can be performed.

The purpose of the first-round screening is **not to identify the
best-performing LLM**, but to reduce the large model ecosystem to a manageable
set of technically compatible and application-relevant candidates.

Performance-dependent properties such as generation quality, inference
latency, runtime memory consumption and storage requirements are evaluated
subsequently on real mobile hardware.

## 1. Runtime and Model Format Compatibility

Only models compatible with the inference stack used by LetsVoice Local are
considered.

The deployment stack is:

```text
LetsVoice Local Mobile
        │
        ▼
     llama.rn
        │
        ▼
     llama.cpp
        │
        ▼
   compatible GGUF models
```
