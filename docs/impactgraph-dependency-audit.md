# ImpactGraph dependency audit — 2026-10-10

Commands: `npm audit --json`, `npm audit --omit=dev --json`, `npm ls ... --all`, and read-only `npm view` package metadata. No remediation command was run. The separate `samples/auth-next` installation reported 0 vulnerabilities.

The root audit reports **14 affected package records: 10 moderate and 4 high**. `npm audit --omit=dev` reports the same 14. These packages enter through direct runtime dependency `neatlogs@1.1.28` and its OpenTelemetry exporters, so the findings cannot be dismissed as development-only. This is package exposure, not proof the vulnerable code paths are reachable in ImpactGraph's current trace workflow.

| Severity | Affected packages | Installed chain and fix position |
| --- | --- | --- |
| High | `@opentelemetry/otlp-transformer`, `@opentelemetry/propagator-jaeger`, `@opentelemetry/sdk-trace-node`, `protobufjs` | Transitive through neatlogs. The installed `protobufjs@8.0.1` is under `@opentelemetry/otlp-transformer@0.216.0`; that transformer pins `protobufjs` exactly to `8.0.1`, so a normal compatible lockfile update cannot replace it. |
| Moderate | `@opentelemetry/core`, `@opentelemetry/exporter-logs-otlp-proto`, `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/otlp-exporter-base`, `@opentelemetry/propagator-b3`, `@opentelemetry/resources`, `@opentelemetry/sdk-logs`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`, `neatlogs` | Primarily inherited from vulnerable OpenTelemetry core and related packages. `neatlogs` is flagged because it depends on these packages; the audit does not identify a separate neatlogs advisory. |

The installed graph includes two OpenTelemetry generations: neatlogs directly requires `@opentelemetry/core@^1.30.0` and `@opentelemetry/exporter-logs-otlp-proto@^0.216.0`. The latter pins several `2.7.1`/`0.216.0` packages. Current npm metadata shows fixed newer OpenTelemetry and protobufjs releases, but the pinned transitive versions and neatlogs' 1.x requirements prevent a straightforward compatible upgrade of the whole graph. `npm audit` suggests `neatlogs@1.1.18` for some records and marks it semver-major, even though the installed and latest published version is `1.1.28`; this downgrade is not a verified safe fix. No breaking upgrade or override was applied. Reassess after a neatlogs release with updated telemetry dependencies, or test a targeted override in a separate approved security change.

## High-severity usage review

The four high package records reflect two transitive paths, rather than four independent directly used features:

- `@opentelemetry/sdk-trace-node@1.30.1` inherits the [`@opentelemetry/propagator-jaeger@1.30.1` malformed-header denial-of-service finding](https://github.com/advisories/GHSA-45rx-2jwx-cxfr). The advisory says exploitation requires Jaeger to be the active propagator. ImpactGraph's current CLI tests do not accept HTTP trace headers or configure a Jaeger propagator. Keep Jaeger propagation out of future request handling until the dependency is updated; this reduces reachability but leaves the package finding in the audit.
- `@opentelemetry/otlp-transformer@0.216.0` inherits the nested `protobufjs@8.0.1` findings through the OTLP **log** exporter. Current `neatlogs.init()` calls omit `captureLogs`, whose SDK default is `false`; the trace exporter uses the separate older transformer branch with `protobufjs@7.6.6`. Keep optional log capture off and do not parse untrusted `.proto` schemas while awaiting a fixed upstream dependency. The [protobufjs parser advisory](https://github.com/advisories/GHSA-j3f2-48v5-ccww) identifies untrusted schema parsing as one affected path. This is usage-level risk reduction, not a package fix or proof that all code paths are unreachable.

The installed SDK source constructs the trace exporter with OTLP/HTTP protobuf and gzip. It creates the log exporter only when `captureLogs` is true. No compatible replacement for the pinned `protobufjs@8.0.1` or Jaeger `1.30.1` was verified. Do not use `npm audit fix --force` or untested overrides as an integration repair.
