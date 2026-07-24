import { describe, expect, it } from "vitest";
import {
  applyMedicationDose,
  buildMedicationLog,
  buildPetView,
  buildPlannedMealRecord,
  buildQuickHealthNote,
  cascadeDeletePet,
  computeNextServing,
  createPlanSnapshot,
  dayKcalAndTarget,
  emptyPet,
  feedStatus,
  isValidStockPerDose,
  localDate,
  localTime,
  nonNegative,
  normalizeDatabase,
  planMealCounts,
  planSettingsHash,
  remaining,
  restoreInventory,
  roundTo,
  toNumber,
  type Batch,
  type Database,
  type DryFood,
  type FeedRecord,
  type HealthRecord,
  type MedicationLog,
  type Pet,
  type PetView,
  type Snack,
} from "../app/pet-diet-app";

function makePet(overrides: Partial<Pet> = {}): Pet {
  return { ...emptyPet("pet-1"), ...overrides };
}

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: "batch-1",
    petId: "pet-1",
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
    petId: "pet-1",
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
    petId: "pet-1",
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
    petId: "pet-1",
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

function makeHealthRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return {
    id: "health-1",
    petId: "pet-1",
    datetime: "2026-07-24T09:00",
    weightKg: null,
    bcs: null,
    appetite: "normal",
    vomitCount: 0,
    stool: null,
    vitality: "normal",
    pain: false,
    note: "",
    ...overrides,
  };
}

function makeMedLog(overrides: Partial<MedicationLog> = {}): MedicationLog {
  return {
    id: "medlog-1",
    petId: "pet-1",
    medicationId: "med-1",
    datetime: "2026-07-24T09:00",
    stockUsed: 1,
    ...overrides,
  };
}

// v4 PetView(단일 반려동물 화면 시점) 기본값. createPlanSnapshot/planSettingsHash
// 같이 PetView를 받는 함수를 테스트할 때 쓴다.
function makeView(overrides: Partial<PetView> = {}): PetView {
  return {
    schemaVersion: 4,
    pet: makePet(),
    batches: [],
    dryFoods: [],
    snacks: [],
    medications: [],
    feedLog: [],
    medLog: [],
    healthLog: [],
    dailyPlans: {},
    ...overrides,
  };
}

// v4 Database(항상 저장·동기화되는 전체 멀티펫 데이터) 기본값.
function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    schemaVersion: 4,
    pets: [makePet()],
    batches: [],
    dryFoods: [],
    snacks: [],
    medications: [],
    feedLog: [],
    medLog: [],
    healthLog: [],
    dailyPlans: {},
    ...overrides,
  };
}

