import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function requireEnv(name: string): string {
  // Vercel 환경변수 입력창에 값을 붙여넣을 때 앞뒤 공백/줄바꿈이 함께
  // 들어가는 실수가 흔해서(특히 토큰류), 항상 trim해서 사용한다.
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} 환경변수가 없어요. Vercel 프로젝트 설정(또는 로컬의 .env.local)에 Turso 데이터베이스 접속 정보를 추가해주세요.`,
    );
  }
  return value;
}

let client: Client | null = null;

function getClient(): Client {
  client ??= createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
  });
  return client;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}

// 이 프로젝트는 별도 마이그레이션 실행 단계를 두지 않는다. 대신 첫 요청에서
// 필요한 테이블을 멱등적으로(이미 있으면 건너뛰고) 만들어 로컬/배포 어디서든
// 수동 마이그레이션 명령 없이 바로 동작하게 한다.
let schemaReady: Promise<void> | null = null;

// SQLite는 "컬럼이 없으면 추가"를 지원하지 않아서(ADD COLUMN IF NOT EXISTS 없음),
// 이미 있는 컬럼에 다시 추가를 시도하면 "duplicate column name" 에러가 난다.
// 그 에러만 무시하고 그 외 에러는 그대로 던져서, 여러 번 배포해도 안전하게
// 재실행 가능한 마이그레이션이 되도록 한다.
async function addColumnIfMissing(c: Client, sqlText: string) {
  try {
    await c.execute(sqlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) throw error;
  }
}

export async function getReadyDb() {
  const c = getClient();
  schemaReady ??= (async () => {
    await c.batch(
      [
        `CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY NOT NULL,
          email text NOT NULL,
          password_hash text NOT NULL,
          display_name text,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
        `CREATE TABLE IF NOT EXISTS households (
          id text PRIMARY KEY NOT NULL,
          invite_code text NOT NULL,
          name text DEFAULT '우리 가족' NOT NULL,
          data text NOT NULL,
          data_version integer DEFAULT 0 NOT NULL,
          updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_by_email text,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS households_invite_code_idx ON households (invite_code)`,
        `CREATE TABLE IF NOT EXISTS household_members (
          id text PRIMARY KEY NOT NULL,
          household_id text NOT NULL,
          user_email text NOT NULL,
          display_name text,
          role text DEFAULT 'member' NOT NULL,
          joined_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS household_members_household_email_idx ON household_members (household_id, user_email)`,
        `CREATE TABLE IF NOT EXISTS auth_accounts (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          provider text NOT NULL,
          provider_subject text,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_provider_subject_idx ON auth_accounts (provider, provider_subject)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_user_provider_idx ON auth_accounts (user_id, provider)`,
        `CREATE TABLE IF NOT EXISTS auth_sessions (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          token_hash text NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
          expires_at text NOT NULL,
          revoked_at text
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions (token_hash)`,
        `CREATE TABLE IF NOT EXISTS auth_tokens (
          id text PRIMARY KEY NOT NULL,
          purpose text NOT NULL,
          token_hash text NOT NULL,
          user_id text NOT NULL,
          email text NOT NULL,
          expires_at text NOT NULL,
          used_at text,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_token_hash_idx ON auth_tokens (token_hash)`,
        `CREATE TABLE IF NOT EXISTS rate_limit_hits (
          id text PRIMARY KEY NOT NULL,
          key text NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
      ],
      "write",
    );
    // users 테이블은 이미 운영 중일 수 있어 CREATE TABLE IF NOT EXISTS로는
    // 새 컬럼이 추가되지 않는다. 기존 행을 건드리지 않는 단순 ADD COLUMN만
    // 사용해 하위 호환을 유지한다(NOT NULL 제약을 바꾸는 테이블 재구축은 하지 않음).
    await addColumnIfMissing(c, `ALTER TABLE users ADD COLUMN email_verified_at text`);
    await addColumnIfMissing(c, `ALTER TABLE users ADD COLUMN deleted_at text`);
  })().catch((error) => {
    // 다음 요청에서 다시 시도할 수 있도록 실패는 캐시하지 않는다.
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return drizzle(c, { schema });
}
