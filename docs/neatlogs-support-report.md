# Draft Discord support report — 2026-10-10

Prepared for the builder to post if desired. No message has been sent. Identifiers below are shortened for a public channel; full synthetic Doctor trace ID can be provided privately to neatlogs support if requested. No credentials, source, prompt text, or trace transcripts are included.

> ImpactGraph traces are accepted by neatlogs but fail to finalize. A four-span mock tool-calling workflow was **Ready** at about **21:02 UTC, Oct 10**. Two later real-impact workflow entries at about **21:11–21:12 UTC** show **Processing failed, 0 spans** (short IDs `0ee41cf9…7fb6b5` and `9c77a3a0…dec2ce`). The real OpenRouter/tool workflow itself completed locally.
>
> Environment: `neatlogs` TypeScript SDK **1.1.28** (latest published at check), Node **24.13.0**, Doctor v2 schema **2**, OTLP/HTTP protobuf + gzip to the standard `ingest.neatlogs.com` endpoint. Scripts await `init`, `flush`, and `shutdown`; no SDK mask callback or PII-policy override is configured. Local Doctor passes with four valid spans. Two bounded synthetic Doctor probes flushed successfully with **0 dropped spans** but failed exact readback with `TRACE_READBACK_TIMEOUT`: the first reported processing at `pii_redaction`, and the second at `raw_durable` (short ID `96187838…68aae9c`, about **21:18 UTC**). Neither probe included repository data.
>
> Could you inspect the hosted processing failure for these synthetic and workflow traces? Please advise whether this is a pipeline issue or whether a specific SDK field needs adjustment. We can provide the full synthetic trace ID privately if needed.
