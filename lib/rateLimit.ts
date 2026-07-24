import { randomUUID } from "node:crypto";
import { and, count, gt, eq } from "drizzle-orm";
import { getReadyDb } from "@/db";
import { rateLimitHits } from "@/db/schema";

// 서버리스 환경에서는 인스턴스가 여러 개 뜰 수 있어 인메모리 카운터로는
// 정확한 요청 제한이 안 된다. 대신 이미 쓰고 있는 Turso(공유 DB)에 히트
// 기록을 남기고 개수를 세는 아주 단순한 방식을 쓴다. 트래픽이 크지 않은
// 개인용 앱 규모에서는 이 정도로 충분하고, 새 인프라(Redis 등)를 추가하지
// 않아도 된다.
export async function checkRateLimit(
  key: string,
  options: { max: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number }> {
  const database = await getReadyDb();
  const windowStart = new Date(Date.now() - options.windowMs).toISOString();

  const [{ value: hits }] = await database
    .select({ value: count() })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.createdAt, windowStart)));

  if (hits >= options.max) {
    return { allowed: false, remaining: 0 };
  }

  // createdAt을 명시적으로 ISO 8601로 넣는다. 컬럼 기본값(SQL의
  // CURRENT_TIMESTAMP)은 "2026-07-24 20:09:20"처럼 공백으로 구분된 형식이라,
  // windowStart(new Date().toISOString(), "T"/"Z" 포함)와 문자열 비교하면
  // 항상 크다(">")고 나와야 할 값이 오히려 항상 작게 취급되어 gt() 비교가
  // 사실상 항상 false가 되는(=속도 제한이 조용히 무력화되는) 버그가 있었다.
  await database.insert(rateLimitHits).values({ id: randomUUID(), key, createdAt: new Date().toISOString() });
  return { allowed: true, remaining: Math.max(0, options.max - hits - 1) };
}

export function rateLimitMessage() {
  return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
}

// Vercel 등 프록시 뒤에서는 x-forwarded-for의 첫 번째 값이 실제 클라이언트 IP다.
// 값이 없으면(로컬 개발 등) 요청을 한 그룹으로 묶어 취급한다.
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
