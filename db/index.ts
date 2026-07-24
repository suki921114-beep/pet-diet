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
          joined_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
          user_id text
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS household_members_household_email_idx ON household_members (household_id, user_email)`,
        `CREATE TABLE IF NOT EXISTS household_invitations (
          id text PRIMARY KEY NOT NULL,
          household_id text NOT NULL,
          invited_by_user_id text NOT NULL,
          email text NOT NULL,
          role text DEFAULT 'member' NOT NULL,
          token_hash text NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
          expires_at text NOT NULL,
          sent_at text,
          accepted_at text,
          cancelled_at text
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS household_invitations_token_hash_idx ON household_invitations (token_hash)`,
        `CREATE INDEX IF NOT EXISTS household_invitations_household_idx ON household_invitations (household_id)`,
        `CREATE INDEX IF NOT EXISTS household_invitations_email_idx ON household_invitations (email)`,
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
        `CREATE TABLE IF NOT EXISTS user_consents (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          kind text NOT NULL,
          version text NOT NULL,
          consented_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS user_consents_user_kind_idx ON user_consents (user_id, kind)`,
      ],
      "write",
    );
    // users 테이블은 이미 운영 중일 수 있어 CREATE TABLE IF NOT EXISTS로는
    // 새 컬럼이 추가되지 않는다. 기존 행을 건드리지 않는 단순 ADD COLUMN만
    // 사용해 하위 호환을 유지한다(NOT NULL 제약을 바꾸는 테이블 재구축은 하지 않음).
    await addColumnIfMissing(c, `ALTER TABLE users ADD COLUMN email_verified_at text`);
    await addColumnIfMissing(c, `ALTER TABLE users ADD COLUMN deleted_at text`);
    // household_members에 user_id 컬럼을 안전하게 추가한다(이미 있으면
    // addColumnIfMissing이 조용히 건너뜀). 유니크 인덱스는 컬럼이 반드시
    // 존재해야 만들 수 있으므로 컬럼 추가 다음에 실행한다. SQLite UNIQUE
    // 인덱스는 NULL을 서로 다른 값으로 취급해서, 아직 연결 안 된(=NULL)
    // 행이 여러 개 있어도 이 인덱스 생성 자체는 실패하지 않는다.
    await addColumnIfMissing(c, `ALTER TABLE household_members ADD COLUMN user_id text`);
    await c.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS household_members_user_id_idx ON household_members (user_id)`,
    );
    await backfillHouseholdMemberUserIds(c);
  })().catch((error) => {
    // 다음 요청에서 다시 시도할 수 있도록 실패는 캐시하지 않는다.
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return drizzle(c, { schema });
}

// 레거시 마이그레이션: user_id가 비어있는 household_members 행을, 정규화된
// (trim+lowercase) 이메일이 일치하는 users 행에 연결한다. 일치하는 사용자가
// 없거나 이미 탈퇴(anonymize)된 계정이면 조용히 넘어가지 않고 연결하지 않은
// 채로 두며, 그 개수를 경고 로그로 남긴다 — 임의로 삭제/병합하지 않는다.
// 연결되지 않은 행은 이후 모든 권한 검사(requireHousehold*)에서 "유효하지
// 않은 멤버십"으로 취급되어 아무 권한도 얻지 못한다.
async function backfillHouseholdMemberUserIds(c: Client) {
  const pending = await c.execute(
    `SELECT id, user_email FROM household_members WHERE user_id IS NULL`,
  );
  if (pending.rows.length === 0) return;

  let linked = 0;
  for (const row of pending.rows) {
    const memberId = row.id as string;
    const email = String(row.user_email ?? "").trim().toLowerCase();
    if (!email) continue;
    const match = await c.execute({
      sql: `SELECT id FROM users WHERE lower(trim(email)) = ? AND deleted_at IS NULL LIMIT 2`,
      args: [email],
    });
    if (match.rows.length !== 1) continue; // 매칭 없음 또는 모호함 — 연결하지 않음
    const userId = match.rows[0]?.id as string;
    const result = await c.execute({
      sql: `UPDATE household_members SET user_id = ? WHERE id = ? AND user_id IS NULL`,
      args: [userId, memberId],
    });
    if (result.rowsAffected === 1) linked += 1;
  }

  const unlinked = pending.rows.length - linked;
  if (unlinked > 0) {
    console.warn(
      `[db] household_members 마이그레이션: ${pending.rows.length}건 중 ${linked}건 연결, ${unlinked}건 미연결(이메일 불일치 또는 탈퇴 계정). 미연결 행은 가족 권한 검사에서 계속 제외됩니다.`,
    );
  }
}

// 테스트 전용: getReadyDb()는 schemaReady를 프로세스 생애주기 동안 한 번만
// 실행하도록 캐시하므로, 이미 부팅된 뒤에는 다시 호출해도 백필이 재실행되지
// 않는다. 마이그레이션 로직 자체("기존 미연결 행을 나중에 다시 돌려도
// 안전한지")를 검증하려면 이 함수로 직접 재실행할 수 있어야 한다. 프로덕션
// 코드 경로에서는 쓰이지 않는다.
export async function runHouseholdMemberBackfillForTests() {
  await backfillHouseholdMemberUserIds(getClient());
}
