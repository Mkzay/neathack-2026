# ImpactGraph architecture analysis

ImpactGraph indexes local TypeScript and JavaScript dependencies with the TypeScript Compiler API. The sample in [`samples/auth-next`](samples/auth-next/README.md) is a separate Next.js App Router app with an authentication change scenario. The analyzer returns direct and transitive dependents, shortest dependency paths, potentially affected routes, unresolved imports, and analysis limits. It does not infer runtime API calls from string URLs.

## Local web application

1. Run `npm install` and add `OPENROUTER_API_KEY` to the ignored `.env` file. `OPENROUTER_MODEL` defaults to `deepseek/deepseek-v3.2`. Add `NEATLOGS_API_KEY` only if telemetry is wanted; hosted processing has a known unresolved issue.
2. Run `npm run dev` and open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app binds to the loopback interface and accepts only local requests.
3. Explore the graph of the trusted `samples/auth-next` application. Select a file in the explorer or graph to see actual reverse dependency paths and potentially affected routes.
4. Choose **Prepared auth regression** or the sample's **Working sample Git diff**, then click **Investigate changes**. The prepared scenario creates a temporary Git copy; it does not edit the source sample. The live timeline shows actual agent events.
5. For each proposed check, review the exact executable, arguments, and working directory in the approval card. Approve or deny each request separately. The agent can run only reviewed checks, without a shell. Do not use this runner with untrusted repositories.
6. Open **Investigation report** to inspect evidence and check outcomes. Copy or download its Markdown summary. Full local records are saved under ignored `reports/`.

Run `npm run check`, `npm run lint`, `npm run build`, `npm run test:web`, `npm run test:architecture`, and `npm run test:phase2` for validation. The browser uses polling for live events; one investigation can run at a time in the local server process. Reloading the page during a run loses the page's run selection, although the server continues the bounded investigation. The app is local-first and has no login or durable run database.
The 180-second investigation limit measures active analysis and model time; it pauses while a person decides an individual check. The web runner has a separate 10-minute wall-clock limit, including approval waits.

1. Put `OPENROUTER_API_KEY` and `NEATLOGS_API_KEY` in the ignored `.env` file. `OPENROUTER_MODEL` defaults to `deepseek/deepseek-v3.2` and can be overridden there.
2. Run `npm run check`, `npm run test:provider`, and `npm run test:architecture` for local validation. In `samples/auth-next`, run `npm test`, `npm run check`, and `npm run build`.
3. Run `npm run test:real-impact` to make two OpenRouter requests. The model invokes `get_file_impact` for `src/hooks/useAuth.ts`; the tool accepts only paths inside the trusted sample, and the final answer is checked against the analyzer's actual paths.
4. Run `npm run test:tool-calling` to retain the earlier in-memory `get_file_dependencies` regression test.
5. In neatlogs, inspect `impactgraph-real-impact-investigation` for the workflow, two model requests, and one tool execution. A successful export attempt alone does not establish dashboard delivery.

The request timeout is 30 seconds per call and SDK retries are disabled. The integration tests use paid API requests; printed cost is the API-reported value when available. The tool has no shell access.

The non-destructive dependency review is in [`docs/impactgraph-dependency-audit.md`](docs/impactgraph-dependency-audit.md).

## Phase 2 command line investigation

Run `npm run test:phase2` for deterministic Git, verification, and agent tests. Run `npm run investigate -- --scenario=auth-regression` for a real OpenRouter investigation of a temporary Git copy of the trusted sample. The scenario changes the returned display name in `src/lib/services/session.ts`; `auth-unit` should genuinely fail while `typecheck` can still pass. The sample source in this repository is left intact. To inspect your own tracked sample change, use `npm run investigate -- --diff=unstaged`, `--diff=staged`, or `--diff=<commit SHA>`. Untracked sample files do not appear in a Git diff.

The agent may request only the reviewed `auth-unit` and `typecheck` checks. For **every** execution, the CLI prints the exact executable, arguments, and working directory and requires the human to type `YES`; any other answer denies the check. The runner invokes Node without a shell, clears model and telemetry API keys from the child environment, applies timeouts, terminates process trees, and caps and sanitizes output. It is designed for this trusted sample and is **not** a sandbox for untrusted repositories. The agent never edits source files. It has at most eight tool steps, nine model requests, and a 180 second workflow budget. `IMPACTGRAPH_MAX_TOKENS` and `IMPACTGRAPH_MAX_COST_USD` adjust the token and API reported cost limits; the defaults are 24,000 tokens and US$0.10. If the provider omits cost, the model request and token caps remain in force.

The CLI writes a local JSON record and Markdown summary under ignored `reports/`. These distinguish check failure, denial, timeout, and tooling failure. Dependency paths show potential impact; a passing type check does not erase a failing behavior test. When `NEATLOGS_API_KEY` is configured, the workflow emits spans without source content in trace inputs. Hosted trace processing has previously failed even when export succeeded; inspect the dashboard before calling telemetry captured.

## Earlier preparation smoke test

This temporary project sends one OpenRouter model call through the official Neatlogs TypeScript SDK. It uses a local `.env` file and does not belong to the hackathon application.

## Run

1. Copy `.env.example` to `.env` and fill in `NEATLOGS_API_KEY` (Neatlogs **project API key**) and `OPENROUTER_API_KEY`. The `.env` file is ignored by Git. Optionally set `OPENROUTER_MODEL` to a model your OpenRouter account can use; the default is `openai/gpt-4o-mini`.
2. Run `npm install`.
3. Run `npm run check` and `npm run doctor:local` for compile and local SDK checks.
4. Run `npm run doctor:probe` to send a controlled diagnostic trace and verify its finalized readback. This checks Neatlogs delivery independently of the app.
5. Run `npm run test:trace` to make one real model call. Look for workflow `openrouter-smoke-test` in the project's Neatlogs **Traces** tab. A successful process exit only proves the call and SDK flush completed; confirm the resulting trace in Neatlogs before treating this workflow as delivered.

The test uses [Neatlogs' TypeScript SDK](https://docs.neatlogs.com/sdk/typescript) and its [OpenRouter integration](https://docs.neatlogs.com/integrations/openrouter).
