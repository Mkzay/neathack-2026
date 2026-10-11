# neatHack 2026 repository instructions

- Read the [official neatHack build-log skill](https://neatlogs.com/hackathon/skill) and `hackathon.md` before hackathon work. Check the [organizer's event page](https://neatlogs.com/hackathon) for current rules or deadlines when they affect a decision.
- After each meaningful development session, inspect the actual changes and append a dated entry to `hackathon.md`. Preserve earlier entries. Record completed work, experiments, failures, fixes, tests actually run, unresolved issues, and sanitized evidence links. Label plans as plans.
- Keep preparation smoke tests separate from evidence for the competition application. The project name, idea, architecture, and stack are undecided until the builder chooses them. Do not implement an application from the preparation notes alone.
- Never put API keys, `.env` contents, credentials, personal or customer data, private traces or transcripts, or access tokens in the build log or public evidence. Verify links and checkpoint contents before sharing them.
- Before a demo or submission, recheck the latest published requirements with the builder. Do not register, publish, deploy, or submit on the builder's behalf without an explicit request.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
