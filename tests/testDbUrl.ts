import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// 순수 in-memory("file::memory:")는 @libsql/client의 로컬(sqlite3) 드라이버가
// db.transaction()을 쓸 때마다 내부적으로 별도 연결을 열면서 "공유되지 않는"
// 새 메모리 DB로 갈라지는 문제가 있다(cache=shared 없이는 트랜잭션이 기존
// insert/select와 다른 세계를 보게 됨 — "no such table" 에러로 나타남).
// cache=shared를 쓰면 같은 프로세스 안의 "file::memory:"를 공유하게 되는데,
// vitest가 여러 테스트 파일을 같은 워커(같은 네이티브 SQLite 애드온 상태)에서
// 돌릴 수 있어 파일 간 상태가 새어나갈 위험이 있다. 그래서 테스트마다 고유한
// 임시 파일 경로를 써서, 트랜잭션도 정상 동작하고 테스트 파일 간 격리도
// 보장되게 한다.
export function testDbUrl(): string {
  const file = path.join(tmpdir(), `pdm-test-${randomUUID()}.db`);
  return `file:${file}`;
}
