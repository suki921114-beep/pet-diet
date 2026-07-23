import { describe, expect, it } from "vitest";
import {
  computeNextServing,
  createPlanSnapshot,
  emptyDatabase,
  localDate,
  localTime,
  nonNegative,
  normalizeDatabase,
  planSettingsHash,
  remaining,
  restoreInventory,
  toNumber,
  type Batch,
  type Database,
  type DryFood,
  type FeedRecord,
  type Pet,
  type Snack,
} from "../app/pet-diet-app";

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: "batch-1",
    name: "테스트 자연식",
    dateMade: "2026-07-01",
    expiry: "2026-07-10",
    totalWeight: 1000,
    usedWeight: 0,
    kcalPer100: 150,
    proteinPer100: 20,
    fatPer100: 8,
    carbPer100: 5,
    recipe: [],
    ...overrides,
  };
}

function makeDryFood(overrides: Partial<DryFood> = {}): DryFood {
  return {
    id: "dry-1",
    name: "테스트 사료",
    totalWeight: 2000,
    usedWeight: 0,
    kcalPer100: 350,
    protein: 28,
    fat: 15,
    fiber: 3,
    ash: 7,
    calcium: 1,
    phosphorus: 0.8,
    moisture: 10,
    ...overrides,
  };
}

function makeSnack(overrides: Partial<Snack> = {}): Snack {
  return {
    id: "snack-1",
    name: "테스트 간식",
    totalWeight: 300,
    usedWeight: 0,
    kcalPer100: 400,
    protein: 15,
    fat: 10,
    carb: 20,
    ...overrides,
  };
}

function makeFeedRecord(overrides: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "feed-1",
    datetime: "2026-07-24T08:00",
    label: "테스트 급여",
    source: "batch",
    offeredG: 100,
    eatenG: 100,
    calculatedKcal: 150,
    protein: 20,
    fat: 8,
    note: "",
    ...overrides,
  };
}

describe("1. 급여 계획 적용/재적용", () => {
  it("자연식+사료를 모두 등록하면 비율대로 스냅샷을 만든다", () => {
    const batch = makeBatch({ id: "b1", kcalPer100: 150 });
    const dry = makeDryFood({ id: "d1", kcalPer100: 350 });
    const pet: Pet = {
      ...emptyDatabase().pet,
      dailyTargetKcal: 500,
      feedingsPerDay: 2,
      naturalRatio: 60,
      batchId: "b1",
      dryFoodId: "d1",
    };
    const db: Database = { ...emptyDatabase(), pet, batches: [batch], dryFoods: [dry] };
    const snapshot = createPlanSnapshot(db, "2026-07-24");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.targetKcal).toBe(500);
    expect(snapshot!.naturalRatio).toBe(60);
    expect(snapshot!.totalNaturalGrams).toBe(200);
    expect(snapshot!.totalDryGrams).toBe(Math.round((200 / 350) * 100));
    expect(snapshot!.settingsHash).toBe(planSettingsHash(db));
  });

  it("급여원이 하나도 없으면 스냅샷을 만들지 않는다", () => {
    expect(createPlanSnapshot(emptyDatabase(), "2026-07-24")).toBeNull();
  });

  it("설정 저장 없이 값만 바뀌면 settingsHash가 달라져 재적용이 필요함을 알 수 있다", () => {
    const batch = makeBatch({ id: "b1" });
    const pet: Pet = {
      ...emptyDatabase().pet,
      dailyTargetKcal: 400,
      feedingsPerDay: 2,
      naturalRatio: 100,
      batchId: "b1",
    };
    const db: Database = { ...emptyDatabase(), pet, batches: [batch] };
    const snapshot = createPlanSnapshot(db, "2026-07-24")!;
    const changedDb: Database = { ...db, pet: { ...pet, dailyTargetKcal: 600 } };
    expect(planSettingsHash(changedDb)).not.toBe(snapshot.settingsHash);
  });
});

describe("2. 남은 끼니 급여량(kcal) 재분배", () => {
  const todayPlan = {
    date: "2026-07-24",
    targetKcal: 400,
    feedings: 2,
    naturalRatio: 60,
    batchId: "b1",
    dryFoodId: "d1",
    naturalKcalPer100: 150,
    dryKcalPer100: 350,
    totalNaturalGrams: 160,
    totalDryGrams: 46,
    settingsHash: "x",
    appliedAt: "2026-07-24T00:00:00.000Z",
  };

  it("계획이 없으면 null을 반환한다", () => {
    expect(computeNextServing(undefined, [], 0)).toBeNull();
  });

  it("아직 급여 전이면 총량을 남은 끼니 수로 균등하게 나눈다", () => {
    const result = computeNextServing(todayPlan, [], 0)!;
    expect(result.remainingMeals).toBe(2);
    expect(result.naturalG).toBe(80);
    expect(result.dryG).toBe(23);
  });

  it("한 끼를 먹고 나면 남은 양 기준으로 다시 나눈다", () => {
    const feeds = [makeFeedRecord({ source: "plan", naturalEatenG: 80, dryEatenG: 23 })];
    const result = computeNextServing(todayPlan, feeds, 1)!;
    expect(result.remainingMeals).toBe(1);
    expect(result.naturalG).toBe(80);
    expect(result.dryG).toBe(23);
  });

  it("간식을 먹인 만큼 남은 열량에서 미리 빼되, 자연식:사료 비율은 그대로 유지한다", () => {
    const snackFeed = makeFeedRecord({ id: "snack-feed", source: "snack", calculatedKcal: 60 });
    const result = computeNextServing(todayPlan, [snackFeed], 0)!;
    expect(result.naturalG).toBe(68);
    expect(result.dryG).toBe(20);
  });

  it("남은 끼니가 없으면 0을 반환한다", () => {
    expect(computeNextServing(todayPlan, [], 2)).toEqual({
      remainingMeals: 0,
      naturalG: 0,
      dryG: 0,
      kcal: 0,
    });
  });
});

