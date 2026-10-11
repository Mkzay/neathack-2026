# Authentication impact sample

This is a separate, trusted Next.js App Router sample for ImpactGraph. It has no production accounts or secrets. Run `npm install`, `npm test`, `npm run check`, and `npm run build` from this directory.

## Change-impact scenario

Change `src/hooks/useAuth.ts`. The hook is imported by `Header`, `ProfileCard`, and the lazily loaded `SettingsPanel`. The first two are re-exported through `src/components/index.ts`; the root layout and the home/dashboard pages depend on that barrel. The settings page depends on `SettingsPanel` through a literal dynamic import. Next.js also applies the root layout to each page. The analyzer should therefore identify `/`, `/dashboard`, and `/settings` as potentially affected, with explicit dependency paths. This is structural risk, not proof that behavior breaks.

The API route imports `src/lib/services/session.ts`, and the client provider calls `/api/session` at runtime. That fetch is a string URL, not a module import. The analyzer does not infer a code dependency from the hook to the API route.
