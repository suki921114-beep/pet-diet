// `db/index.ts` reads bindings via `import { env } from "cloudflare:workers"`,
// which is typed as `Cloudflare.Env`. @cloudflare/workers-types ships that
// interface empty on purpose so each project augments it with its own
// bindings. This project doesn't generate a wrangler `worker-configuration.d.ts`
// (see README: "does not use wrangler.jsonc"), so we declare it by hand here,
// matching the bindings configured in `vite.config.ts` / `.openai/hosting.json`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
