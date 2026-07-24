import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 이메일+비밀번호 또는 Google로 로그인하는 개인 계정.
// password_hash는 컬럼 자체는 NOT NULL로 유지하되(운영 중인 SQLite 테이블의
// 제약을 바꾸는 위험한 재구축을 피하기 위해), Google 전용 계정처럼 비밀번호가
// 없는 경우 빈 문자열("")을 저장해 "비밀번호 없음"을 의미하는 값으로 쓴다.
// (lib/auth.ts의 hasPassword() 참고. 절대 빈 문자열이 비밀번호로 통과되지 않도록
// verifyPassword 쪽에서도 별도로 막는다.)
// email_verified_at / deleted_at은 나중에 ALTER TABLE로 추가된 컬럼이라 여기
// 선언과 db/index.ts의 부트스트랩 SQL(마이그레이션) 둘 다 맞춰뒀다.
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    emailVerifiedAt: text("email_verified_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

// 사용자 한 명에게 연결된 로그인 수단(이메일+비밀번호, Google 등) 목록.
// "로그인 수단이 최소 1개는 남아야 연결 해제 가능" 같은 규칙을 이 테이블의
// 행 개수로 판단한다. provider="password"는 회원가입 시 항상 함께 만들어지고,
// providerSubject는 password의 경우 null, google의 경우 Google의 sub(고유 식별자).
export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(), // "password" | "google"
    providerSubject: text("provider_subject"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_subject_idx").on(table.provider, table.providerSubject),
    uniqueIndex("auth_accounts_user_provider_idx").on(table.userId, table.provider),
  ],
);

// 서버가 실제로 세션을 소유·폐기할 수 있게 하는 테이블. 쿠키에는 이 테이블의
// 어떤 행도 역산할 수 없는 무작위 원본 토큰만 담고, DB에는 그 토큰의
// SHA-256 해시만 저장한다(원본 토큰은 DB에도 로그에도 남기지 않는다).
export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("auth_sessions_token_hash_idx").on(table.tokenHash)],
);

// 이메일 인증·비밀번호 재설정처럼 "이메일로 받은 링크 하나로 한 번만" 쓰는
// 토큰. 원본 토큰은 이메일 본문에만 담기고 DB에는 해시만 남는다.
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").notNull(), // "email_verify" | "password_reset"
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("auth_tokens_token_hash_idx").on(table.tokenHash)],
);

// 가입·로그인·재전송·비밀번호 재설정 요청 속도 제한을 DB로 구현하기 위한
// 아주 단순한 히트 로그. 서버리스 환경에서 인스턴스가 여러 개 떠도(인메모리
// 카운터와 달리) 공유 DB 기준으로 정확히 세어진다.
export const rateLimitHits = sqliteTable("rate_limit_hits", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// 약관/개인정보처리방침 동의 기록. 덮어쓰지 않고 매번 새 행을 추가하는
// append-only 로그다 — "언제, 어떤 버전에" 동의했는지 이력이 통째로 남아야
// 하고(생애주기 추적, 감사 대응), 최신 상태는 kind별로 가장 최근 행을 보면 된다.
export const userConsents = sqliteTable(
  "user_consents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(), // "terms" | "privacy"
    version: text("version").notNull(),
    consentedAt: text("consented_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("user_consents_user_kind_idx").on(table.userId, table.kind)],
);

// 가족(household) 하나가 반려동물 데이터 한 벌을 공유한다.
// 클라이언트가 쓰던 단일 JSON(Database) 구조를 그대로 data 컬럼에 저장해서
// 기존 로컬 저장 로직과의 변환 비용 없이 서버 동기화만 얹는 방식.
export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    inviteCode: text("invite_code").notNull(),
    name: text("name").notNull().default("우리 가족"),
    data: text("data").notNull(),
    // 폴링 중 뒤늦게 도착한 오래된 저장 요청이 최신 데이터를 덮어쓰지 않도록
    // 저장할 때마다 1씩 증가시키고, 클라이언트는 자신이 마지막으로 읽은
    // 버전과 다를 때만 서버 값을 반영한다.
    dataVersion: integer("data_version").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedByEmail: text("updated_by_email"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("households_invite_code_idx").on(table.inviteCode)],
);

// userEmail은 표시/레거시 호환용으로만 남겨두고, 권한 판단은 항상 userId로만
// 한다(아래 _lib.ts의 requireHousehold* 헬퍼들 참고). userId는 컬럼 자체는
// nullable이지만(운영 중인 테이블에 안전하게 ALTER TABLE로 추가하기 위해),
// 애플리케이션은 userId가 없는 행을 "아직 연결되지 않은/유효하지 않은 멤버십"
// 으로 취급해 어떤 권한 검사도 통과시키지 않는다 — 조용히 이메일로 폴백하지 않는다.
// 유니크 인덱스는 "사용자 한 명은 항상 최대 하나의 가족에만 속한다" 정책을
// DB 수준에서도 강제한다(SQLite UNIQUE 인덱스는 NULL끼리는 서로 다르다고
// 취급하므로, 아직 연결되지 않은 여러 행이 있어도 막히지 않는다).
export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull(),
    userEmail: text("user_email").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("member"), // "owner" | "member"
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    userId: text("user_id"),
  },
  (table) => [
    uniqueIndex("household_members_household_email_idx").on(
      table.householdId,
      table.userEmail,
    ),
    uniqueIndex("household_members_user_id_idx").on(table.userId),
  ],
);

// 이메일 기반 초대. role은 이번 단계에서 항상 "member"로 고정한다(owner
// 초대는 소유권 이전으로만 가능). 원본 토큰은 절대 저장하지 않고 해시만
// 저장한다.
export const householdInvitations = sqliteTable(
  "household_invitations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull(),
    email: text("email").notNull(), // 정규화(trim+lowercase)된 초대 대상 이메일
    role: text("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    sentAt: text("sent_at"), // 이메일 발송에 실제로 성공한 시각(성공 전에는 수락 불가)
    acceptedAt: text("accepted_at"),
    cancelledAt: text("cancelled_at"), // 취소되거나(재발송 등으로), 발송 실패로 무효화된 경우
  },
  (table) => [
    uniqueIndex("household_invitations_token_hash_idx").on(table.tokenHash),
    index("household_invitations_household_idx").on(table.householdId),
    index("household_invitations_email_idx").on(table.email),
  ],
);