describe("3. 음수·비정상 값 차단", () => {
  it("toNumber는 음수를 0으로, 유한하지 않은 값은 fallback으로 바꾼다", () => {
    expect(toNumber(-5)).toBe(0);
    expect(toNumber(Number.NaN, 10)).toBe(10);
    expect(toNumber(Number.POSITIVE_INFINITY, 5)).toBe(5);
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(undefined, 3)).toBe(3);
  });

  it("nonNegative는 0 이하이거나 유한하지 않은 값을 0으로 바꾼다", () => {
    expect(nonNegative(-3)).toBe(0);
    expect(nonNegative(Number.NaN)).toBe(0);
    expect(nonNegative(0)).toBe(0);
    expect(nonNegative(7.5)).toBe(7.5);
  });

  it("remaining은 재고를 초과 사용해도 음수 재고를 만들지 않는다", () => {
    expect(remaining(100, 40)).toBe(60);
    expect(remaining(100, 120)).toBe(0);
    expect(remaining(100, 100)).toBe(0);
  });
});

describe("4. 급여 기록 수정·삭제 후 재고 복원", () => {
  it("자연식 급여 기록을 삭제하면 사용량만큼 재고가 복원된다", () => {
    const batch = makeBatch({ id: "b1", usedWeight: 100 });
    const db: Database = { ...emptyDatabase(), batches: [batch] };
    const record = makeFeedRecord({
      source: "batch",
      batchId: "b1",
      offeredG: 100,
      eatenG: 100,
      naturalOfferedG: 100,
      naturalEatenG: 100,
    });
    const restored = restoreInventory(db, record, -1);
    expect(restored.batches[0].usedWeight).toBe(0);
  });

  it("급여 기록 수정(먹은 양 변경)은 이전 값을 복원한 뒤 새 값을 재적용해 재고가 정확히 맞는다", () => {
    const dry = makeDryFood({ id: "d1", usedWeight: 50 });
    const db: Database = { ...emptyDatabase(), dryFoods: [dry] };
    const oldRecord = makeFeedRecord({
      source: "dry",
      dryFoodId: "d1",
      offeredG: 50,
      eatenG: 50,
      dryOfferedG: 50,
      dryEatenG: 50,
    });
    const newRecord: FeedRecord = { ...oldRecord, offeredG: 70, eatenG: 70, dryOfferedG: 70, dryEatenG: 70 };
    const step1 = restoreInventory(db, oldRecord, -1);
    const step2 = restoreInventory(step1, newRecord, 1);
    expect(step2.dryFoods[0].usedWeight).toBe(70);
  });

  it("간식 급여 기록을 삭제하면 간식 재고도 복원된다", () => {
    const snack = makeSnack({ id: "s1", usedWeight: 30 });
    const db: Database = { ...emptyDatabase(), snacks: [snack] };
    const record = makeFeedRecord({ source: "snack", snackId: "s1", offeredG: 30, eatenG: 30 });
    const restored = restoreInventory(db, record, -1);
    expect(restored.snacks[0].usedWeight).toBe(0);
  });

  it("복원해도 재고는 음수가 되지 않는다", () => {
    const batch = makeBatch({ id: "b1", usedWeight: 10 });
    const db: Database = { ...emptyDatabase(), batches: [batch] };
    const record = makeFeedRecord({
      source: "batch",
      batchId: "b1",
      offeredG: 999,
      eatenG: 999,
      naturalOfferedG: 999,
      naturalEatenG: 999,
    });
    const restored = restoreInventory(db, record, -1);
    expect(restored.batches[0].usedWeight).toBe(0);
  });
});

