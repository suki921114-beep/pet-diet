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

export async function getReadyDb() {
  const c = getClient();
  schemaReady ??= c
    .batch(
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
      ],
      "write",
    )
    .then(() => undefined)
    .catch((error) => {
      // 다음 요청에서 다시 시도할 수 있도록 실패는 캐시하지 않는다.
      schemaReady = null;
      throw error;
    });
  await schemaReady;
  return drizzle(c, { schema });
}