describe("1. 급여 계획 적용/재적용", () => {
  it("자연식+사료를 모두 등록하면 비율대로 스냅샷을 만든다", () => {
    const batch = makeBatch({ id: "b1", kcalPer100: 150 });
    const dry = makeDryFood({ id: "d1", kcalPer100: 350 });
    const pet = makePet({
      dailyTargetKcal: 500,
      feedingsPerDay: 2,
      naturalRatio: 60,
      batchId: "b1",
      dryFoodId: "d1",
    });
    const view = makeView({ pet, batches: [batch], dryFoods: [dry] });
    const snapshot = createPlanSnapshot(view, "2026-07-24");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.targetKcal).toBe(500);
    expect(snapshot!.naturalRatio).toBe(60);
    expect(snapshot!.totalNaturalGrams).toBe(200);
    expect(snapshot!.totalDryGrams).toBe(Math.round((200 / 350) * 100));
    expect(snapshot!.settingsHash).toBe(planSettingsHash(view));
  });

  it("급여원이 하나도 없으면 스냅샷을 만들지 않는다", () => {
    expect(createPlanSnapshot(makeView(), "2026-07-24")).toBeNull();
  });

  it("설정 저장 없이 값만 바뀌면 settingsHash가 달라져 재적용이 필요함을 알 수 있다", () => {
    const batch = makeBatch({ id: "b1" });
    const pet = makePet({ dailyTargetKcal: 400, feedingsPerDay: 2, naturalRatio: 100, batchId: "b1" });
    const view = makeView({ pet, batches: [batch] });
    const snapshot = createPlanSnapshot(view, "2026-07-24")!;
    const changedView = { ...view, pet: { ...pet, dailyTargetKcal: 600 } };
    expect(planSettingsHash(changedView)).not.toBe(snapshot.settingsHash);
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

describe("3-1. 0g 섭취 기록은 '완료'로 오해되지 않아야 한다", () => {
  it("먹은 양이 0이면 '먹지 않음'이다", () => {
    expect(feedStatus(makeFeedRecord({ offeredG: 100, eatenG: 0 }))).toBe("none");
  });

  it("먹은 양이 목표량보다 적으면 '일부 섭취'다", () => {
    expect(feedStatus(makeFeedRecord({ offeredG: 100, eatenG: 40 }))).toBe("partial");
  });

  it("먹은 양이 목표량 이상이면 '섭취 완료'다(더 먹었어도 완료)", () => {
    expect(feedStatus(makeFeedRecord({ offeredG: 100, eatenG: 100 }))).toBe("eaten");
    expect(feedStatus(makeFeedRecord({ offeredG: 100, eatenG: 130 }))).toBe("eaten");
  });
});

describe("4. 급여 기록 수정·삭제 후 재고 복원", () => {
  it("자연식 급여 기록을 삭제하면 사용량만큼 재고가 복원된다", () => {
    const batch = makeBatch({ id: "b1", usedWeight: 100 });
    const db = makeDb({ batches: [batch] });
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
    const db = makeDb({ dryFoods: [dry] });
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
    const db = makeDb({ snacks: [snack] });
    const record = makeFeedRecord({ source: "snack", snackId: "s1", offeredG: 30, eatenG: 30 });
    const restored = restoreInventory(db, record, -1);
    expect(restored.snacks[0].usedWeight).toBe(0);
  });

  it("복원해도 재고는 음수가 되지 않는다", () => {
    const batch = makeBatch({ id: "b1", usedWeight: 10 });
    const db = makeDb({ batches: [batch] });
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
    const db = makeDb({ dryFoods: [dry], feedLog: [record] });

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
  it("빈 값이나 잘못된 값이 와도 죽지 않고 빈 데이터베이스와 같은 모양을 돌려준다", () => {
    // emptyDatabase()는 반려동물 id를 매번 새로 만들기 때문에(uid()가
    // 랜덤이라 두 번 호출한 결과가 서로 다름) 두 번째 emptyDatabase() 호출
    // 결과와 deep-equal 비교를 하면 안 된다. 필드 단위로 "빈 상태"인지만 검증한다.
    for (const raw of [undefined, null, "not an object", {}]) {
      const result = normalizeDatabase(raw);
      expect(result.schemaVersion).toBe(4);
      expect(result.pets).toHaveLength(1);
      expect(result.pets[0].name).toBe("");
      expect(result.pets[0].id).toEqual(expect.any(String));
      expect(result.batches).toEqual([]);
      expect(result.dryFoods).toEqual([]);
      expect(result.snacks).toEqual([]);
      expect(result.medications).toEqual([]);
      expect(result.feedLog).toEqual([]);
      expect(result.medLog).toEqual([]);
      expect(result.healthLog).toEqual([]);
      expect(result.dailyPlans).toEqual({});
    }
  });

  it("최신 형태의 완전한 데이터베이스를 백업→복원해도 값이 그대로 유지된다", () => {
    const batch = makeBatch();
    const dry = makeDryFood();
    const snack = makeSnack();
    const feed = makeFeedRecord({ batchId: batch.id, naturalOfferedG: 100, naturalEatenG: 100 });
    const pet = makePet({ name: "봄이", weightKg: 5.4, dailyTargetKcal: 450, batchId: batch.id });
    const original = makeDb({
      pets: [pet],
      batches: [batch],
      dryFoods: [dry],
      snacks: [snack],
      feedLog: [feed],
    });
    const restored = normalizeDatabase(JSON.parse(JSON.stringify(original)));
    expect(restored.pets[0].name).toBe("봄이");
    expect(restored.pets[0].weightKg).toBe(5.4);
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
    expect(migrated.pets[0].name).toBe("레거시견");
    expect(migrated.pets[0].batchId).toBe("old-batch");
    expect(migrated.pets[0].dryFoodId).toBe("old-dry");
    expect(migrated.pets[0].naturalRatio).toBe(70);
    expect(migrated.pets[0].condition).toBe("chronic");
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

  it("백업 데이터의 1회당 차감량이 0·음수여도 정규화 후에는 항상 0보다 크다", () => {
    const raw = {
      medications: [
        { name: "구버전약1", type: "med", stockPerDose: 0 },
        { name: "구버전약2", type: "med", stockPerDose: -5 },
      ],
    };
    const migrated = normalizeDatabase(raw);
    for (const med of migrated.medications) {
      expect(med.stockPerDose).toBeGreaterThan(0);
    }
  });
});

describe("8. 약·영양제 1회당 차감량은 0보다 커야 한다", () => {
  it("0·음수·빈 값·NaN·Infinity는 모두 무효하다", () => {
    expect(isValidStockPerDose(0)).toBe(false);
    expect(isValidStockPerDose(-1)).toBe(false);
    expect(isValidStockPerDose("")).toBe(false);
    expect(isValidStockPerDose(null)).toBe(false);
    expect(isValidStockPerDose(undefined)).toBe(false);
    expect(isValidStockPerDose(Number.NaN)).toBe(false);
    expect(isValidStockPerDose(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("0.2·0.25·0.5·1·1.5처럼 유효한 소수점 값은 모두 저장 가능하다", () => {
    expect(isValidStockPerDose("0.2")).toBe(true);
    expect(isValidStockPerDose("0.25")).toBe(true);
    expect(isValidStockPerDose("0.5")).toBe(true);
    expect(isValidStockPerDose("1")).toBe(true);
    expect(isValidStockPerDose("1.5")).toBe(true);
  });

  it("재고 10, 1회당 차감량 0.2인 영양제를 1회 급여 완료하면 재고가 정확히 9.8이 된다(부동소수점 오차 없음)", () => {
    expect(applyMedicationDose(10, 0.2)).toBe(9.8);
    // 여러 번 반복해도 오차 없이 정확한 값을 유지한다.
    let stock = 10;
    stock = applyMedicationDose(stock, 0.2);
    stock = applyMedicationDose(stock, 0.2);
    stock = applyMedicationDose(stock, 0.2);
    expect(stock).toBe(9.4);
  });

  it("roundTo는 부동소수점 노이즈를 지정한 소수 자릿수로 정리한다", () => {
    expect(roundTo(9.799999999999999, 2)).toBe(9.8);
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe("9. 사용자 지정 시나리오 검증", () => {
  it("시나리오1: 재고 10, 1회당 차감량 0.2 → 1회 완료 시 재고 9.8", () => {
    expect(applyMedicationDose(10, 0.2)).toBe(9.8);
  });

  it("시나리오3: 유효한 소수점 차감량 0.2·0.25·0.5가 모두 저장된다", () => {
    expect(isValidStockPerDose(0.2)).toBe(true);
    expect(isValidStockPerDose(0.25)).toBe(true);
    expect(isValidStockPerDose(0.5)).toBe(true);
  });

  it("시나리오4: 목표량 13g·급여량 0g 기록은 섭취 열량 0, 재고는 목표량(13g) 기준으로 차감한다", () => {
    const batch = makeBatch({ id: "b1", usedWeight: 0 });
    const db = makeDb({ batches: [batch] });
    const record = makeFeedRecord({
      source: "batch",
      batchId: "b1",
      offeredG: 13,
      eatenG: 0,
      naturalOfferedG: 13,
      naturalEatenG: 0,
      calculatedKcal: 0,
    });
    const applied = restoreInventory(db, record, 1);
    expect(applied.batches[0].usedWeight).toBe(13);
    expect(record.calculatedKcal).toBe(0);
  });

  it("시나리오5: 급여량 0g 기록은 '먹지 않음' 상태이고, 계획 급여 집계는 시도 1회·섭취 0회로 분리된다", () => {
    const record = makeFeedRecord({ source: "plan", offeredG: 13, eatenG: 0 });
    expect(feedStatus(record)).toBe("none");
    const counts = planMealCounts([record]);
    expect(counts.attempted).toBe(1);
    expect(counts.eaten).toBe(0);
  });

  it("시나리오6: 자연식 비율이 0%(사료만 사용)인 계획은 다음 급여의 자연식 그램수가 0이다", () => {
    const dryOnlyPlan = {
      date: "2026-07-24",
      targetKcal: 400,
      feedings: 2,
      naturalRatio: 0,
      batchId: "",
      dryFoodId: "d1",
      naturalKcalPer100: 0,
      dryKcalPer100: 350,
      totalNaturalGrams: 0,
      totalDryGrams: 114,
      settingsHash: "x",
      appliedAt: "2026-07-24T00:00:00.000Z",
    };
    const result = computeNextServing(dryOnlyPlan, [], 0)!;
    expect(result.naturalG).toBe(0);
    expect(result.dryG).toBeGreaterThan(0);
  });

  it("시나리오7: 기존 데이터 백업·복원은 여전히 값을 그대로 유지한다", () => {
    const original = makeDb({ pets: [makePet({ name: "봄이", dailyTargetKcal: 400 })] });
    const restored = normalizeDatabase(JSON.parse(JSON.stringify(original)));
    expect(restored.pets[0].name).toBe("봄이");
    expect(restored.pets[0].dailyTargetKcal).toBe(400);
  });
});

// 4단계: 다견 지원 — 데이터 마이그레이션 + petId 격리 + 삭제 + 백업 왕복 + 가족 동기화 회귀
describe("10. 4단계: v3(단일 반려동물) → v4(다견) 마이그레이션", () => {
  it("(1) 구버전 단일 반려동물 백업을 새 다견 구조로 마이그레이션한다", () => {
    const legacy = {
      dog: { name: "봄이", weightKg: 5.4, dailyTargetKcal: 450 },
    };
    const migrated = normalizeDatabase(legacy);
    expect(migrated.schemaVersion).toBe(4);
    expect(Array.isArray(migrated.pets)).toBe(true);
    expect(migrated.pets).toHaveLength(1);
    expect(migrated.pets[0].name).toBe("봄이");
  });

  it("(2) 마이그레이션 시 기존 기록(자연식/사료/간식/급여/복약/건강) 전체가 새로 생성된 반려동물의 petId를 갖는다", () => {
    const legacy = {
      dog: { name: "봄이", batchId: "b1", dryFoodId: "d1" },
      batches: [{ id: "b1", name: "자연식", totalWeight: 1000, usedWeight: 0, kcalPer100: 150 }],
      dryFoods: [{ id: "d1", name: "사료", totalWeight: 2000, usedWeight: 0, kcalPer100: 350 }],
      snacks: [{ id: "s1", name: "간식", totalWeight: 300, usedWeight: 0, kcalPer100: 400 }],
      medications: [{ id: "m1", name: "영양제", type: "supplement", stockPerDose: 1 }],
      feedLog: [{ id: "f1", batchId: "b1", offeredG: 100, eatenG: 100 }],
      medLog: [{ id: "ml1", medicationId: "m1", stockUsed: 1 }],
      symptomLog: [{ id: "h1", note: "괜찮음" }],
    };
    const migrated = normalizeDatabase(legacy);
    const petId = migrated.pets[0].id;
    expect(petId).toEqual(expect.any(String));
    expect(migrated.batches.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.dryFoods.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.snacks.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.medications.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.feedLog.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.medLog.every((item) => item.petId === petId)).toBe(true);
    expect(migrated.healthLog.every((item) => item.petId === petId)).toBe(true);
  });

  it("(3) 이미 마이그레이션된(v4) 데이터를 다시 정규화해도 반려동물/기록이 중복되지 않는다(멱등성)", () => {
    const legacy = { dog: { name: "봄이" }, feedLog: [{ id: "f1", offeredG: 50, eatenG: 50 }] };
    const once = normalizeDatabase(legacy);
    const roundTripped = JSON.parse(JSON.stringify(once));
    const twice = normalizeDatabase(roundTripped);
    const thrice = normalizeDatabase(JSON.parse(JSON.stringify(twice)));

    expect(twice.pets).toHaveLength(1);
    expect(twice.pets[0].id).toBe(once.pets[0].id);
    expect(twice.feedLog).toHaveLength(1);
    expect(twice.feedLog[0].id).toBe(once.feedLog[0].id);
    expect(twice.feedLog[0].petId).toBe(once.feedLog[0].petId);

    expect(thrice.pets).toHaveLength(1);
    expect(thrice.pets[0].id).toBe(once.pets[0].id);
    expect(thrice.feedLog).toHaveLength(1);
  });

  it("(10) 기존 v3 백업 파일(dog/symptomLog 등 구버전 필드)도 계속 정상적으로 가져올 수 있다", () => {
    const legacyBackupFile = {
      dog: {
        name: "레거시견",
        weightKg: 6,
        dailyTargetKcal: 500,
        feedBatchId: "old-batch",
        feedNatRatio: 70,
      },
      batches: [{ id: "old-batch", name: "구버전 자연식", totalWeight: 500, usedWeight: 0, kcalPer100: 140 }],
      symptomLog: [{ datetime: "2026-01-01T09:00", note: "옛날 기록" }],
    };
    const migrated = normalizeDatabase(JSON.parse(JSON.stringify(legacyBackupFile)));
    expect(migrated.pets).toHaveLength(1);
    expect(migrated.pets[0].name).toBe("레거시견");
    expect(migrated.pets[0].batchId).toBe("old-batch");
    expect(migrated.batches[0].petId).toBe(migrated.pets[0].id);
    expect(migrated.healthLog[0].petId).toBe(migrated.pets[0].id);
  });

  it("(11) 새 형식(v4, 다견)으로 내보낸 백업을 다시 가져와도 반려동물 수·기록·petId가 완전히 보존된다(왕복 검증)", () => {
    const petA = makePet({ id: "pet-a", name: "봄이" });
    const petB = makePet({ id: "pet-b", name: "구름이" });
    const original = makeDb({
      pets: [petA, petB],
      batches: [makeBatch({ id: "ba", petId: "pet-a" }), makeBatch({ id: "bb", petId: "pet-b" })],
      feedLog: [
        makeFeedRecord({ id: "fa", petId: "pet-a" }),
        makeFeedRecord({ id: "fb", petId: "pet-b" }),
      ],
    });
    const exported = JSON.stringify(original);
    const reimported = normalizeDatabase(JSON.parse(exported));

    expect(reimported.pets).toHaveLength(2);
    expect(reimported.pets.map((p) => p.id).sort()).toEqual(["pet-a", "pet-b"]);
    expect(reimported.batches).toHaveLength(2);
    expect(reimported.feedLog).toHaveLength(2);
    expect(reimported.batches.find((b) => b.id === "ba")?.petId).toBe("pet-a");
    expect(reimported.batches.find((b) => b.id === "bb")?.petId).toBe("pet-b");

    // 왕복을 한 번 더 해도(다시 내보내기→다시 가져오기) 값이 그대로다.
    const reexported = JSON.parse(JSON.stringify(reimported));
    const reimportedAgain = normalizeDatabase(reexported);
    expect(reimportedAgain).toEqual(reimported);
  });
});

describe("11. 4단계: 반려동물별 데이터 격리 (buildPetView)", () => {
  const petA = makePet({ id: "pet-a", name: "봄이" });
  const petB = makePet({ id: "pet-b", name: "구름이" });

  function twoPetDb() {
    return makeDb({
      pets: [petA, petB],
      batches: [makeBatch({ id: "ba", petId: "pet-a" }), makeBatch({ id: "bb", petId: "pet-b" })],
      feedLog: [
        makeFeedRecord({ id: "fa1", petId: "pet-a", calculatedKcal: 100 }),
        makeFeedRecord({ id: "fa2", petId: "pet-a", calculatedKcal: 50 }),
        makeFeedRecord({ id: "fb1", petId: "pet-b", calculatedKcal: 200 }),
      ],
      healthLog: [
        makeHealthRecord({ id: "ha", petId: "pet-a", note: "A 기록" }),
        makeHealthRecord({ id: "hb", petId: "pet-b", note: "B 기록" }),
      ],
      medLog: [
        makeMedLog({ id: "mla", petId: "pet-a" }),
        makeMedLog({ id: "mlb", petId: "pet-b" }),
      ],
      dailyPlans: {
        "pet-a:2026-07-24": {
          date: "2026-07-24",
          targetKcal: 400,
          feedings: 2,
          naturalRatio: 100,
          batchId: "ba",
          dryFoodId: "",
          naturalKcalPer100: 150,
          dryKcalPer100: 0,
          totalNaturalGrams: 267,
          totalDryGrams: 0,
          settingsHash: "hash-a",
          appliedAt: "2026-07-24T00:00:00.000Z",
        },
        "pet-b:2026-07-24": {
          date: "2026-07-24",
          targetKcal: 300,
          feedings: 2,
          naturalRatio: 100,
          batchId: "bb",
          dryFoodId: "",
          naturalKcalPer100: 150,
          dryKcalPer100: 0,
          totalNaturalGrams: 200,
          totalDryGrams: 0,
          settingsHash: "hash-b",
          appliedAt: "2026-07-24T00:00:00.000Z",
        },
      },
    });
  }

  it("(4) 반려동물별 급여·재고·건강 기록이 서로 섞이지 않는다", () => {
    const db = twoPetDb();
    const viewA = buildPetView(db, "pet-a");
    const viewB = buildPetView(db, "pet-b");

    expect(viewA.pet.id).toBe("pet-a");
    expect(viewA.batches.map((b) => b.id)).toEqual(["ba"]);
    expect(viewA.feedLog.map((f) => f.id).sort()).toEqual(["fa1", "fa2"]);
    expect(viewA.healthLog.map((h) => h.id)).toEqual(["ha"]);
    expect(viewA.medLog.map((m) => m.id)).toEqual(["mla"]);
    expect(viewA.dailyPlans["2026-07-24"]?.settingsHash).toBe("hash-a");

    expect(viewB.pet.id).toBe("pet-b");
    expect(viewB.batches.map((b) => b.id)).toEqual(["bb"]);
    expect(viewB.feedLog.map((f) => f.id)).toEqual(["fb1"]);
    expect(viewB.healthLog.map((h) => h.id)).toEqual(["hb"]);
    expect(viewB.medLog.map((m) => m.id)).toEqual(["mlb"]);
    expect(viewB.dailyPlans["2026-07-24"]?.settingsHash).toBe("hash-b");
  });

  it("(5) 반려동물별 통계(하루 kcal/목표) 계산이 서로 섞이지 않는다", () => {
    const db = twoPetDb();
    const viewA = buildPetView(db, "pet-a");
    const viewB = buildPetView(db, "pet-b");

    const statsA = dayKcalAndTarget(viewA, "2026-07-24");
    const statsB = dayKcalAndTarget(viewB, "2026-07-24");

    expect(statsA.kcal).toBe(150); // fa1(100) + fa2(50)
    expect(statsA.target).toBe(400);
    expect(statsB.kcal).toBe(200); // fb1
    expect(statsB.target).toBe(300);
  });

  it("(6) buildPetView(db, activePetId).pet.id는 항상 활성 반려동물과 일치한다 — 새 기록에 petId: view.pet.id를 찍으면 항상 올바른 반려동물에 귀속된다", () => {
    const db = twoPetDb();
    const viewB = buildPetView(db, "pet-b");
    expect(viewB.pet.id).toBe("pet-b");

    const newRecord = makeFeedRecord({ id: "fb2", petId: viewB.pet.id, calculatedKcal: 30 });
    const nextDb: Database = { ...db, feedLog: [...db.feedLog, newRecord] };

    const nextViewA = buildPetView(nextDb, "pet-a");
    const nextViewB = buildPetView(nextDb, "pet-b");
    expect(nextViewA.feedLog.some((f) => f.id === "fb2")).toBe(false);
    expect(nextViewB.feedLog.some((f) => f.id === "fb2")).toBe(true);
  });
});

describe("12. 4단계: 반려동물 삭제 (cascadeDeletePet)", () => {
  const petA = makePet({ id: "pet-a", name: "봄이" });
  const petB = makePet({ id: "pet-b", name: "구름이" });

  function twoPetDb() {
    return makeDb({
      pets: [petA, petB],
      batches: [makeBatch({ id: "ba", petId: "pet-a" }), makeBatch({ id: "bb", petId: "pet-b" })],
      feedLog: [
        makeFeedRecord({ id: "fa1", petId: "pet-a" }),
        makeFeedRecord({ id: "fb1", petId: "pet-b" }),
      ],
      healthLog: [
        makeHealthRecord({ id: "ha", petId: "pet-a" }),
        makeHealthRecord({ id: "hb", petId: "pet-b" }),
      ],
      dailyPlans: {
        "pet-a:2026-07-24": {
          date: "2026-07-24",
          targetKcal: 400,
          feedings: 2,
          naturalRatio: 100,
          batchId: "ba",
          dryFoodId: "",
          naturalKcalPer100: 150,
          dryKcalPer100: 0,
          totalNaturalGrams: 267,
          totalDryGrams: 0,
          settingsHash: "hash-a",
          appliedAt: "2026-07-24T00:00:00.000Z",
        },
      },
    });
  }

  it("(7)(8) 반려동물을 삭제하면 그 반려동물의 급여·재고·건강·계획 기록만 삭제되고, 다른 반려동물의 기록은 그대로 남는다", () => {
    const db = twoPetDb();
    const result = cascadeDeletePet(db, "pet-a");

    expect(result.pets.map((p) => p.id)).toEqual(["pet-b"]);
    expect(result.batches.map((b) => b.id)).toEqual(["bb"]);
    expect(result.feedLog.map((f) => f.id)).toEqual(["fb1"]);
    expect(result.healthLog.map((h) => h.id)).toEqual(["hb"]);
    expect(Object.keys(result.dailyPlans)).toEqual([]);

    // 남아있는 pet-b 기록은 손대지 않았다.
    expect(result.batches[0]).toEqual(db.batches[1]);
    expect(result.feedLog[0]).toEqual(db.feedLog[1]);
  });

  it("(9) 반려동물이 한 마리뿐이면 삭제되지 않는다(원본 그대로 반환)", () => {
    const onePetDb = makeDb({ pets: [petA], batches: [makeBatch({ petId: "pet-a" })] });
    const result = cascadeDeletePet(onePetDb, "pet-a");
    expect(result).toEqual(onePetDb);
    expect(result.pets).toHaveLength(1);
  });
});

describe("13. 4단계: 가족 공유 다견 데이터 동기화 회귀 없음", () => {
  it("(12) 다른 가족 구성원이 반려동물을 추가한 뒤 받은 멀티펫 데이터를 정규화해도 두 반려동물의 데이터가 모두 보존되고 서로 섞이지 않는다", () => {
    // 서버(households.data)에는 항상 전체 Database를 JSON으로 그대로 저장하므로,
    // "가족 동기화로 받은 데이터"는 곧 JSON 왕복을 거친 Database와 같다.
    // dataVersion 충돌 감지 자체(app/api/household/state/route.ts)는 이번 4단계에서
    // 손대지 않았고 body.data의 내부 모양과 무관하게 그대로 저장/비교하므로,
    // 여기서는 그 위에 실리는 다견 페이로드가 왕복 후에도 손상되지 않는지만 검증한다.
    const memberALocal = makeDb({ pets: [makePet({ id: "pet-a", name: "봄이" })] });

    // memberB가 반려동물을 추가해 서버에 push한 상황을 흉내낸다.
    const memberBPushed: Database = {
      ...memberALocal,
      pets: [...memberALocal.pets, makePet({ id: "pet-b", name: "구름이" })],
      feedLog: [
        makeFeedRecord({ id: "fa1", petId: "pet-a" }),
        makeFeedRecord({ id: "fb1", petId: "pet-b" }),
      ],
    };
    const serverStored = JSON.parse(JSON.stringify(memberBPushed)); // JSON.stringify(body.data) 왕복

    // memberA가 pull 받아 정규화한다.
    const memberAPulled = normalizeDatabase(serverStored);

    expect(memberAPulled.pets).toHaveLength(2);
    expect(memberAPulled.pets.map((p) => p.id).sort()).toEqual(["pet-a", "pet-b"]);

    const viewA = buildPetView(memberAPulled, "pet-a");
    const viewB = buildPetView(memberAPulled, "pet-b");
    expect(viewA.feedLog.map((f) => f.id)).toEqual(["fa1"]);
    expect(viewB.feedLog.map((f) => f.id)).toEqual(["fb1"]);
  });

  it("동기화 중 지금 선택한 반려동물이 원격에서 삭제됐다면 buildPetView가 남아있는 첫 반려동물로 안전하게 대체한다", () => {
    const remoteAfterDeletion = makeDb({ pets: [makePet({ id: "pet-b", name: "구름이" })] });
    // activePetId가 이미 삭제된 "pet-a"를 가리키고 있어도 buildPetView는 죽지 않고
    // pets[0](pet-b)로 안전하게 대체한다 — 컴포넌트의 안전-전환 useEffect가 같은 상황에서
    // activePetId 자체를 pets[0].id로 되돌리는 것과 동일한 안전장치다.
    const view = buildPetView(remoteAfterDeletion, "pet-a");
    expect(view.pet.id).toBe("pet-b");
  });
});

// recordPlannedMeal/takeMedication/quickHealthNote(app/pet-diet-app.tsx)는
// 기록 객체를 만드는 부분을 각각 buildPlannedMealRecord/buildMedicationLog/
// buildQuickHealthNote로 뽑아 export했고, 컴포넌트는 그 함수들을 그대로
// 호출한다(재고 차감·updateDb 같은 부수효과만 컴포넌트에 남아 있음). 아래
// 테스트는 그 실제 프로덕션 함수를 직접 호출해서, activePetId가 B로 전환된
// 상태에서 만들어진 새 기록이 진짜로 petId: "pet-b"를 갖는지 급여·복약·건강
// 세 경로 모두에서 검증한다.
describe("14. 4단계: activePetId 전환 후 새 기록 생성 경로의 petId 스탬핑", () => {
  const petA = makePet({ id: "pet-a", name: "봄이" });
  const petB = makePet({ id: "pet-b", name: "구름이" });

  it("activePetId가 B로 전환된 상태에서 buildPlannedMealRecord/buildMedicationLog/buildQuickHealthNote(실제 프로덕션 함수)로 만든 새 급여·복약·건강 기록은 모두 petId가 B로 저장되고, A의 기존 기록과 섞이지 않는다", () => {
    const db = makeDb({
      pets: [petA, petB],
      feedLog: [makeFeedRecord({ id: "fa0", petId: "pet-a" })],
      medLog: [makeMedLog({ id: "mla0", petId: "pet-a" })],
      healthLog: [makeHealthRecord({ id: "ha0", petId: "pet-a" })],
    });

    // 사용자가 반려동물 B로 전환한다: switchPet(petB.id)는 activePetId만 바꾸고,
    // 화면에 쓰이는 view는 항상 buildPetView(db, activePetId)로 다시 계산된다
    // (PetDietApp의 view useMemo와 동일한 파생 방식).
    const activePetId = petB.id;
    const view = buildPetView(db, activePetId);
    expect(view.pet.id).toBe("pet-b");

    // 급여 기록: recordPlannedMeal이 실제로 호출하는 buildPlannedMealRecord를 그대로 호출한다.
    const todayPlan = {
      date: "2026-07-24",
      targetKcal: 400,
      feedings: 2,
      naturalRatio: 100,
      batchId: "ba",
      dryFoodId: "",
      naturalKcalPer100: 150,
      dryKcalPer100: 0,
      totalNaturalGrams: 267,
      totalDryGrams: 0,
      settingsHash: "h",
      appliedAt: "2026-07-24T00:00:00.000Z",
    };
    const batch = makeBatch({ id: "ba", petId: "pet-b" });
    const newFeed = buildPlannedMealRecord({
      petId: view.pet.id,
      today: "2026-07-24",
      todayPlan,
      batch,
      naturalOfferedG: 80,
      naturalEatenG: 80,
      dryOfferedG: 0,
      dryEatenG: 0,
    });

    // 복약 기록: takeMedication이 실제로 호출하는 buildMedicationLog를 그대로 호출한다.
    const newMedLog = buildMedicationLog({
      petId: view.pet.id,
      today: "2026-07-24",
      medicationId: "med-1",
      stockUsed: 1,
    });

    // 건강 기록: quickHealthNote가 실제로 호출하는 buildQuickHealthNote를 그대로 호출한다.
    const newHealth = buildQuickHealthNote({ petId: view.pet.id, today: "2026-07-24", note: "구름이 메모" });

    expect(newFeed.petId).toBe("pet-b");
    expect(newMedLog.petId).toBe("pet-b");
    expect(newHealth.petId).toBe("pet-b");

    // 실제 updateDb 콜백처럼 전체 db에 병합한 뒤, 두 반려동물의 view가 서로
    // 섞이지 않는지 확인한다.
    const nextDb: Database = {
      ...db,
      feedLog: [...db.feedLog, newFeed],
      medLog: [...db.medLog, newMedLog],
      healthLog: [...db.healthLog, newHealth],
    };
    const viewA = buildPetView(nextDb, "pet-a");
    const viewB = buildPetView(nextDb, "pet-b");

    expect(viewB.feedLog.map((f) => f.id)).toEqual([newFeed.id]);
    expect(viewB.medLog.map((m) => m.id)).toEqual([newMedLog.id]);
    expect(viewB.healthLog.map((h) => h.id)).toEqual([newHealth.id]);

    expect(viewA.feedLog.map((f) => f.id)).toEqual(["fa0"]);
    expect(viewA.medLog.map((m) => m.id)).toEqual(["mla0"]);
    expect(viewA.healthLog.map((h) => h.id)).toEqual(["ha0"]);
  });
});
