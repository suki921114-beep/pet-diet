import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getReadyDb } from "@/db";
import { userConsents } from "@/db/schema";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export type ConsentKind = "terms" | "privacy";

export async function recordConsent(userId: string, kind: ConsentKind, version: string): Promise<void> {
  const database = await getReadyDb();
  // consentedAt을 명시적으로 밀리초 단위 ISO 8601로 넣는다. 컬럼 기본값(SQL의
  // CURRENT_TIMESTAMP)은 초 단위까지만 기록해서, 같은 1초 안에 두 번 동의를
  // 기록하면(예: 가입 직후 재동의) 두 행의 시각이 똑같아져 "가장 최근 것"을
  // 안정적으로 골라낼 수 없는 문제가 있었다(rate_limit_hits에서 겪은 것과
  // 같은 종류의 버그).
  await database
    .insert(userConsents)
    .values({ id: randomUUID(), userId, kind, version, consentedAt: new Date().toISOString() });
}

// 회원가입 때 둘 다 한 번에 동의를 받으므로(체크박스 하나), 기록도 함께 한다.
export async function recordSignupConsent(userId: string): Promise<void> {
  await recordConsent(userId, "terms", TERMS_VERSION);
  await recordConsent(userId, "privacy", PRIVACY_VERSION);
}

export type ConsentStatus = {
  terms: { version: string; consentedAt: string } | null;
  privacy: { version: string; consentedAt: string } | null;
  upToDate: boolean;
};

// kind별로 가장 최근 동의 행 하나만 가져온다(append-only 로그이므로 "최신"이
// 곧 "현재 상태").
async function latestConsent(userId: string, kind: ConsentKind) {
  const database = await getReadyDb();
  // consentedAt만으로 정렬하면, 같은 1ms 안에(특히 테스트나 매우 빠른 연속
  // 호출에서) 두 행이 완전히 같은 시각을 가질 수 있어 어떤 게 "더 최근"인지
  // 안정적으로 가려낼 수 없다. SQLite가 암묵적으로 관리하는 rowid는 삽입
  // 순서대로 항상 증가하므로, 동시각일 때의 동점을 이걸로 깨뜨린다.
  const [row] = await database
    .select({ version: userConsents.version, consentedAt: userConsents.consentedAt })
    .from(userConsents)
    .where(and(eq(userConsents.userId, userId), eq(userConsents.kind, kind)))
    .orderBy(desc(userConsents.consentedAt), desc(sql`rowid`))
    .limit(1);
  return row ?? null;
}

export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const [terms, privacy] = await Promise.all([
    latestConsent(userId, "terms"),
    latestConsent(userId, "privacy"),
  ]);
  const upToDate = terms?.version === TERMS_VERSION && privacy?.version === PRIVACY_VERSION;
  return { terms, privacy, upToDate };
}
