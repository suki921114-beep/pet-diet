import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

// 이 프로젝트는 wrangler.jsonc를 쓰지 않아서 `wrangler d1 migrations apply`
// 같은 CLI 마이그레이션 명령을 쓸 수 없다. 대신 첫 요청에서 필요한 테이블을
// 멱등적으로(이미 있으면 건너뛰고) 만들어 로컬/배포 어디서든 별도 수동
// 마이그레이션 없이 동작하게 한다.
let schemaReady: Promise<void> | null = null;

export async function getReadyDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  const database = env.DB;
  schemaReady ??= database
    .batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS households (
        id text PRIMARY KEY NOT NULL,
        invite_code text NOT NULL,
        name text DEFAULT '우리 가족' NOT NULL,
        data text NOT NULL,
        data_version integer DEFAULT 0 NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_by_email text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      database.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS households_invite_code_idx ON households (invite_code)`,
      ),
      database.prepare(`CREATE TABLE IF NOT EXISTS household_members (
        id text PRIMARY KEY NOT NULL,
        household_id text NOT NULL,
        user_email text NOT NULL,
        display_name text,
        role text DEFAULT 'member' NOT NULL,
        joined_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      database.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS household_members_household_email_idx ON household_members (household_id, user_email)`,
      ),
    ])
    .then(() => undefined)
    .catch((error) => {
      // 다음 요청에서 다시 시도할 수 있도록 실패는 캐시하지 않는다.
      schemaReady = null;
      throw error;
    });
  await schemaReady;
  return drizzle(database, { schema });
}