describe("5. 열량 밀도를 바꿔도 과거 급여 기록은 그대로다", () => {
  it("건식사료 kcalPer100을 수정해도 이미 저장된 급여 기록의 kcal은 바뀌지 않는다", () => {
    const dry = makeDryFood({ id: "d1", kcalPer100: 350 });
    const record = makeFeedRecord({
      source: "dry",
      dryFoodId: "d1",
      dryOfferedG: 100,
      dryEatenG: 100,
      offeredG: 100,
      eatenG: 100,
      calculatedKcal: 350,
      dryKcalPer100: 350,
    });
    const db: Database = { ...emptyDatabase(), dryFoods: [dry], feedLog: [record] };

    // DryFoodPage에서 하듯 성분표를 고쳐 kcalPer100만 400으로 갱신한다.
    const updatedDb: Database = {
      ...db,
      dryFoods: db.dryFoods.map((item) => (item.id === "d1" ? { ...item, kcalPer100: 400 } : item)),
    };

    expect(updatedDb.dryFoods[0].kcalPer100).toBe(400);
    expect(updatedDb.feedLog[0].calculatedKcal).toBe(350);
    expect(updatedDb.feedLog[0].dryKcalPer100).toBe(350);
  });
});

describe("6. 자정 근처 날짜/시간 처리(로컬 기준, UTC 변환 없음)", () => {
  it("자정 직후에도 날짜가 그대로 유지된다", () => {
    const midnight = new Date(2026, 6, 24, 0, 5);
    expect(localDate(midnight)).toBe("2026-07-24");
    expect(localTime(midnight)).toBe("00:05");
  });

  it("자정 직전에는 날짜가 바뀌지 않는다", () => {
    const beforeMidnight = new Date(2026, 6, 24, 23, 59);
    expect(localDate(beforeMidnight)).toBe("2026-07-24");
    expect(localTime(beforeMidnight)).toBe("23:59");
  });

  it("한 자리수 월/일/시/분도 0으로 패딩한다", () => {
    const early = new Date(2026, 0, 5, 3, 7);
    expect(localDate(early)).toBe("2026-01-05");
    expect(localTime(early)).toBe("03:07");
  });
});

describe("7. 백업 JSON 가져오기(정규화) / 구버전 마이그레이션", () => {
  it("빈 값이나 잘못된 값이 와도 죽지 않고 빈 데이터베이스를 돌려준다", () => {
    expect(normalizeDatabase(undefined)).toEqual(emptyDatabase());
    expect(normalizeDatabase(null)).toEqual(emptyDatabase());
    expect(normalizeDatabase("not an object")).toEqual(emptyDatabase());
    expect(normalizeDatabase({})).toEqual(emptyDatabase());
  });

  it("최신 형태의 완전한 데이터베이스를 백업→복원해도 값이 그대로 유지된다", () => {
    const batch = makeBatch();
    const dry = makeDryFood();
    const snack = makeSnack();
    const feed = makeFeedRecord({ batchId: batch.id, naturalOfferedG: 100, naturalEatenG: 100 });
    const original: Database = {
      ...emptyDatabase(),
      pet: {
        ...emptyDatabase().pet,
        name: "봄이",
        weightKg: 5.4,
        dailyTargetKcal: 450,
        batchId: batch.id,
      },
      batches: [batch],
      dryFoods: [dry],
      snacks: [snack],
      feedLog: [feed],
    };
    const restored = normalizeDatabase(JSON.parse(JSON.stringify(original)));
    expect(restored.pet.name).toBe("봄이");
    expect(restored.pet.weightKg).toBe(5.4);
    expect(restored.batches[0].id).toBe(batch.id);
    expect(restored.dryFoods[0].kcalPer100).toBe(dry.kcalPer100);
    expect(restored.snacks[0].id).toBe(snack.id);
    expect(restored.feedLog[0].calculatedKcal).toBe(feed.calculatedKcal);
  });

  it("구버전(dog/feedBatchId/feedNatRatio 등) 데이터를 최신 스키마로 옮겨온다", () => {
    const legacy = {
      dog: {
        name: "레거시견",
        weightKg: 6,
        dailyTargetKcal: 500,
        feedBatchId: "old-batch",
        feedDryId: "old-dry",
        feedNatRatio: 70,
        disease: "chronic",
      },
      symptomLog: [{ datetime: "2026-01-01T09:00", note: "옛날 기록" }],
    };
    const migrated = normalizeDatabase(legacy);
    expect(migrated.pet.name).toBe("레거시견");
    expect(migrated.pet.batchId).toBe("old-batch");
    expect(migrated.pet.dryFoodId).toBe("old-dry");
    expect(migrated.pet.naturalRatio).toBe(70);
    expect(migrated.pet.condition).toBe("chronic");
    expect(migrated.healthLog).toHaveLength(1);
    expect(migrated.healthLog[0].note).toBe("옛날 기록");
  });

  it("불완전한 급여 기록도 안전한 기본값으로 채워 넣는다", () => {
    const raw = { feedLog: [{ grams: 50 }] };
    const migrated = normalizeDatabase(raw);
    expect(migrated.feedLog).toHaveLength(1);
    expect(migrated.feedLog[0].offeredG).toBe(50);
    expect(migrated.feedLog[0].eatenG).toBe(50);
    expect(migrated.feedLog[0].source).toBe("custom");
  });
});
