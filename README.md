# Neatlogs TypeScript smoke test

This temporary project sends one OpenRouter model call through the official Neatlogs TypeScript SDK. It uses a local `.env` file and does not belong to the hackathon application.

## Run

1. Copy `.env.example` to `.env` and fill in `NEATLOGS_API_KEY` (Neatlogs **project API key**) and `OPENROUTER_API_KEY`. The `.env` file is ignored by Git. Optionally set `OPENROUTER_MODEL` to a model your OpenRouter account can use; the default is `openai/gpt-4o-mini`.
2. Run `npm install`.
3. Run `npm run check` and `npm run doctor:local` for compile and local SDK checks.
4. Run `npm run doctor:probe` to send a controlled diagnostic trace and verify its finalized readback. This checks Neatlogs delivery independently of the app.
5. Run `npm run test:trace` to make one real model call. Look for workflow `openrouter-smoke-test` in the project's Neatlogs **Traces** tab. A successful process exit only proves the call and SDK flush completed; confirm the resulting trace in Neatlogs before treating this workflow as delivered.

The test uses [Neatlogs' TypeScript SDK](https://docs.neatlogs.com/sdk/typescript) and its [OpenRouter integration](https://docs.neatlogs.com/integrations/openrouter).
