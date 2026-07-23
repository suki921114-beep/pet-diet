"use client";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Beef,
  Bone,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  HeartPulse,
  Home,
  LogOut,
  PackageCheck,
  PawPrint,
  Pill,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Page =
  | "home"
  | "menu"
  | "pet"
  | "pet-edit"
  | "natural"
  | "dry"
  | "meds"
  | "supplements"
  | "inventory"
  | "health"
  | "stats"
  | "settings"
  | "records";

type IngredientLine = {
  name: string;
  grams: number;
  kcalPer100: number;
  protein: number;
  fat: number;
  carb: number;
};

type Pet = {
  name: string;
  birthdate: string;
  sex: "male" | "female" | "male-neutered" | "female-neutered";
  registrationNo: string;
  weightKg: number;
  targetWeightKg: number | null;
  activity: "low" | "normal" | "high";
  condition: "none" | "chronic" | "acute";
  weightGoal: "maintain" | "loss" | "gain";
  dailyTargetKcal: number;
  vetTargetKcal: number | null;
  feedingsPerDay: number;
  fatLimitG: number | null;
  naturalRatio: number;
  batchId: string;
  dryFoodId: string;
  photoDataUrl: string | null;
};

type Batch = {
  id: string;
  name: string;
  dateMade: string;
  expiry: string;
  totalWeight: number;
  usedWeight: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbPer100: number;
  recipe: IngredientLine[];
};

type DryFood = {
  id: string;
  name: string;
  totalWeight: number;
  usedWeight: number;
  kcalPer100: number;
  protein: number;
  fat: number;
  fiber: number;
  ash: number;
  calcium: number;
  phosphorus: number;
  moisture: number;
};

type Medication = {
  id: string;
  type: "med" | "supplement";
  name: string;
  prescribedDate: string;
  dose: string;
  perDay: number;
  stock: number;
  stockUnit: string;
  stockPerDose: number;
  memo: string;
};

type FeedRecord = {
  id: string;
  datetime: string;
  label: string;
  source: "plan" | "batch" | "dry" | "custom";
  offeredG: number;
  eatenG: number;
  calculatedKcal: number;
  protein: number;
  fat: number;
  note: string;
  batchId?: string;
  dryFoodId?: string;
  naturalOfferedG?: number;
  naturalEatenG?: number;
  dryOfferedG?: number;
  dryEatenG?: number;
  naturalKcalPer100?: number;
  dryKcalPer100?: number;
};

type MedicationLog = {
  id: string;
  medicationId: string;
  datetime: string;
  stockUsed: number;
};

type HealthRecord = {
  id: string;
  datetime: string;
  weightKg: number | null;
  bcs: number | null;
  appetite: "good" | "normal" | "low" | "none";
  vomitCount: number;
  stool: number | null;
  vitality: "good" | "normal" | "low";
  pain: boolean;
  note: string;
};

type DailyPlan = {
  date: string;
  targetKcal: number;
  feedings: number;
  naturalRatio: number;
  batchId: string;
  dryFoodId: string;
  naturalKcalPer100: number;
  dryKcalPer100: number;
  totalNaturalGrams: number;
  totalDryGrams: number;
  settingsHash: string;
  appliedAt: string;
};

type Database = {
  schemaVersion: number;
  pet: Pet;
  batches: Batch[];
  dryFoods: DryFood[];
  medications: Medication[];
  feedLog: FeedRecord[];
  medLog: MedicationLog[];
  healthLog: HealthRecord[];
  dailyPlans: Record<string, DailyPlan>;
};

// 가족 공유(household) 관련 타입. 실제 데이터는 서버(D1)의 households.data에
// Database 통째로 저장되고, 이 클라이언트는 주기적으로 가져오고(pull) 저장(push)한다.
type HouseholdMember = {
  email: string;
  displayName: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

type HouseholdInfo = {
  id: string;
  name: string;
  inviteCode: string;
  dataVersion: number;
  updatedAt: string;
  updatedByEmail?: string | null;
  role: "owner" | "member";
  members: HouseholdMember[];
};

type AuthState = "checking" | "signed-out" | "signed-in";

const STORAGE_KEY = "petDietManager";
const LEGACY_KEY = "dogDietApp_v1";

// 재료 목록은 강아지 자연식에 흔히 쓰는 "원재료·단순조리" 항목만 골라뒀다.
// (양파·마늘·초콜릿·포도 등 강아지에게 위험한 재료, 라면·김치·젓갈처럼
// 짜거나 양념된 사람 음식은 검색에 섞이지 않도록 애초에 넣지 않음)
// 100g당 수치는 공인 식품영양성분 자료를 기준으로 한 값이다.
const INGREDIENTS: IngredientLine[] = [
  { name: "닭가슴살(삶은)", grams: 0, kcalPer100: 165, protein: 31, fat: 3.6, carb: 0 },
  { name: "닭다리살(껍질제거, 삶은)", grams: 0, kcalPer100: 172, protein: 20.6, fat: 9.7, carb: 0 },
  { name: "칠면조가슴살", grams: 0, kcalPer100: 135, protein: 29, fat: 1.6, carb: 0 },
  { name: "돼지고기(안심, 삶은)", grams: 0, kcalPer100: 143, protein: 21, fat: 6, carb: 0 },
  { name: "쇠고기(우둔, 삶은)", grams: 0, kcalPer100: 152, protein: 21.5, fat: 6.5, carb: 0 },
  { name: "대구·흰살생선", grams: 0, kcalPer100: 82, protein: 18.4, fat: 0.7, carb: 0 },
  { name: "연어(구운것)", grams: 0, kcalPer100: 206, protein: 22, fat: 13, carb: 0 },
  { name: "새우(삶은, 껍질제거)", grams: 0, kcalPer100: 99, protein: 24, fat: 0.3, carb: 0.2 },
  { name: "달걀(삶은)", grams: 0, kcalPer100: 155, protein: 13, fat: 11, carb: 1.1 },
  { name: "단호박", grams: 0, kcalPer100: 26, protein: 1, fat: 0.1, carb: 6.5 },
  { name: "고구마", grams: 0, kcalPer100: 86, protein: 1.6, fat: 0.1, carb: 20.1 },
  { name: "감자(삶은)", grams: 0, kcalPer100: 87, protein: 1.9, fat: 0.1, carb: 20.1 },
  { name: "당근", grams: 0, kcalPer100: 41, protein: 0.9, fat: 0.2, carb: 9.6 },
  { name: "양배추", grams: 0, kcalPer100: 25, protein: 1.3, fat: 0.1, carb: 5.8 },
  { name: "브로콜리", grams: 0, kcalPer100: 34, protein: 2.8, fat: 0.4, carb: 6.6 },
  { name: "애호박", grams: 0, kcalPer100: 17, protein: 1.1, fat: 0.3, carb: 2.6 },
  { name: "시금치(데친것)", grams: 0, kcalPer100: 23, protein: 2.9, fat: 0.4, carb: 3.6 },
  { name: "오이", grams: 0, kcalPer100: 15, protein: 0.7, fat: 0.1, carb: 3.6 },
  { name: "무", grams: 0, kcalPer100: 18, protein: 0.6, fat: 0.1, carb: 4.1 },
  { name: "배추", grams: 0, kcalPer100: 13, protein: 1.2, fat: 0.2, carb: 2.2 },
  { name: "완두콩(삶은)", grams: 0, kcalPer100: 81, protein: 5.4, fat: 0.4, carb: 14.5 },
  { name: "파프리카", grams: 0, kcalPer100: 31, protein: 1, fat: 0.3, carb: 6 },
  { name: "콩나물(데친것)", grams: 0, kcalPer100: 30, protein: 3.6, fat: 1.4, carb: 2.7 },
  { name: "흰쌀밥", grams: 0, kcalPer100: 130, protein: 2.7, fat: 0.3, carb: 28.2 },
  { name: "현미밥", grams: 0, kcalPer100: 141, protein: 2.6, fat: 1.1, carb: 30 },
  { name: "사과(껍질·씨 제거)", grams: 0, kcalPer100: 52, protein: 0.3, fat: 0.2, carb: 13.8 },
  { name: "바나나", grams: 0, kcalPer100: 89, protein: 1.1, fat: 0.3, carb: 22.8 },
  { name: "배", grams: 0, kcalPer100: 57, protein: 0.4, fat: 0.1, carb: 15.2 },
  { name: "수박(씨 제거)", grams: 0, kcalPer100: 30, protein: 0.6, fat: 0.2, carb: 7.6 },
];

function findIngredient(name: string): IngredientLine {
  return INGREDIENTS.find((item) => item.name === name) ?? INGREDIENTS[0];
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fmt(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function defaultDatabase(): Database {
  const batchId = "batch-sample";
  const dryFoodId = "dry-sample";
  return {
    schemaVersion: 3,
    pet: {
      name: "봄이",
      birthdate: "2014-12-15",
      sex: "female-neutered",
      registrationNo: "",
      weightKg: 2.53,
      targetWeightKg: null,
      activity: "low",
      condition: "chronic",
      weightGoal: "maintain",
      dailyTargetKcal: 140,
      vetTargetKcal: null,
      feedingsPerDay: 5,
      fatLimitG: null,
      naturalRatio: 80,
      batchId,
      dryFoodId,
      photoDataUrl: null,
    },
    batches: [
      {
        id: batchId,
        name: "닭가슴살 단호박 테린",
        dateMade: "2026-07-24",
        expiry: "2026-07-28",
        totalWeight: 600,
        usedWeight: 20,
        kcalPer100: 126.8,
        proteinPer100: 21.4,
        fatPer100: 2.5,
        carbPer100: 5.9,
        recipe: [
          { ...findIngredient("닭가슴살(삶은)"), grams: 400 },
          { ...findIngredient("단호박"), grams: 100 },
          { ...findIngredient("양배추"), grams: 50 },
          { ...findIngredient("브로콜리"), grams: 50 },
        ],
      },
    ],
    dryFoods: [
      {
        id: dryFoodId,
        name: "저지방 처방 건식사료",
        totalWeight: 1000,
        usedWeight: 120,
        kcalPer100: 330,
        protein: 22,
        fat: 7,
        fiber: 6,
        ash: 7,
        calcium: 0.8,
        phosphorus: 0.6,
        moisture: 9,
      },
    ],
    medications: [
      {
        id: "supp-lypex",
        type: "supplement",
        name: "라이펙스",
        prescribedDate: "2026-07-01",
        dose: "하루 1캡슐 중 1/5회분",
        perDay: 5,
        stock: 24,
        stockUnit: "캡슐",
        stockPerDose: 0.2,
        memo: "캡슐을 열어 장용 코팅 과립을 음식에 뿌려 급여",
      },
    ],
    feedLog: [],
    medLog: [],
    healthLog: [],
    dailyPlans: {},
  };
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDatabase(raw: unknown): Database {
  const base = defaultDatabase();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Record<string, unknown>;
  const legacyDog = (source.dog ?? source.pet ?? {}) as Record<string, unknown>;
  const pet: Pet = {
    ...base.pet,
    name: String(legacyDog.name ?? base.pet.name),
    birthdate: String(legacyDog.birthdate ?? base.pet.birthdate),
    weightKg: toNumber(legacyDog.weightKg, base.pet.weightKg),
    targetWeightKg: legacyDog.idealWeightKg
      ? toNumber(legacyDog.idealWeightKg)
      : ((legacyDog.targetWeightKg as number | null) ?? null),
    activity: (legacyDog.activity as Pet["activity"]) ?? base.pet.activity,
    condition:
      legacyDog.disease === "chronic" || legacyDog.disease === "acute"
        ? (legacyDog.disease as Pet["condition"])
        : ((legacyDog.condition as Pet["condition"]) ?? base.pet.condition),
    weightGoal: (legacyDog.weightGoal as Pet["weightGoal"]) ?? base.pet.weightGoal,
    dailyTargetKcal: toNumber(legacyDog.dailyTargetKcal, base.pet.dailyTargetKcal),
    vetTargetKcal: legacyDog.vetTargetKcal ? toNumber(legacyDog.vetTargetKcal) : null,
    feedingsPerDay: Math.max(1, toNumber(legacyDog.feedingsPerDay, base.pet.feedingsPerDay)),
    fatLimitG: legacyDog.fatLimitG ? toNumber(legacyDog.fatLimitG) : null,
    naturalRatio: toNumber(legacyDog.feedNatRatio ?? legacyDog.naturalRatio, base.pet.naturalRatio),
    batchId: String(legacyDog.feedBatchId ?? legacyDog.batchId ?? base.pet.batchId),
    dryFoodId: String(legacyDog.feedDryId ?? legacyDog.dryFoodId ?? base.pet.dryFoodId),
    sex: (legacyDog.sex as Pet["sex"]) ?? base.pet.sex,
    registrationNo: String(legacyDog.registrationNo ?? ""),
    photoDataUrl: typeof legacyDog.photoDataUrl === "string" ? legacyDog.photoDataUrl : null,
  };

  const batches = Array.isArray(source.batches)
    ? (source.batches as Record<string, unknown>[]).map((b) => ({
        id: String(b.id ?? uid("batch")),
        name: String(b.name ?? "자연식"),
        dateMade: String(b.dateMade ?? ""),
        expiry: String(b.expiry ?? ""),
        totalWeight: toNumber(b.totalWeight),
        usedWeight: toNumber(b.usedWeight),
        kcalPer100: toNumber(b.kcalPer100),
        proteinPer100: toNumber(b.proteinPer100),
        fatPer100: toNumber(b.fatPer100),
        carbPer100: toNumber(b.carbPer100),
        recipe: Array.isArray(b.recipe) ? (b.recipe as IngredientLine[]) : [],
      }))
    : base.batches;

  const dryFoods = Array.isArray(source.dryFoods)
    ? (source.dryFoods as Record<string, unknown>[]).map((d) => ({
        id: String(d.id ?? uid("dry")),
        name: String(d.name ?? "건식사료"),
        totalWeight: toNumber(d.totalWeight),
        usedWeight: toNumber(d.usedWeight),
        kcalPer100: toNumber(d.kcalPer100),
        protein: toNumber(d.protein),
        fat: toNumber(d.fat),
        fiber: toNumber(d.fiber),
        ash: toNumber(d.ash),
        calcium: toNumber(d.calcium),
        phosphorus: toNumber(d.phosphorus),
        moisture: toNumber(d.moisture),
      }))
    : base.dryFoods;

  const legacyMeds = (source.medications ?? source.meds) as Record<string, unknown>[] | undefined;
  const medications: Medication[] = Array.isArray(legacyMeds)
    ? legacyMeds.map((m) => ({
        id: String(m.id ?? uid("med")),
        type: (m.type === "med" ? "med" : "supplement") as Medication["type"],
        name: String(m.name ?? "약/영양제"),
        prescribedDate: String(m.prescribedDate ?? ""),
        dose: String(m.dose ?? ""),
        perDay: Math.max(1, toNumber(m.perDay, 1)),
        stock: toNumber(m.stock),
        stockUnit: String(m.stockUnit ?? "회분"),
        stockPerDose: toNumber(m.stockPerDose, 1),
        memo: String(m.memo ?? ""),
      }))
    : base.medications;

  const legacyFeeds = Array.isArray(source.feedLog) ? (source.feedLog as Record<string, unknown>[]) : [];
  const feedLog: FeedRecord[] = legacyFeeds.map((f) => {
    const grams = toNumber(f.grams);
    return {
      id: String(f.id ?? uid("feed")),
      datetime: String(f.datetime ?? `${localDate()}T${localTime()}`),
      label: String(f.label ?? "급여 기록"),
      source:
        f.source === "planfeed"
          ? "plan"
          : String(f.source ?? "").startsWith("batch:")
            ? "batch"
            : String(f.source ?? "").startsWith("dry:")
              ? "dry"
              : ((f.source as FeedRecord["source"]) ?? "custom"),
      offeredG: toNumber(f.offeredG, grams),
      eatenG: toNumber(f.eatenG, grams),
      calculatedKcal: toNumber(f.calculatedKcal ?? f.kcal),
      protein: toNumber(f.protein),
      fat: toNumber(f.fat),
      note: String(f.note ?? ""),
      batchId: f.batchId ? String(f.batchId) : undefined,
      dryFoodId: f.dryFoodId ? String(f.dryFoodId) : undefined,
      naturalOfferedG: toNumber(f.naturalOfferedG ?? f.natGrams),
      naturalEatenG: toNumber(f.naturalEatenG ?? f.natGrams),
      dryOfferedG: toNumber(f.dryOfferedG ?? f.dryGrams),
      dryEatenG: toNumber(f.dryEatenG ?? f.dryGrams),
      naturalKcalPer100: toNumber(f.naturalKcalPer100),
      dryKcalPer100: toNumber(f.dryKcalPer100),
    };
  });

  const rawHealth = (source.healthLog ?? source.symptomLog) as Record<string, unknown>[] | undefined;
  const healthLog: HealthRecord[] = Array.isArray(rawHealth)
    ? rawHealth.map((h) => ({
        id: String(h.id ?? uid("health")),
        datetime: String(h.datetime ?? `${localDate()}T${localTime()}`),
        weightKg: h.weightKg ? toNumber(h.weightKg) : null,
        bcs: h.bcs ? toNumber(h.bcs) : null,
        appetite: (h.appetite as HealthRecord["appetite"]) ?? "normal",
        vomitCount: toNumber(h.vomitCount),
        stool: h.stool ? toNumber(h.stool) : null,
        vitality: (h.vitality as HealthRecord["vitality"]) ?? "normal",
        pain: Boolean(h.pain),
        note: String(h.note ?? ""),
      }))
    : [];

  return {
    schemaVersion: 3,
    pet,
    batches,
    dryFoods,
    medications,
    feedLog,
    medLog: Array.isArray(source.medLog)
      ? (source.medLog as Record<string, unknown>[]).map((m) => ({
          id: String(m.id ?? uid("medlog")),
          medicationId: String(m.medicationId ?? m.medId ?? ""),
          datetime: String(m.datetime ?? `${localDate()}T${localTime()}`),
          stockUsed: toNumber(m.stockUsed, 0),
        }))
      : [],
    healthLog,
    dailyPlans:
      source.dailyPlans && typeof source.dailyPlans === "object"
        ? (source.dailyPlans as Record<string, DailyPlan>)
        : {},
  };
}

function ageText(birthdate: string) {
  const birth = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "나이 미설정";
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}세 ${months ? `${months}개월` : ""}`.trim();
}

function effectiveTarget(pet: Pet) {
  return pet.vetTargetKcal && pet.vetTargetKcal > 0
    ? pet.vetTargetKcal
    : pet.dailyTargetKcal;
}

function merEstimate(pet: Pet) {
  const weight =
    pet.weightGoal === "loss" && pet.targetWeightKg
      ? pet.targetWeightKg
      : pet.weightKg;
  const rer = 70 * Math.pow(weight, 0.75);
  if (pet.condition === "acute") return Math.round(rer);
  if (pet.weightGoal === "loss") return Math.round(rer);
  if (pet.weightGoal === "gain") return Math.round(rer * 1.6);
  const factor = pet.activity === "low" ? 1.2 : pet.activity === "high" ? 1.8 : 1.4;
  return Math.round(rer * factor);
}

function remaining(total: number, used: number) {
  return Math.max(0, total - used);
}

function planSettingsHash(db: Database) {
  const pet = db.pet;
  const batch = db.batches.find((item) => item.id === pet.batchId);
  const dry = db.dryFoods.find((item) => item.id === pet.dryFoodId);
  let ratio = pet.naturalRatio;
  if (batch && !dry) ratio = 100;
  if (!batch && dry) ratio = 0;
  return JSON.stringify({
    target: effectiveTarget(pet),
    feedings: pet.feedingsPerDay,
    ratio,
    batchId: batch?.id ?? "",
    dryFoodId: dry?.id ?? "",
    naturalKcalPer100: batch?.kcalPer100 ?? 0,
    dryKcalPer100: dry?.kcalPer100 ?? 0,
  });
}

function createPlanSnapshot(db: Database, date: string): DailyPlan | null {
  const pet = db.pet;
  const batch = db.batches.find((item) => item.id === pet.batchId);
  const dry = db.dryFoods.find((item) => item.id === pet.dryFoodId);
  if (!batch && !dry) return null;
  const targetKcal = effectiveTarget(pet);
  if (!(targetKcal > 0) || !(pet.feedingsPerDay > 0)) return null;
  const naturalRatio = batch && dry ? pet.naturalRatio : batch ? 100 : 0;
  const naturalKcalPer100 = batch?.kcalPer100 ?? 0;
  const dryKcalPer100 = dry?.kcalPer100 ?? 0;
  if (naturalRatio > 0 && naturalKcalPer100 <= 0) return null;
  if (naturalRatio < 100 && dryKcalPer100 <= 0) return null;
  const naturalKcal = targetKcal * (naturalRatio / 100);
  const dryKcal = targetKcal - naturalKcal;
  return {
    date,
    targetKcal,
    feedings: pet.feedingsPerDay,
    naturalRatio,
    batchId: batch?.id ?? "",
    dryFoodId: dry?.id ?? "",
    naturalKcalPer100,
    dryKcalPer100,
    // 저울은 소수점을 표시하지 않으므로 급여량 계산은 항상 정수 그램으로 반올림한다.
    totalNaturalGrams:
      naturalKcalPer100 > 0 ? Math.round((naturalKcal / naturalKcalPer100) * 100) : 0,
    totalDryGrams: dryKcalPer100 > 0 ? Math.round((dryKcal / dryKcalPer100) * 100) : 0,
    settingsHash: planSettingsHash(db),
    appliedAt: new Date().toISOString(),
  };
}

function dateRecords<T extends { datetime: string }>(rows: T[], date: string) {
  return rows.filter((row) => row.datetime.slice(0, 10) === date);
}

// 자연식+사료가 함께 기록된 혼합 급여 기록에서 실제로 뭘 얼만큼 급여했는지
// 한눈에 보이도록 급여원별 급여량(먹은 양)을 나눠서 보여준다.
function feedBreakdownText(record: FeedRecord) {
  if (!(record.batchId && record.dryFoodId)) return null;
  return `자연식 급여 ${fmt(record.naturalEatenG ?? 0)}g · 사료 급여 ${fmt(record.dryEatenG ?? 0)}g`;
}

function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function PageHeader({
  title,
  onBack,
  onHome,
  action,
}: {
  title: string;
  onBack: () => void;
  onHome: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <IconButton label="뒤로" onClick={onBack}>
        <ArrowLeft size={21} />
      </IconButton>
      <h1>{title}</h1>
      {action ?? (
        <IconButton label="홈" onClick={onHome}>
          <Home size={20} />
        </IconButton>
      )}
    </header>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function ProgressSegments({ done, total }: { done: number; total: number }) {
  return (
    <div className="segments" aria-label={`${total}회 중 ${done}회 완료`}>
      {Array.from({ length: Math.max(1, total) }, (_, index) => (
        <span key={index} className={index < done ? "done" : ""} />
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function percent(used: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round(((total - used) / total) * 100))) : 0;
}

function PetAvatar({
  large = false,
  photoUrl,
  editable = false,
  onPick,
}: {
  large?: boolean;
  photoUrl?: string | null;
  editable?: boolean;
  onPick?: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`pet-avatar ${large ? "large" : ""}`}>
      {photoUrl ? (
        <img src={photoUrl} alt="반려동물 프로필 사진" className="avatar-photo" />
      ) : (
        <PawPrint size={large ? 44 : 25} strokeWidth={1.9} />
      )}
      {editable && (
        <>
          <button
            type="button"
            className="avatar-camera"
            aria-label="프로필 사진 변경"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={13} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && onPick) onPick(file);
              event.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      <Check size={18} />
      {message}
    </div>
  );
}

export default function PetDietApp() {
  const [db, setDb] = useState<Database>(() => defaultDatabase());
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [history, setHistory] = useState<Page[]>([]);
  const [toast, setToast] = useState("");
  const [feedSheetOpen, setFeedSheetOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FeedRecord | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const today = localDate();

  // 가족 공유: 로그인 여부, 가입한 가족 정보, 서버와 주고받는 중인지 여부.
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [familyBusy, setFamilyBusy] = useState(false);
  const householdDataVersion = useRef(0);
  // 서버에서 막 내려받은 데이터를 setDb로 반영하는 중에는, 그 반영 자체가
  // "로컬 변경"으로 오인되어 곧바로 다시 서버로 push되는 걸 막기 위한 플래그.
  const applyingRemoteUpdate = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const current = window.localStorage.getItem(STORAGE_KEY);
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (current || legacy) {
          setDb(normalizeDatabase(JSON.parse(current ?? legacy ?? "{}")));
        }
      } catch {
        setDb(defaultDatabase());
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 로그인 여부 + 가입한 가족 정보를 가져온다. 로그인 안 돼있으면 401이 오는데,
  // 그건 오류가 아니라 "가족 공유를 아직 안 쓴다"는 정상적인 상태다.
  async function refreshHousehold() {
    try {
      const res = await fetch("/api/household/me");
      if (res.status === 401) {
        setAuthState("signed-out");
        setHousehold(null);
        return;
      }
      const payload = (await res.json()) as { household: HouseholdInfo | null };
      setAuthState("signed-in");
      setHousehold(payload.household ?? null);
      if (payload.household) householdDataVersion.current = payload.household.dataVersion;
    } catch {
      // 네트워크 문제는 조용히 넘어간다. 로컬 저장은 가족 공유와 무관하게 항상 동작한다.
    }
  }

  async function pullHouseholdState() {
    try {
      const res = await fetch("/api/household/state");
      if (!res.ok) return;
      const payload = (await res.json()) as { data: unknown; dataVersion: number };
      if (payload.dataVersion === householdDataVersion.current) return;
      householdDataVersion.current = payload.dataVersion;
      applyingRemoteUpdate.current = true;
      setDb(normalizeDatabase(payload.data));
    } catch {
      // 폴링 실패는 다음 주기에 자연스럽게 재시도된다.
    }
  }

  async function pushHouseholdState(nextDb: Database) {
    try {
      const res = await fetch("/api/household/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: nextDb, expectedVersion: householdDataVersion.current }),
      });
      const payload = (await res.json()) as { data?: unknown; dataVersion: number };
      if (res.status === 409) {
        // 다른 가족 구성원이 먼저 저장했다. 내 변경 대신 최신 내용을 반영한다.
        householdDataVersion.current = payload.dataVersion;
        applyingRemoteUpdate.current = true;
        setDb(normalizeDatabase(payload.data));
        setToast("다른 가족 구성원이 방금 먼저 저장해서 최신 내용으로 갱신했어요.");
        return;
      }
      if (res.ok) householdDataVersion.current = payload.dataVersion;
    } catch {
      // 저장 실패는 다음 변경이나 폴링에서 자연스럽게 재시도된다.
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    // 로그인/가족 가입 여부를 서버에서 확인하는 효과. fetch 이후 콜백에서
    // setState하는 통상적인 데이터 패칭 패턴이라 의도적으로 사용한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshHousehold();
  }, [hydrated]);

  // 가족에 가입돼있으면: 처음 한 번 서버 데이터를 받아오고, 이후 주기적으로 폴링한다.
  useEffect(() => {
    if (!household) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    pullHouseholdState();
    const interval = window.setInterval(pullHouseholdState, 8000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  // 로컬 데이터가 바뀔 때마다(서버에서 막 받아온 경우는 제외) 서버로 저장한다.
  useEffect(() => {
    if (!hydrated || !household) return;
    if (applyingRemoteUpdate.current) {
      applyingRemoteUpdate.current = false;
      return;
    }
    const timer = window.setTimeout(() => pushHouseholdState(db), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, hydrated, household?.id]);

  async function createHousehold(name: string) {
    setFamilyBusy(true);
    try {
      const res = await fetch("/api/household/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: db }),
      });
      const payload = (await res.json()) as { error?: string; household?: HouseholdInfo };
      if (!res.ok || !payload.household) {
        setToast(payload.error ?? "가족을 만들지 못했어요.");
        return;
      }
      householdDataVersion.current = payload.household.dataVersion;
      setToast("가족을 만들었어요. 초대 코드를 가족에게 공유해보세요.");
      await refreshHousehold();
    } finally {
      setFamilyBusy(false);
    }
  }

  async function joinHousehold(inviteCode: string) {
    setFamilyBusy(true);
    try {
      const res = await fetch("/api/household/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const payload = (await res.json()) as {
        error?: string;
        household?: HouseholdInfo;
        data?: unknown;
      };
      if (!res.ok || !payload.household) {
        setToast(payload.error ?? "가족에 참여하지 못했어요.");
        return;
      }
      householdDataVersion.current = payload.household.dataVersion;
      applyingRemoteUpdate.current = true;
      setDb(normalizeDatabase(payload.data));
      setHousehold(payload.household);
      setToast("가족에 참여했어요. 가족의 데이터로 갱신했어요.");
    } finally {
      setFamilyBusy(false);
    }
  }

  async function leaveHousehold() {
    if (
      !window.confirm(
        "가족 공유를 그만둘까요? 지금까지 공유된 데이터는 이 기기에 그대로 남고, 앞으로는 이 기기에만 저장돼요.",
      )
    )
      return;
    setFamilyBusy(true);
    try {
      await fetch("/api/household/leave", { method: "POST" });
      setHousehold(null);
      setToast("가족 공유를 나갔어요.");
    } finally {
      setFamilyBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setHousehold(null);
    setAuthState("signed-out");
    setToast("로그아웃했어요.");
  }

  function open(next: Page) {
    setHistory((items) => [...items, page]);
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    const copy = [...history];
    const previous = copy.pop() ?? "home";
    setHistory(copy);
    setPage(previous);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function home() {
    setPage("home");
    setHistory([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateDb(updater: (current: Database) => Database, message?: string) {
    setDb((current) => updater(current));
    if (message) setToast(message);
  }

  const todayFeeds = useMemo(
    () =>
      dateRecords(db.feedLog, today).sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [db.feedLog, today],
  );
  const todayKcal = todayFeeds.reduce((sum, item) => sum + item.calculatedKcal, 0);
  const todayPlan = db.dailyPlans[today];
  const planIsCurrent = todayPlan?.settingsHash === planSettingsHash(db);
  const completedPlanMeals = todayFeeds.filter((item) => item.source === "plan").length;

  const nextServing = useMemo(() => {
    if (!todayPlan) return null;
    const remainingMeals = Math.max(0, todayPlan.feedings - completedPlanMeals);
    if (remainingMeals === 0) {
      return { remainingMeals, naturalG: 0, dryG: 0, kcal: 0 };
    }
    // 매 끼니 같은 비율로 나누지 않고, 오늘 이미 급여한 자연식/사료 양을
    // 하루 목표량에서 뺀 "남은 양"을 남은 끼니 수로 나눈다.
    // 그래야 한쪽 급여원(예: 사료)을 이미 다 줬을 때, 남은 끼니는
    // 나머지 급여원(자연식) 위주로 자동으로 재분배된다.
    const naturalFedG = todayFeeds.reduce(
      (sum, item) => sum + (item.naturalEatenG ?? (item.source === "batch" ? item.eatenG : 0)),
      0,
    );
    const dryFedG = todayFeeds.reduce(
      (sum, item) => sum + (item.dryEatenG ?? (item.source === "dry" ? item.eatenG : 0)),
      0,
    );
    const naturalRemainingG = Math.max(0, todayPlan.totalNaturalGrams - naturalFedG);
    const dryRemainingG = Math.max(0, todayPlan.totalDryGrams - dryFedG);
    // 저울은 소수점을 표시하지 않으므로 1회분 급여량도 정수 그램으로 반올림한다.
    const naturalG = Math.round(naturalRemainingG / remainingMeals);
    const dryG = Math.round(dryRemainingG / remainingMeals);
    const kcal =
      (naturalG * todayPlan.naturalKcalPer100) / 100 + (dryG * todayPlan.dryKcalPer100) / 100;
    return { remainingMeals, kcal, naturalG, dryG };
  }, [todayPlan, completedPlanMeals, todayFeeds]);

  if (!hydrated) {
    return (
      <main className="app-stage">
        <div className="app-frame">
          <div className="loading-cover">기록을 불러오는 중…</div>
        </div>
      </main>
    );
  }

  function applyTodayPlan() {
    const snapshot = createPlanSnapshot(db, today);
    if (!snapshot) {
      setToast("설정에서 목표 열량과 급여원을 먼저 저장해주세요.");
      open("settings");
      return;
    }
    if (todayFeeds.length > 0) {
      const confirmed = window.confirm(
        `오늘 급여 기록이 ${todayFeeds.length}건 있습니다. 기록은 유지하고 남은 급여량만 새 계획으로 다시 계산할까요?`,
      );
      if (!confirmed) return;
    }
    updateDb(
      (current) => ({
        ...current,
        dailyPlans: { ...current.dailyPlans, [today]: snapshot },
      }),
      todayPlan ? "변경된 설정으로 오늘 계획을 업데이트했어요." : "오늘 급여 계획을 적용했어요.",
    );
  }

  function recordPlannedMeal(values?: {
    naturalOfferedG: number;
    naturalEatenG: number;
    dryOfferedG: number;
    dryEatenG: number;
    note: string;
    time: string;
  }) {
    if (!todayPlan || !nextServing || nextServing.remainingMeals <= 0) return;
    // 목표량(계획된 양)과 급여량(실제로 준 양)은 서로 다른 값일 수 있다.
    // 목표보다 더 급여했을 수도 있으므로 급여량을 목표량으로 강제로 깎지 않는다.
    const naturalOfferedG = values?.naturalOfferedG ?? nextServing.naturalG;
    const naturalEatenG = values?.naturalEatenG ?? nextServing.naturalG;
    const dryOfferedG = values?.dryOfferedG ?? nextServing.dryG;
    const dryEatenG = values?.dryEatenG ?? nextServing.dryG;
    // 실제로 창고(재고)에서 빠지는 양은 목표량과 급여량 중 더 큰 쪽이다.
    // (목표보다 덜 급여했다면 목표만큼 덜어낸 것, 더 급여했다면 그만큼 더 덜어낸 것)
    const naturalUsedG = Math.max(naturalOfferedG, naturalEatenG);
    const dryUsedG = Math.max(dryOfferedG, dryEatenG);
    const batch = db.batches.find((item) => item.id === todayPlan.batchId);
    const dry = db.dryFoods.find((item) => item.id === todayPlan.dryFoodId);
    if (batch && naturalUsedG > remaining(batch.totalWeight, batch.usedWeight) + 0.001) {
      setToast(`${batch.name} 재고가 부족해 기록하지 않았어요.`);
      return;
    }
    if (dry && dryUsedG > remaining(dry.totalWeight, dry.usedWeight) + 0.001) {
      setToast(`${dry.name} 재고가 부족해 기록하지 않았어요.`);
      return;
    }
    const kcal =
      (naturalEatenG * todayPlan.naturalKcalPer100) / 100 +
      (dryEatenG * todayPlan.dryKcalPer100) / 100;
    const protein =
      ((batch?.proteinPer100 ?? 0) * naturalEatenG) / 100 +
      ((dry?.protein ?? 0) * dryEatenG) / 100;
    const fat =
      ((batch?.fatPer100 ?? 0) * naturalEatenG) / 100 +
      ((dry?.fat ?? 0) * dryEatenG) / 100;
    const record: FeedRecord = {
      id: uid("feed"),
      datetime: `${today}T${values?.time ?? localTime()}`,
      label: [batch?.name, dry?.name].filter(Boolean).join(" + ") || "급여 계획",
      source: "plan",
      offeredG: naturalOfferedG + dryOfferedG,
      eatenG: naturalEatenG + dryEatenG,
      calculatedKcal: kcal,
      protein,
      fat,
      note: values?.note ?? "",
      batchId: batch?.id,
      dryFoodId: dry?.id,
      naturalOfferedG,
      naturalEatenG,
      dryOfferedG,
      dryEatenG,
      naturalKcalPer100: todayPlan.naturalKcalPer100,
      dryKcalPer100: todayPlan.dryKcalPer100,
    };
    updateDb(
      (current) => ({
        ...current,
        batches: current.batches.map((item) =>
          item.id === batch?.id
            ? { ...item, usedWeight: item.usedWeight + naturalUsedG }
            : item,
        ),
        dryFoods: current.dryFoods.map((item) =>
          item.id === dry?.id
            ? { ...item, usedWeight: item.usedWeight + dryUsedG }
            : item,
        ),
        feedLog: [...current.feedLog, record],
      }),
      "이번 끼니를 기록했어요.",
    );
    setFeedSheetOpen(false);
  }

  function restoreInventory(current: Database, record: FeedRecord, direction: -1 | 1) {
    // 재고에서 실제로 빠진 양은 목표량과 급여량 중 더 큰 쪽으로 계산해 왔으므로
    // 복원할 때도 동일하게 더 큰 쪽 기준으로 되돌린다.
    const natural = Math.max(
      record.naturalOfferedG ?? (record.source === "batch" ? record.offeredG : 0),
      record.naturalEatenG ?? (record.source === "batch" ? record.eatenG : 0),
    );
    const dryAmount = Math.max(
      record.dryOfferedG ?? (record.source === "dry" ? record.offeredG : 0),
      record.dryEatenG ?? (record.source === "dry" ? record.eatenG : 0),
    );
    return {
      ...current,
      batches: current.batches.map((item) =>
        item.id === record.batchId
          ? { ...item, usedWeight: Math.max(0, item.usedWeight + direction * natural) }
          : item,
      ),
      dryFoods: current.dryFoods.map((item) =>
        item.id === record.dryFoodId
          ? { ...item, usedWeight: Math.max(0, item.usedWeight + direction * dryAmount) }
          : item,
      ),
    };
  }

  function deleteFeed(record: FeedRecord) {
    if (!window.confirm("이 급여 기록을 삭제할까요? 차감된 재고도 복원됩니다.")) return;
    updateDb((current) => {
      const restored = restoreInventory(current, record, -1);
      return { ...restored, feedLog: restored.feedLog.filter((item) => item.id !== record.id) };
    }, "기록을 삭제하고 재고를 복원했어요.");
  }

  function saveEditedFeed(
    record: FeedRecord,
    values: {
      datetime: string;
      offeredG: number;
      eatenG: number;
      note: string;
      naturalOfferedG?: number;
      naturalEatenG?: number;
      dryOfferedG?: number;
      dryEatenG?: number;
    },
  ) {
    // 목표량(계획된 양)과 급여량(실제로 준 양)은 서로 다른 값일 수 있으므로
    // 급여량을 목표량으로 강제로 깎지 않는다.
    const eatenG = values.eatenG;
    const eatenScale = record.eatenG > 0 ? eatenG / record.eatenG : 1;
    // 자연식/사료가 둘 다 있는 혼합 기록은 사용자가 입력한 값을 그대로 쓰고,
    // 급여원이 하나뿐인 기록은 그 하나의 총량을 그대로 반영한다.
    // (예전처럼 옛 비율로 비례 배분하지 않음 — 그게 26.4g처럼 의도치 않은 값이 나오던 원인)
    const naturalOfferedG = values.naturalOfferedG ?? (record.batchId ? values.offeredG : 0);
    const dryOfferedG = values.dryOfferedG ?? (record.dryFoodId ? values.offeredG : 0);
    const naturalEatenG = values.naturalEatenG ?? (record.batchId ? eatenG : 0);
    const dryEatenG = values.dryEatenG ?? (record.dryFoodId ? eatenG : 0);
    const naturalDensity = record.naturalKcalPer100 ?? 0;
    const dryDensity = record.dryKcalPer100 ?? 0;
    const averageDensity =
      record.eatenG > 0 ? (record.calculatedKcal / record.eatenG) * 100 : 0;
    const calculatedKcal =
      naturalDensity || dryDensity
        ? (naturalEatenG * naturalDensity) / 100 + (dryEatenG * dryDensity) / 100
        : (eatenG * averageDensity) / 100;
    const updated: FeedRecord = {
      ...record,
      datetime: values.datetime,
      note: values.note,
      offeredG: values.offeredG,
      eatenG,
      calculatedKcal,
      protein: record.protein * eatenScale,
      fat: record.fat * eatenScale,
      naturalOfferedG,
      dryOfferedG,
      naturalEatenG,
      dryEatenG,
    };
    // 재고에서 실제로 빠지는 양은 목표량과 급여량 중 더 큰 쪽이다.
    const naturalUsedG = Math.max(naturalOfferedG, naturalEatenG);
    const dryUsedG = Math.max(dryOfferedG, dryEatenG);
    const previousNaturalUsedG = Math.max(record.naturalOfferedG ?? 0, record.naturalEatenG ?? 0);
    const previousDryUsedG = Math.max(record.dryOfferedG ?? 0, record.dryEatenG ?? 0);
    const batch = db.batches.find((item) => item.id === record.batchId);
    const dry = db.dryFoods.find((item) => item.id === record.dryFoodId);
    const batchAvailable =
      (batch ? remaining(batch.totalWeight, batch.usedWeight) : 0) + previousNaturalUsedG;
    const dryAvailable =
      (dry ? remaining(dry.totalWeight, dry.usedWeight) : 0) + previousDryUsedG;
    if (batch && naturalUsedG > batchAvailable + 0.001) {
      setToast(`${batch.name} 재고보다 많은 양은 저장할 수 없어요.`);
      return;
    }
    if (dry && dryUsedG > dryAvailable + 0.001) {
      setToast(`${dry.name} 재고보다 많은 양은 저장할 수 없어요.`);
      return;
    }
    updateDb((current) => {
      const restored = restoreInventory(current, record, -1);
      const reapplied = restoreInventory(restored, updated, 1);
      return {
        ...reapplied,
        feedLog: reapplied.feedLog.map((item) => (item.id === record.id ? updated : item)),
      };
    }, "기록과 재고를 함께 수정했어요.");
    setEditingRecord(null);
  }

  function takeMedication(medication: Medication) {
    const done = dateRecords(db.medLog, today).filter(
      (item) => item.medicationId === medication.id,
    ).length;
    if (done >= medication.perDay) {
      setToast("오늘 예정 횟수를 이미 모두 완료했어요.");
      return;
    }
    if (medication.stock < medication.stockPerDose) {
      setToast(`${medication.name} 재고가 부족해요.`);
      return;
    }
    const log: MedicationLog = {
      id: uid("medlog"),
      medicationId: medication.id,
      datetime: `${today}T${localTime()}`,
      stockUsed: medication.stockPerDose,
    };
    updateDb(
      (current) => ({
        ...current,
        medications: current.medications.map((item) =>
          item.id === medication.id
            ? { ...item, stock: Math.max(0, item.stock - medication.stockPerDose) }
            : item,
        ),
        medLog: [...current.medLog, log],
      }),
      `${medication.name} 급여를 기록했어요.`,
    );
  }

  function deleteMedicationLog(log: MedicationLog) {
    updateDb(
      (current) => ({
        ...current,
        medications: current.medications.map((item) =>
          item.id === log.medicationId
            ? { ...item, stock: item.stock + log.stockUsed }
            : item,
        ),
        medLog: current.medLog.filter((item) => item.id !== log.id),
      }),
      "급여 체크를 취소하고 재고를 복원했어요.",
    );
  }

  function quickHealthNote(note: string) {
    if (!note.trim()) return;
    const row: HealthRecord = {
      id: uid("health"),
      datetime: `${today}T${localTime()}`,
      weightKg: null,
      bcs: null,
      appetite: "normal",
      vomitCount: 0,
      stool: null,
      vitality: "normal",
      pain: false,
      note: note.trim(),
    };
    updateDb((current) => ({ ...current, healthLog: [...current.healthLog, row] }), "건강 메모를 남겼어요.");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pet-diet-backup-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("백업 파일을 만들었어요.");
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      setDb(normalizeDatabase(parsed));
      setToast("백업 데이터를 안전하게 불러왔어요.");
    } catch {
      setToast("올바른 JSON 백업 파일인지 확인해주세요.");
    }
  }

  const shared = {
    db,
    open,
    back,
    home,
    updateDb,
    today,
    setToast,
  };

  let content: ReactNode;
  switch (page) {
    case "home":
      content = (
        <HomePage
          {...shared}
          todayFeeds={todayFeeds}
          todayKcal={todayKcal}
          todayPlan={todayPlan}
          planIsCurrent={planIsCurrent}
          completedPlanMeals={completedPlanMeals}
          nextServing={nextServing}
          applyTodayPlan={applyTodayPlan}
          recordPlannedMeal={() => recordPlannedMeal()}
          openFeedSheet={() => setFeedSheetOpen(true)}
          takeMedication={takeMedication}
          quickHealthNote={quickHealthNote}
          deleteFeed={deleteFeed}
          editFeed={setEditingRecord}
        />
      );
      break;
    case "menu":
      content = <MenuPage {...shared} />;
      break;
    case "pet":
      content = <PetPage {...shared} />;
      break;
    case "pet-edit":
      content = <PetEditPage {...shared} />;
      break;
    case "natural":
      content = <NaturalFoodPage {...shared} />;
      break;
    case "dry":
      content = <DryFoodPage {...shared} />;
      break;
    case "meds":
      content = <MedicationPage {...shared} type="med" title="처방약 관리" />;
      break;
    case "supplements":
      content = <MedicationPage {...shared} type="supplement" title="영양제 관리" />;
      break;
    case "inventory":
      content = <InventoryPage {...shared} />;
      break;
    case "health":
      content = <HealthPage {...shared} />;
      break;
    case "stats":
      content = <StatsPage {...shared} />;
      break;
    case "records":
      content = (
        <RecordsPage
          {...shared}
          deleteFeed={deleteFeed}
          editFeed={setEditingRecord}
          deleteMedicationLog={deleteMedicationLog}
        />
      );
      break;
    default:
      content = (
        <SettingsPage
          {...shared}
          plan={todayPlan}
          planIsCurrent={planIsCurrent}
          applyTodayPlan={applyTodayPlan}
          exportData={exportData}
          importRef={importRef}
          importData={importData}
          authState={authState}
          household={household}
          familyBusy={familyBusy}
          createHousehold={createHousehold}
          joinHousehold={joinHousehold}
          leaveHousehold={leaveHousehold}
          refreshHousehold={refreshHousehold}
          logout={logout}
        />
      );
  }

  return (
    <main className="app-stage">
      <div className={`app-frame ${page === "stats" ? "stats-mode" : ""}`}>
        {content}
      </div>
      {toast && <Toast message={toast} />}
      {feedSheetOpen && todayPlan && nextServing && (
        <FeedSheet
          plan={todayPlan}
          serving={nextServing}
          onClose={() => setFeedSheetOpen(false)}
          onSave={recordPlannedMeal}
        />
      )}
      {editingRecord && (
        <FeedEditor
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={(values) => saveEditedFeed(editingRecord, values)}
        />
      )}
    </main>
  );
}

type SharedProps = {
  db: Database;
  open: (page: Page) => void;
  back: () => void;
  home: () => void;
  updateDb: (updater: (current: Database) => Database, message?: string) => void;
  today: string;
  setToast: (message: string) => void;
};

function HomePage({
  db,
  open,
  today,
  todayFeeds,
  todayKcal,
  todayPlan,
  planIsCurrent,
  completedPlanMeals,
  nextServing,
  applyTodayPlan,
  recordPlannedMeal,
  openFeedSheet,
  takeMedication,
  quickHealthNote,
  deleteFeed,
  editFeed,
}: SharedProps & {
  todayFeeds: FeedRecord[];
  todayKcal: number;
  todayPlan?: DailyPlan;
  planIsCurrent: boolean;
  completedPlanMeals: number;
  nextServing: { remainingMeals: number; naturalG: number; dryG: number; kcal: number } | null;
  applyTodayPlan: () => void;
  recordPlannedMeal: () => void;
  openFeedSheet: () => void;
  takeMedication: (medication: Medication) => void;
  quickHealthNote: (note: string) => void;
  deleteFeed: (record: FeedRecord) => void;
  editFeed: (record: FeedRecord) => void;
}) {
  const [healthNote, setHealthNote] = useState("");
  const target = todayPlan?.targetKcal ?? effectiveTarget(db.pet);
  const progress = target > 0 ? Math.min(100, (todayKcal / target) * 100) : 0;
  const medLogs = dateRecords(db.medLog, today);
  const totalMedDoses = db.medications.reduce((sum, item) => sum + item.perDay, 0);
  const nextMedication = db.medications.find(
    (med) => medLogs.filter((row) => row.medicationId === med.id).length < med.perDay,
  );
  const completedMeds = medLogs.length;
  const latestHealth = [...db.healthLog].sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${today}T12:00:00`));

  return (
    <>
      <div className="home-topbar">
        <div>
          <span className="home-date">{dateLabel}</span>
          <h1>{db.pet.name}, 밥먹자!</h1>
        </div>
        <IconButton label="설정 메뉴" onClick={() => open("menu")} className="gear-button">
          <Settings size={23} />
        </IconButton>
      </div>

      <div className="home-content">
        <section className="daily-summary">
          <div>
            <span>오늘 섭취</span>
            <strong>{fmt(todayKcal)} kcal</strong>
          </div>
          <div className="summary-divider" />
          <div>
            <span>남은 열량</span>
            <strong>{fmt(Math.max(0, target - todayKcal))} kcal</strong>
          </div>
          <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
            <span>{Math.round(progress)}%</span>
          </div>
        </section>

        <section className="hero-action-card meal-card">
          <div className="action-copy">
            <span className="eyebrow">다음 급여</span>
            {todayPlan && nextServing ? (
              nextServing.remainingMeals > 0 ? (
                <>
                  <h2>
                    자연식 {fmt(nextServing.naturalG)}g
                    {nextServing.dryG > 0 && ` + 사료 ${fmt(nextServing.dryG)}g`}
                  </h2>
                  <p>
                    {completedPlanMeals + 1}/{todayPlan.feedings}번째 · 약 {fmt(nextServing.kcal)} kcal
                  </p>
                </>
              ) : (
                <>
                  <h2>오늘 급여 완료</h2>
                  <p>계획된 {todayPlan.feedings}회를 모두 기록했어요.</p>
                </>
              )
            ) : (
              <>
                <h2>오늘 계획을 적용해주세요</h2>
                <p>설정한 하루 총량을 오늘 날짜에 고정합니다.</p>
              </>
            )}
            <div className="inline-actions">
              {!todayPlan || !planIsCurrent ? (
                <button className="button primary" onClick={applyTodayPlan}>
                  {!todayPlan ? "설정한 계획 적용" : "변경된 설정 업데이트"}
                </button>
              ) : nextServing && nextServing.remainingMeals > 0 ? (
                <>
                  <button className="button primary" onClick={recordPlannedMeal}>
                    <Check size={18} />
                    급여 완료
                  </button>
                  <button className="button secondary" onClick={openFeedSheet}>
                    양 수정
                  </button>
                </>
              ) : (
                <button className="button secondary" onClick={() => open("records")}>
                  오늘 기록 보기
                </button>
              )}
            </div>
          </div>
          <button
            className="hero-icon meal-icon"
            aria-label="이번 끼니 급여 완료"
            onClick={todayPlan && nextServing?.remainingMeals ? recordPlannedMeal : applyTodayPlan}
          >
            <UtensilsCrossed size={54} strokeWidth={1.65} />
          </button>
          <div className="wide-progress">
            <ProgressSegments
              done={completedPlanMeals}
              total={todayPlan?.feedings ?? db.pet.feedingsPerDay}
            />
            <span>
              {completedPlanMeals}/{todayPlan?.feedings ?? db.pet.feedingsPerDay}회 완료
            </span>
          </div>
        </section>

        <section className="hero-action-card medicine-card">
          <div className="action-copy">
            <span className="eyebrow">약 · 영양제</span>
            {nextMedication ? (
              <>
                <h2>{nextMedication.name}</h2>
                <p>{nextMedication.dose || `하루 ${nextMedication.perDay}회`}</p>
                <button className="button ink" onClick={() => takeMedication(nextMedication)}>
                  <Check size={18} />
                  이번 회차 완료
                </button>
              </>
            ) : (
              <>
                <h2>{db.medications.length ? "오늘 모두 완료" : "등록된 약이 없어요"}</h2>
                <button className="button secondary" onClick={() => open("supplements")}>
                  관리하기
                </button>
              </>
            )}
          </div>
          <button
            className="hero-icon medicine-icon"
            aria-label="약 급여 체크"
            onClick={() => (nextMedication ? takeMedication(nextMedication) : open("supplements"))}
          >
            <Pill size={58} strokeWidth={1.6} />
          </button>
          <div className="wide-progress">
            <ProgressSegments done={completedMeds} total={totalMedDoses || 1} />
            <span>
              {completedMeds}/{totalMedDoses || 0}회 완료
            </span>
          </div>
        </section>

        <section className="quick-health-card">
          <div className="quick-health-head">
            <div className="mini-icon">
              <HeartPulse size={21} />
            </div>
            <div>
              <strong>오늘의 건강 한 줄</strong>
              <span>
                {latestHealth?.note || "식욕, 변 상태, 구토 등 작은 변화도 남겨보세요."}
              </span>
            </div>
            <button className="text-link" onClick={() => open("health")}>
              전체
            </button>
          </div>
          <div className="quick-note-row">
            <input
              value={healthNote}
              onChange={(event) => setHealthNote(event.target.value)}
              placeholder="예: 아침 식욕 좋음"
              aria-label="빠른 건강 메모"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  quickHealthNote(healthNote);
                  setHealthNote("");
                }
              }}
            />
            <button
              className="square-action"
              aria-label="건강 메모 저장"
              onClick={() => {
                quickHealthNote(healthNote);
                setHealthNote("");
              }}
            >
              <Plus size={21} />
            </button>
          </div>
        </section>

        <section className="recent-section">
          <SectionTitle
            title="오늘 기록"
            description="최근 급여 기록 3건"
            action={
              <button className="text-link" onClick={() => open("records")}>
                전체 보기
              </button>
            }
          />
          {todayFeeds.length ? (
            <div className="activity-list">
              {[...todayFeeds]
                .reverse()
                .slice(0, 3)
                .map((record) => (
                  <div className="activity-row" key={record.id}>
                    <span className="activity-time">{record.datetime.slice(11, 16)}</span>
                    <div>
                      <strong>{record.label}</strong>
                      <span>
                        목표 {fmt(record.offeredG)}g · 급여 {fmt(record.eatenG)}g ·{" "}
                        {fmt(record.calculatedKcal)}kcal
                      </span>
                      {feedBreakdownText(record) && <span className="breakdown">{feedBreakdownText(record)}</span>}
                    </div>
                    <div className="row-actions">
                      <IconButton label="수정" onClick={() => editFeed(record)}>
                        <Edit3 size={16} />
                      </IconButton>
                      <IconButton label="삭제" onClick={() => deleteFeed(record)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              icon={<UtensilsCrossed size={26} />}
              title="아직 오늘 기록이 없어요"
              description="급여 완료 버튼을 누르면 여기에 시간과 섭취량이 쌓입니다."
            />
          )}
        </section>
      </div>
    </>
  );
}

function MenuPage({ db, open, back, home }: SharedProps) {
  const groups = [
    {
      items: [
        { page: "natural" as Page, title: "자연식", subtitle: `${db.batches.length}개 레시피`, icon: <Beef /> },
        { page: "dry" as Page, title: "시중사료", subtitle: `${db.dryFoods.length}개 제품`, icon: <Bone /> },
      ],
    },
    {
      items: [
        {
          page: "meds" as Page,
          title: "처방약",
          subtitle: `${db.medications.filter((item) => item.type === "med").length}개 등록`,
          icon: <Pill />,
        },
        {
          page: "supplements" as Page,
          title: "영양제",
          subtitle: `${db.medications.filter((item) => item.type === "supplement").length}개 등록`,
          icon: <Sparkles />,
        },
      ],
    },
    {
      items: [
        { page: "inventory" as Page, title: "재고관리", subtitle: "자연식 · 사료 · 약", icon: <PackageCheck /> },
        { page: "health" as Page, title: "건강기록", subtitle: `${db.healthLog.length}건 기록`, icon: <HeartPulse /> },
        { page: "stats" as Page, title: "통계", subtitle: "일별 · 주별 · 월별", icon: <BarChart3 /> },
        { page: "settings" as Page, title: "설정", subtitle: "급여 계획 · 백업", icon: <Settings /> },
      ],
    },
  ];
  return (
    <>
      <PageHeader title="관리 메뉴" onBack={back} onHome={home} />
      <div className="page-content menu-page">
        <button className="profile-menu-card" onClick={() => open("pet")}>
          <div>
            <span className="eyebrow">반려동물 프로필</span>
            <h2>{db.pet.name}</h2>
            <p>
              {ageText(db.pet.birthdate)} · {fmt(db.pet.weightKg, 2)}kg
            </p>
          </div>
          <PetAvatar photoUrl={db.pet.photoDataUrl} />
          <ChevronRight size={20} />
        </button>
        {groups.map((group, groupIndex) => (
          <div className="menu-group" key={groupIndex}>
            {group.items.map((item) => (
              <button className="menu-row" onClick={() => open(item.page)} key={item.title}>
                <span className="menu-icon">{item.icon}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <ChevronRight size={20} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function PetPage({ db, open, back, home }: SharedProps) {
  return (
    <>
      <PageHeader title="반려동물 관리" onBack={back} onHome={home} />
      <div className="page-content">
        <section className="pet-profile-card">
          <PetAvatar large photoUrl={db.pet.photoDataUrl} />
          <h2>{db.pet.name}</h2>
          <p>
            {ageText(db.pet.birthdate)} ·{" "}
            {db.pet.sex === "female-neutered" ? "중성화 암컷" : "프로필 등록"}
          </p>
          <button className="button secondary" onClick={() => open("pet-edit")}>
            <Edit3 size={17} />
            강아지 정보 수정
          </button>
        </section>
        <section className="calorie-hero">
          <div className="flame-icon">
            <Activity size={34} />
          </div>
          <div>
            <span>현재 1일 목표</span>
            <strong>{fmt(effectiveTarget(db.pet))} kcal</strong>
            {db.pet.vetTargetKcal && <small>수의사 지정값 우선 적용 중</small>}
          </div>
        </section>
        <div className="info-grid">
          <div>
            <span>현재 체중</span>
            <strong>{fmt(db.pet.weightKg, 2)} kg</strong>
          </div>
          <div>
            <span>하루 급여</span>
            <strong>{db.pet.feedingsPerDay}회</strong>
          </div>
          <div>
            <span>활동량</span>
            <strong>{db.pet.activity === "low" ? "낮음" : db.pet.activity === "high" ? "높음" : "보통"}</strong>
          </div>
          <div>
            <span>관리 상태</span>
            <strong>{db.pet.condition === "chronic" ? "만성질환" : db.pet.condition === "acute" ? "회복기" : "일반"}</strong>
          </div>
        </div>
      </div>
    </>
  );
}

function PetEditPage({ db, updateDb, back, home }: SharedProps) {
  const [pet, setPet] = useState(db.pet);
  // 체중·목표체중·활동량·질환·체중목표가 바뀔 때마다 참고 열량을 다시 계산해
  // 1일 목표 kcal에 자동으로 반영한다. dailyTargetKcal을 직접 입력칸에서
  // 수정하는 것과는 별개 경로라 순환 업데이트는 발생하지 않는다.
  function updateAndRecalc(patch: Partial<Pet>) {
    setPet((current) => {
      const next = { ...current, ...patch };
      return { ...next, dailyTargetKcal: merEstimate(next) };
    });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    updateDb((current) => ({ ...current, pet }), "반려동물 정보를 저장했어요.");
    back();
  }
  return (
    <>
      <PageHeader title="반려동물 수정" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={save}>
        <div className="edit-avatar-wrap">
          <PetAvatar
            large
            editable
            photoUrl={pet.photoDataUrl}
            onPick={(file) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  setPet((current) => ({ ...current, photoDataUrl: reader.result as string }));
                }
              };
              reader.readAsDataURL(file);
            }}
          />
          <span>프로필 사진</span>
        </div>
        <section className="form-section">
          <h2>기본 정보</h2>
          <label>
            반려동물 이름
            <input value={pet.name} onChange={(e) => setPet({ ...pet, name: e.target.value })} required />
          </label>
          <div className="field-grid">
            <label>
              생년월일
              <input type="date" value={pet.birthdate} onChange={(e) => setPet({ ...pet, birthdate: e.target.value })} />
            </label>
            <label>
              성별
              <select value={pet.sex} onChange={(e) => setPet({ ...pet, sex: e.target.value as Pet["sex"] })}>
                <option value="male">수컷</option>
                <option value="female">암컷</option>
                <option value="male-neutered">수컷(중성화)</option>
                <option value="female-neutered">암컷(중성화)</option>
              </select>
            </label>
          </div>
          <label>
            동물등록번호
            <input value={pet.registrationNo} onChange={(e) => setPet({ ...pet, registrationNo: e.target.value })} placeholder="선택 입력" />
          </label>
        </section>
        <section className="form-section">
          <h2>건강과 급여 기준</h2>
          <div className="field-grid">
            <label>
              현재 체중(kg)
              <input type="number" step="0.01" value={pet.weightKg} onChange={(e) => updateAndRecalc({ weightKg: Number(e.target.value) })} />
            </label>
            <label>
              목표 체중(kg)
              <input type="number" step="0.01" value={pet.targetWeightKg ?? ""} onChange={(e) => updateAndRecalc({ targetWeightKg: e.target.value ? Number(e.target.value) : null })} />
            </label>
          </div>
          <label>
            활동량
            <select value={pet.activity} onChange={(e) => updateAndRecalc({ activity: e.target.value as Pet["activity"] })}>
              <option value="low">낮음 · 대부분 휴식</option>
              <option value="normal">보통 · 가벼운 산책</option>
              <option value="high">높음 · 활발한 활동</option>
            </select>
          </label>
          <label>
            질환/상태
            <select value={pet.condition} onChange={(e) => updateAndRecalc({ condition: e.target.value as Pet["condition"] })}>
              <option value="none">특별한 질환 없음</option>
              <option value="chronic">만성질환 관리 중</option>
              <option value="acute">급성 회복기</option>
            </select>
          </label>
          <label>
            체중 관리 목표
            <select value={pet.weightGoal} onChange={(e) => updateAndRecalc({ weightGoal: e.target.value as Pet["weightGoal"] })}>
              <option value="maintain">현재 체중 유지</option>
              <option value="loss">체중 감량</option>
              <option value="gain">체중 증량</option>
            </select>
          </label>
          <div className="field-grid">
            <label>
              1일 목표 kcal
              <input type="number" value={pet.dailyTargetKcal} onChange={(e) => setPet({ ...pet, dailyTargetKcal: Number(e.target.value) })} />
            </label>
            <label>
              1일 급여 횟수
              <input type="number" min="1" max="12" value={pet.feedingsPerDay} onChange={(e) => setPet({ ...pet, feedingsPerDay: Number(e.target.value) })} />
            </label>
          </div>
          <p className="form-note">
            체중·활동량·질환 정보를 반영해 1일 목표 kcal이 자동 계산돼요(참고값 <strong>{merEstimate(pet)} kcal</strong>). 수의사 지정값이 따로 있다면 위 칸에 직접 덮어써주세요.
          </p>
        </section>
        <button className="button primary full" type="submit">
          <Save size={18} />
          정보 저장
        </button>
      </form>
    </>
  );
}

function NaturalFoodPage({ db, updateDb, back, home, setToast }: SharedProps) {
  const [lines, setLines] = useState<IngredientLine[]>([
    { ...findIngredient("닭가슴살(삶은)"), grams: 0 },
    { ...findIngredient("단호박"), grams: 0 },
  ]);
  const [name, setName] = useState("");
  const [dateMade, setDateMade] = useState(localDate());
  const [expiry, setExpiry] = useState("");
  const [finalWeight, setFinalWeight] = useState("");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const ingredientMatches = ingredientQuery.trim()
    ? INGREDIENTS.filter((item) => item.name.includes(ingredientQuery.trim()))
    : [];
  const totals = lines.reduce(
    (sum, line) => ({
      weight: sum.weight + line.grams,
      kcal: sum.kcal + (line.kcalPer100 * line.grams) / 100,
      protein: sum.protein + (line.protein * line.grams) / 100,
      fat: sum.fat + (line.fat * line.grams) / 100,
      carb: sum.carb + (line.carb * line.grams) / 100,
    }),
    { weight: 0, kcal: 0, protein: 0, fat: 0, carb: 0 },
  );
  const completedWeight = Number(finalWeight) || totals.weight;
  const macroTotal = totals.protein * 4 + totals.fat * 9 + totals.carb * 4 || 1;
  const proteinDeg = (totals.protein * 4 * 360) / macroTotal;
  const fatDeg = (totals.fat * 9 * 360) / macroTotal;

  function addIngredientFromSearch(item: IngredientLine) {
    setLines((current) => [...current, { ...item, grams: 0 }]);
    setIngredientQuery("");
  }

  function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!(completedWeight > 0) || !(totals.kcal > 0)) {
      setToast("재료와 완성 중량을 먼저 입력해주세요.");
      return;
    }
    const batch: Batch = {
      id: uid("batch"),
      name: name.trim() || `${dateMade} 자연식`,
      dateMade,
      expiry,
      totalWeight: completedWeight,
      usedWeight: 0,
      kcalPer100: (totals.kcal / completedWeight) * 100,
      proteinPer100: (totals.protein / completedWeight) * 100,
      fatPer100: (totals.fat / completedWeight) * 100,
      carbPer100: (totals.carb / completedWeight) * 100,
      recipe: lines.filter((line) => line.grams > 0),
    };
    updateDb(
      (current) => ({
        ...current,
        batches: [...current.batches, batch],
        pet: { ...current.pet, batchId: current.pet.batchId || batch.id },
      }),
      "레시피를 확정하고 재고에 등록했어요.",
    );
    setName("");
    setFinalWeight("");
  }

  function loadRecipe(batch: Batch) {
    if (!batch.recipe.length) return;
    setLines(batch.recipe.map((line) => ({ ...line })));
    setName(`${batch.name} 재제작`);
    setFinalWeight(String(batch.totalWeight));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setToast("이전 레시피를 불러왔어요.");
  }

  return (
    <>
      <PageHeader title="자연식 만들기" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={saveRecipe}>
        <SectionTitle
          title="재료를 더해 레시피를 만드세요"
          description="재료와 사용량을 입력하면 열량과 주요 영양 비율이 바로 누적됩니다."
        />
        <div className="search-field ingredient-search">
          <Search size={20} />
          <input
            value={ingredientQuery}
            onChange={(e) => setIngredientQuery(e.target.value)}
            placeholder="재료 이름으로 검색 (예: 닭가슴살)"
          />
          {ingredientQuery.trim() && (
            <div className="ingredient-dropdown">
              {ingredientMatches.length > 0 ? (
                ingredientMatches.map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    className="ingredient-option"
                    onClick={() => addIngredientFromSearch(item)}
                  >
                    <strong>{item.name}</strong>
                    <small>100g당 {fmt(item.kcalPer100)}kcal</small>
                  </button>
                ))
              ) : (
                <p className="ingredient-empty">일치하는 재료가 없어요.</p>
              )}
            </div>
          )}
        </div>
        <div className="ingredient-list">
          {lines.map((line, index) => (
            <div className="ingredient-row" key={`${index}-${line.name}`}>
              <div className="ingredient-name">
                <strong>{line.name}</strong>
                <small>100g당 {fmt(line.kcalPer100)}kcal</small>
              </div>
              <div className="unit-input">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={line.grams || ""}
                  onChange={(e) =>
                    setLines((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, grams: Number(e.target.value) } : item,
                      ),
                    )
                  }
                  placeholder="0"
                />
                <span>g</span>
              </div>
              <IconButton
                label="재료 삭제"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                <X size={17} />
              </IconButton>
            </div>
          ))}
          {lines.length === 0 && (
            <p className="form-note">위 검색창에서 재료를 찾아 추가해주세요.</p>
          )}
        </div>
        <section className="macro-card">
          <div
            className="macro-donut"
            style={{
              background: `conic-gradient(var(--chart-blue) 0 ${proteinDeg}deg, var(--chart-coral) ${proteinDeg}deg ${proteinDeg + fatDeg}deg, var(--chart-gold) ${proteinDeg + fatDeg}deg 360deg)`,
            }}
          />
          <div className="macro-legend">
            <div><span className="dot blue" /><b>단백질</b><strong>{fmt(totals.protein, 1)}g</strong></div>
            <div><span className="dot coral" /><b>지방</b><strong>{fmt(totals.fat, 1)}g</strong></div>
            <div><span className="dot gold" /><b>탄수화물</b><strong>{fmt(totals.carb, 1)}g</strong></div>
            <div><span className="dot gray" /><b>총 열량</b><strong>{fmt(totals.kcal)}kcal</strong></div>
          </div>
        </section>
        <section className="form-section">
          <h2>레시피 확정</h2>
          <label>
            레시피 이름
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 7월 넷째 주 테린" />
          </label>
          <div className="field-grid">
            <label>
              제조일
              <input type="date" value={dateMade} onChange={(e) => setDateMade(e.target.value)} />
            </label>
            <label>
              유통기한
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          </div>
          <label>
            조리 후 완성 중량(g)
            <input type="number" value={finalWeight} onChange={(e) => setFinalWeight(e.target.value)} placeholder={`재료 합 ${fmt(totals.weight)}g`} />
          </label>
          <div className="result-strip">
            <span>완성 기준</span>
            <strong>{completedWeight > 0 ? `${fmt((totals.kcal / completedWeight) * 100, 1)} kcal/100g` : "—"}</strong>
          </div>
          <p className="form-note warning">
            열량과 일부 다량영양소만 추정하며, 완전균형식 여부는 판정하지 않습니다.
          </p>
        </section>
        <button className="button primary full" type="submit">레시피 확정</button>
      </form>
      <section className="page-content previous-section">
        <SectionTitle title="이전 레시피" description="눌러서 같은 구성으로 다시 만들 수 있어요." />
        <div className="stack-list">
          {[...db.batches].reverse().map((batch) => (
            <button className="stack-row" key={batch.id} onClick={() => loadRecipe(batch)}>
              <CalendarDays size={19} />
              <span><strong>{batch.name}</strong><small>{batch.dateMade} · {fmt(batch.totalWeight)}g</small></span>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function DryFoodPage({ db, updateDb, back, home, setToast }: SharedProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const protein = toNumber(form.get("protein"));
    const fat = toNumber(form.get("fat"));
    const fiber = toNumber(form.get("fiber"));
    const moisture = toNumber(form.get("moisture"));
    const ash = toNumber(form.get("ash"));
    const nfe = Math.max(0, 100 - protein - fat - fiber - moisture - ash);
    const estimated = protein * 3.5 + fat * 8.5 + nfe * 3.5;
    const item: DryFood = {
      id: uid("dry"),
      name,
      totalWeight: toNumber(form.get("totalWeight")),
      usedWeight: 0,
      kcalPer100: toNumber(form.get("kcalPer100"), estimated),
      protein,
      fat,
      fiber,
      ash,
      calcium: toNumber(form.get("calcium")),
      phosphorus: toNumber(form.get("phosphorus")),
      moisture,
    };
    if (!(item.kcalPer100 > 0) || !(item.totalWeight > 0)) {
      setToast("제품 중량과 열량 또는 성분표를 입력해주세요.");
      return;
    }
    updateDb(
      (current) => ({
        ...current,
        dryFoods: [...current.dryFoods, item],
        pet: { ...current.pet, dryFoodId: current.pet.dryFoodId || item.id },
      }),
      "시중사료를 등록했어요.",
    );
    event.currentTarget.reset();
  }
  return (
    <>
      <PageHeader title="시중사료 관리" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={submit}>
        <SectionTitle title="제품 정보를 등록하세요" description="라벨의 대사에너지 값이 있으면 그 값을 가장 먼저 사용합니다." />
        <section className="form-section">
          <label>제품명<input name="name" placeholder="예: 저지방 처방 건식사료" required /></label>
          <div className="field-grid">
            <label>구매 중량(g)<input name="totalWeight" type="number" min="1" required /></label>
            <label>대사에너지(kcal/100g)<input name="kcalPer100" type="number" step="0.1" /></label>
          </div>
        </section>
        <section className="form-section">
          <h2>보증 성분</h2>
          <div className="field-grid compact">
            {[
              ["protein", "조단백 %"],
              ["fat", "조지방 %"],
              ["fiber", "조섬유 %"],
              ["ash", "조회분 %"],
              ["calcium", "칼슘 %"],
              ["phosphorus", "인 %"],
              ["moisture", "수분 %"],
            ].map(([name, label]) => (
              <label key={name}>{label}<input name={name} type="number" step="0.1" /></label>
            ))}
          </div>
          <p className="form-note">열량을 비우면 Modified Atwater 방식으로 참고값을 계산합니다.</p>
        </section>
        <button className="button primary full" type="submit"><Plus size={18} /> 사료 추가</button>
      </form>
      <section className="page-content previous-section">
        <SectionTitle title="등록된 시중사료" />
        <div className="stack-list">
          {db.dryFoods.map((food) => (
            <div className="stack-row static" key={food.id}>
              <Bone size={19} />
              <span><strong>{food.name}</strong><small>{fmt(food.kcalPer100)}kcal/100g · 재고 {fmt(remaining(food.totalWeight, food.usedWeight))}g</small></span>
              <button className="danger-link" onClick={() => updateDb((current) => ({ ...current, dryFoods: current.dryFoods.filter((item) => item.id !== food.id) }), "사료를 삭제했어요.")}>삭제</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MedicationPage({
  db,
  updateDb,
  back,
  home,
  type,
  title,
}: SharedProps & { type: Medication["type"]; title: string }) {
  const rows = db.medications.filter((item) => item.type === type);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medication: Medication = {
      id: uid(type === "med" ? "med" : "supp"),
      type,
      name: String(form.get("name") ?? "").trim(),
      prescribedDate: String(form.get("prescribedDate") ?? ""),
      dose: String(form.get("dose") ?? ""),
      perDay: Math.max(1, toNumber(form.get("perDay"), 1)),
      stock: toNumber(form.get("stock")),
      stockUnit: String(form.get("stockUnit") ?? "회분"),
      stockPerDose: toNumber(form.get("stockPerDose"), 1),
      memo: String(form.get("memo") ?? ""),
    };
    if (!medication.name) return;
    updateDb((current) => ({ ...current, medications: [...current.medications, medication] }), `${medication.name}을 등록했어요.`);
    event.currentTarget.reset();
  }
  return (
    <>
      <PageHeader title={title} onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={submit}>
        <SectionTitle title={type === "med" ? "처방 내용을 정확히 기록하세요" : "제품과 분할 급여법을 기록하세요"} />
        <section className="form-section">
          <label>제품명<input name="name" required /></label>
          <div className="field-grid">
            <label>{type === "med" ? "처방일" : "구매일"}<input name="prescribedDate" type="date" /></label>
            <label>1일 횟수<input name="perDay" type="number" min="1" defaultValue="1" /></label>
          </div>
          <label>1회 급여 설명<input name="dose" placeholder={type === "supplement" ? "예: 하루 1캡슐 중 1/5회분" : "예: 1/2정"} /></label>
          <div className="field-grid">
            <label>현재 재고<input name="stock" type="number" step="0.1" /></label>
            <label>재고 단위<input name="stockUnit" placeholder="정, 캡슐, 포" /></label>
          </div>
          <label>1회당 재고 차감량<input name="stockPerDose" type="number" step="0.1" defaultValue="1" /></label>
          <label>메모<textarea name="memo" placeholder="성분, 식사와 함께/별도, 보관법 등" /></label>
        </section>
        <button className="button primary full" type="submit"><Plus size={18} /> 등록</button>
      </form>
      <section className="page-content previous-section">
        <SectionTitle title={`등록된 ${type === "med" ? "처방약" : "영양제"}`} />
        {rows.length ? (
          <div className="stack-list">
            {rows.map((med) => (
              <div className="medication-item" key={med.id}>
                <div className={`medication-symbol ${type}`}>
                  {type === "med" ? <Pill size={23} /> : <Sparkles size={23} />}
                </div>
                <div>
                  <strong>{med.name}</strong>
                  <span>{med.dose || `하루 ${med.perDay}회`}</span>
                  <small>재고 {fmt(med.stock, 1)} {med.stockUnit}</small>
                </div>
                <button className="danger-link" onClick={() => updateDb((current) => ({ ...current, medications: current.medications.filter((item) => item.id !== med.id) }), "항목을 삭제했어요.")}>삭제</button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Pill size={26} />} title="등록된 항목이 없어요" description="상단 폼에서 처음 등록해보세요." />
        )}
      </section>
    </>
  );
}

function InventoryPage({ db, updateDb, back, home }: SharedProps) {
  const naturalTotal = db.batches.reduce((sum, item) => sum + item.totalWeight, 0);
  const naturalUsed = db.batches.reduce((sum, item) => sum + item.usedWeight, 0);
  const dryTotal = db.dryFoods.reduce((sum, item) => sum + item.totalWeight, 0);
  const dryUsed = db.dryFoods.reduce((sum, item) => sum + item.usedWeight, 0);
  const medStock = db.medications.filter((item) => item.type === "med").reduce((sum, item) => sum + item.stock, 0);
  const suppStock = db.medications.filter((item) => item.type === "supplement").reduce((sum, item) => sum + item.stock, 0);
  return (
    <>
      <PageHeader title="재고 관리" onBack={back} onHome={home} />
      <div className="page-content">
        <SectionTitle title="남은 양을 한눈에 확인하세요" />
        <div className="inventory-grid">
          {[
            ["자연식", percent(naturalUsed, naturalTotal), <Beef key="n" />],
            ["시중사료", percent(dryUsed, dryTotal), <Bone key="d" />],
            ["처방약", medStock > 0 ? 100 : 0, <Pill key="m" />],
            ["영양제", suppStock > 0 ? 100 : 0, <Sparkles key="s" />],
          ].map(([label, value, icon]) => (
            <div className="inventory-summary" key={String(label)}>
              <span className="menu-icon">{icon as ReactNode}</span>
              <strong>{String(label)}</strong>
              <b>{Number(value)}%</b>
            </div>
          ))}
        </div>
        <SectionTitle title="자연식 재고" description="목표량을 기준으로 자동 차감됩니다." />
        <div className="inventory-list">
          {db.batches.map((batch) => {
            const remain = remaining(batch.totalWeight, batch.usedWeight);
            const value = percent(batch.usedWeight, batch.totalWeight);
            return (
              <div className="inventory-row" key={batch.id}>
                <div className="inventory-row-head">
                  <div><strong>{batch.name}</strong><span>{batch.dateMade} · {fmt(batch.totalWeight)}g</span></div>
                  <button
                    className="button danger small"
                    onClick={() => {
                      if (!window.confirm(`${batch.name} 재고를 폐기 처리할까요?`)) return;
                      updateDb((current) => ({
                        ...current,
                        batches: current.batches.map((item) =>
                          item.id === batch.id ? { ...item, usedWeight: item.totalWeight } : item,
                        ),
                      }), "재고를 폐기 처리했어요.");
                    }}
                  >
                    폐기
                  </button>
                </div>
                <div className="inventory-meta"><span>{fmt(remain)}g / {fmt(batch.totalWeight)}g</span><b>{value}%</b></div>
                <div className="inventory-bar"><span style={{ width: `${value}%` }} /></div>
              </div>
            );
          })}
        </div>
        <SectionTitle title="시중사료 재고" />
        <div className="inventory-list">
          {db.dryFoods.map((food) => {
            const value = percent(food.usedWeight, food.totalWeight);
            return (
              <div className="inventory-row" key={food.id}>
                <div className="inventory-row-head"><div><strong>{food.name}</strong><span>남은 {fmt(remaining(food.totalWeight, food.usedWeight))}g</span></div><b>{value}%</b></div>
                <div className="inventory-bar"><span style={{ width: `${value}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function HealthPage({ db, updateDb, back, home }: SharedProps) {
  const [formOpen, setFormOpen] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record: HealthRecord = {
      id: uid("health"),
      datetime: `${String(form.get("date") || localDate())}T${String(form.get("time") || localTime())}`,
      weightKg: form.get("weightKg") ? toNumber(form.get("weightKg")) : null,
      bcs: form.get("bcs") ? toNumber(form.get("bcs")) : null,
      appetite: String(form.get("appetite") || "normal") as HealthRecord["appetite"],
      vomitCount: toNumber(form.get("vomitCount")),
      stool: form.get("stool") ? toNumber(form.get("stool")) : null,
      vitality: String(form.get("vitality") || "normal") as HealthRecord["vitality"],
      pain: form.get("pain") === "on",
      note: String(form.get("note") || ""),
    };
    updateDb((current) => ({ ...current, healthLog: [...current.healthLog, record] }), "건강 기록을 저장했어요.");
    setFormOpen(false);
  }
  const rows = [...db.healthLog].sort((a, b) => b.datetime.localeCompare(a.datetime));
  return (
    <>
      <PageHeader
        title="건강기록 관리"
        onBack={back}
        onHome={home}
        action={
          <IconButton label="건강 기록 추가" onClick={() => setFormOpen((value) => !value)}>
            {formOpen ? <X size={20} /> : <Plus size={20} />}
          </IconButton>
        }
      />
      <div className="page-content">
        <SectionTitle title="몸의 작은 변화를 모아보세요" description="메인에서 쓴 한 줄 메모와 구조화된 기록이 함께 표시됩니다." />
        {formOpen && (
          <form className="form-section health-form" onSubmit={submit}>
            <div className="field-grid">
              <label>날짜<input name="date" type="date" defaultValue={localDate()} /></label>
              <label>시간<input name="time" type="time" defaultValue={localTime()} /></label>
            </div>
            <div className="field-grid">
              <label>체중(kg)<input name="weightKg" type="number" step="0.01" /></label>
              <label>BCS(1–9)<input name="bcs" type="number" min="1" max="9" /></label>
            </div>
            <div className="field-grid">
              <label>식욕<select name="appetite"><option value="good">좋음</option><option value="normal">보통</option><option value="low">저하</option><option value="none">거부</option></select></label>
              <label>활력<select name="vitality"><option value="good">좋음</option><option value="normal">보통</option><option value="low">저하</option></select></label>
            </div>
            <div className="field-grid">
              <label>구토 횟수<input name="vomitCount" type="number" min="0" defaultValue="0" /></label>
              <label>변 상태(1–7)<input name="stool" type="number" min="1" max="7" /></label>
            </div>
            <label className="check-label"><input name="pain" type="checkbox" /> 통증·복통 의심</label>
            <label>특이사항<textarea name="note" placeholder="예: 산책 중 묽은 변" /></label>
            <button className="button primary full" type="submit">기록 저장</button>
          </form>
        )}
        {rows.length ? (
          <div className="health-timeline">
            {rows.map((row) => (
              <article className="health-entry" key={row.id}>
                <time>{row.datetime.slice(0, 10)} <span>{row.datetime.slice(11, 16)}</span></time>
                <div>
                  <strong>{row.note || "정기 건강 기록"}</strong>
                  <div className="health-tags">
                    {row.weightKg && <span>체중 {fmt(row.weightKg, 2)}kg</span>}
                    {row.bcs && <span>BCS {row.bcs}</span>}
                    <span>식욕 {row.appetite === "good" ? "좋음" : row.appetite === "low" ? "저하" : row.appetite === "none" ? "거부" : "보통"}</span>
                    {row.vomitCount > 0 && <span className="alert">구토 {row.vomitCount}회</span>}
                    {row.stool && <span>변 {row.stool}/7</span>}
                    {row.pain && <span className="alert">통증 의심</span>}
                  </div>
                </div>
                <IconButton label="건강 기록 삭제" onClick={() => updateDb((current) => ({ ...current, healthLog: current.healthLog.filter((item) => item.id !== row.id) }), "건강 기록을 삭제했어요.")}>
                  <Trash2 size={16} />
                </IconButton>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={<HeartPulse size={28} />} title="아직 건강 기록이 없어요" description="오른쪽 위 + 버튼으로 첫 기록을 남겨보세요." />
        )}
      </div>
    </>
  );
}

function StatsPage({ db, back, home }: SharedProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDate(date);
    const feeds = dateRecords(db.feedLog, key);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      kcal: feeds.reduce((sum, item) => sum + item.calculatedKcal, 0),
      target: db.dailyPlans[key]?.targetKcal ?? 0,
    };
  });
  const max = Math.max(1, ...days.map((item) => Math.max(item.kcal, item.target)));
  const weightRows = db.healthLog.filter((item) => item.weightKg).slice(-8);
  const lastWeight = weightRows.at(-1)?.weightKg ?? db.pet.weightKg;
  const todayFeeds = dateRecords(db.feedLog, localDate());
  const protein = todayFeeds.reduce((sum, item) => sum + item.protein, 0);
  const fat = todayFeeds.reduce((sum, item) => sum + item.fat, 0);
  return (
    <div className="stats-shell">
      <PageHeader title="통계" onBack={back} onHome={home} />
      <div className="stats-content">
        <div className="stats-tabs">
          {(["daily", "weekly", "monthly"] as const).map((value) => (
            <button className={period === value ? "active" : ""} onClick={() => setPeriod(value)} key={value}>
              {value === "daily" ? "일별" : value === "weekly" ? "주별" : "월별"}
            </button>
          ))}
        </div>
        <section className="stats-card">
          <div className="stats-card-head">
            <div><span>최근 7일</span><h2>급여 열량</h2></div>
            <span className="metric-chip">목표 스냅샷 기준</span>
          </div>
          <div className="bar-chart">
            {days.map((item) => (
              <div className="bar-column" key={item.key}>
                <div className="bar-track">
                  {item.target > 0 && <span className="target-line" style={{ bottom: `${(item.target / max) * 100}%` }} />}
                  <span className={item.target > 0 && item.kcal > item.target ? "over" : ""} style={{ height: `${Math.max(3, (item.kcal / max) * 100)}%` }} />
                </div>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </section>
        <div className="stats-metrics">
          <div><span>오늘</span><strong>{fmt(todayFeeds.reduce((sum, item) => sum + item.calculatedKcal, 0))}</strong><small>kcal</small></div>
          <div><span>단백질</span><strong>{fmt(protein, 1)}</strong><small>g</small></div>
          <div><span>지방</span><strong>{fmt(fat, 1)}</strong><small>g</small></div>
        </div>
        <section className="stats-card weight-card">
          <div className="stats-card-head"><div><span>최근 기록</span><h2>체중 추이</h2></div><strong>{fmt(lastWeight, 2)} kg</strong></div>
          {weightRows.length > 1 ? (
            <div className="weight-points">
              {weightRows.map((row, index) => (
                <div key={row.id} style={{ "--weight": `${Math.max(12, 72 - ((row.weightKg ?? lastWeight) - 2) * 35)}%` } as React.CSSProperties}>
                  <span /><small>{row.datetime.slice(5, 10)}</small>{index < weightRows.length - 1 && <i />}
                </div>
              ))}
            </div>
          ) : (
            <p className="dark-empty">건강 기록에 체중을 두 번 이상 입력하면 변화가 연결됩니다.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordsPage({
  db,
  back,
  home,
  deleteFeed,
  editFeed,
  deleteMedicationLog,
}: SharedProps & {
  deleteFeed: (record: FeedRecord) => void;
  editFeed: (record: FeedRecord) => void;
  deleteMedicationLog: (log: MedicationLog) => void;
}) {
  const dates = Array.from(
    new Set([...db.feedLog.map((item) => item.datetime.slice(0, 10)), ...db.medLog.map((item) => item.datetime.slice(0, 10))]),
  ).sort((a, b) => b.localeCompare(a));
  return (
    <>
      <PageHeader title="급여 기록" onBack={back} onHome={home} />
      <div className="page-content">
        <SectionTitle title="목표량과 실제 급여량" description="수정하면 기존 재고를 복원한 뒤 새 값으로 다시 반영합니다." />
        {dates.length ? dates.map((date) => {
          const feeds = dateRecords(db.feedLog, date).sort((a, b) => a.datetime.localeCompare(b.datetime));
          const meds = dateRecords(db.medLog, date).sort((a, b) => a.datetime.localeCompare(b.datetime));
          return (
            <section className="record-day" key={date}>
              <div className="record-date"><strong>{date}</strong><span>{fmt(feeds.reduce((sum, item) => sum + item.calculatedKcal, 0))} kcal</span></div>
              {feeds.map((record) => (
                <div className="record-row" key={record.id}>
                  <div className="record-symbol"><UtensilsCrossed size={18} /></div>
                  <div><strong>{record.datetime.slice(11, 16)} · {record.label}</strong><span>목표 {fmt(record.offeredG)}g · 급여 {fmt(record.eatenG)}g · {fmt(record.calculatedKcal)}kcal</span>{feedBreakdownText(record) && <span className="breakdown">{feedBreakdownText(record)}</span>}{record.note && <small>{record.note}</small>}</div>
                  <div className="row-actions"><IconButton label="수정" onClick={() => editFeed(record)}><Edit3 size={16} /></IconButton><IconButton label="삭제" onClick={() => deleteFeed(record)}><Trash2 size={16} /></IconButton></div>
                </div>
              ))}
              {meds.map((log) => {
                const med = db.medications.find((item) => item.id === log.medicationId);
                return (
                  <div className="record-row" key={log.id}>
                    <div className="record-symbol med"><Pill size={18} /></div>
                    <div><strong>{log.datetime.slice(11, 16)} · {med?.name ?? "삭제된 항목"}</strong><span>약·영양제 급여 완료</span></div>
                    <IconButton label="체크 취소" onClick={() => deleteMedicationLog(log)}><RotateCcw size={16} /></IconButton>
                  </div>
                );
              })}
            </section>
          );
        }) : <EmptyState icon={<ClipboardList size={28} />} title="기록이 아직 없어요" description="메인 화면에서 급여와 약 체크를 시작해보세요." />}
      </div>
    </>
  );
}

function SettingsPage({
  db,
  updateDb,
  back,
  home,
  today,
  plan,
  planIsCurrent,
  applyTodayPlan,
  exportData,
  importRef,
  importData,
  authState,
  household,
  familyBusy,
  createHousehold,
  joinHousehold,
  leaveHousehold,
  refreshHousehold,
  logout,
}: SharedProps & {
  plan?: DailyPlan;
  planIsCurrent: boolean;
  applyTodayPlan: () => void;
  exportData: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
  importData: (file: File) => void;
  authState: AuthState;
  household: HouseholdInfo | null;
  familyBusy: boolean;
  createHousehold: (name: string) => void;
  joinHousehold: (inviteCode: string) => void;
  leaveHousehold: () => void;
  refreshHousehold: () => void;
  logout: () => void;
}) {
  const [pet, setPet] = useState(db.pet);
  const batch = db.batches.find((item) => item.id === pet.batchId);
  const dry = db.dryFoods.find((item) => item.id === pet.dryFoodId);
  const ratio = batch && dry ? pet.naturalRatio : batch ? 100 : 0;
  const target = pet.vetTargetKcal && pet.vetTargetKcal > 0 ? pet.vetTargetKcal : pet.dailyTargetKcal;
  const naturalKcal = target * ratio / 100;
  const dryKcal = target - naturalKcal;
  const naturalG = batch?.kcalPer100 ? naturalKcal / batch.kcalPer100 * 100 : 0;
  const dryG = dry?.kcalPer100 ? dryKcal / dry.kcalPer100 * 100 : 0;

  function saveSettings() {
    updateDb((current) => ({ ...current, pet: { ...pet, naturalRatio: ratio } }), "급여 설정을 저장했어요.");
  }
  return (
    <>
      <PageHeader title="설정" onBack={back} onHome={home} />
      <div className="page-content form-page">
        <SectionTitle title="하루 목표와 급여원을 정하세요" description="저장한 설정은 오늘 계획 적용 버튼을 눌렀을 때 날짜별 스냅샷으로 고정됩니다." />
        <section className="form-section">
          <h2>열량과 횟수</h2>
          <div className="field-grid">
            <label>보호자 목표 kcal<input type="number" value={pet.dailyTargetKcal} onChange={(e) => setPet({ ...pet, dailyTargetKcal: Number(e.target.value) })} /></label>
            <label>수의사 지정 kcal<input type="number" value={pet.vetTargetKcal ?? ""} onChange={(e) => setPet({ ...pet, vetTargetKcal: e.target.value ? Number(e.target.value) : null })} placeholder="있으면 우선 적용" /></label>
          </div>
          <label>하루 급여 횟수<input type="number" min="1" max="12" value={pet.feedingsPerDay} onChange={(e) => setPet({ ...pet, feedingsPerDay: Number(e.target.value) })} /></label>
          <button className="button secondary" onClick={() => setPet({ ...pet, dailyTargetKcal: merEstimate(pet) })}><Activity size={18} /> 참고 열량 {merEstimate(pet)}kcal 사용</button>
          <p className="form-note">참고값은 입력칸에만 반영됩니다. 아래 설정 저장 후 오늘 계획을 적용해야 사용됩니다.</p>
        </section>
        <section className="form-section">
          <h2>급여원 배분</h2>
          <label>자연식<select value={pet.batchId} onChange={(e) => setPet({ ...pet, batchId: e.target.value })}><option value="">사용 안 함</option>{db.batches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>시중사료<select value={pet.dryFoodId} onChange={(e) => setPet({ ...pet, dryFoodId: e.target.value })}><option value="">사용 안 함</option>{db.dryFoods.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          {!batch && !dry && <div className="inline-alert"><ShieldAlert size={18} /> 자연식 또는 시중사료를 하나 이상 선택해야 합니다.</div>}
          <label className="range-label">자연식 비율 <strong>{ratio}%</strong><input type="range" min="0" max="100" step="5" value={ratio} disabled={!batch || !dry} onChange={(e) => setPet({ ...pet, naturalRatio: Number(e.target.value) })} /></label>
          <p className="form-note">{batch && !dry ? "자연식만 선택되어 100%로 고정됩니다." : !batch && dry ? "건식만 선택되어 0%로 고정됩니다." : "두 급여원을 모두 선택했을 때만 비율을 조정할 수 있습니다."}</p>
          <div className="plan-preview">
            <div><span>하루 총량</span><strong>자연식 {fmt(naturalG, 1)}g · 사료 {fmt(dryG, 1)}g</strong></div>
            <div><span>1회분</span><strong>자연식 {fmt(naturalG / pet.feedingsPerDay, 1)}g · 사료 {fmt(dryG / pet.feedingsPerDay, 1)}g</strong></div>
          </div>
          <button className="button primary full" onClick={saveSettings}><Save size={18} /> 설정 저장</button>
          <button className={`button full ${plan && planIsCurrent ? "success" : "ink"}`} onClick={applyTodayPlan}>
            {plan && planIsCurrent ? <Check size={18} /> : <CalendarDays size={18} />}
            {!plan ? "설정한 계획을 오늘에 적용" : planIsCurrent ? "오늘 계획 적용 완료" : "변경된 설정으로 오늘 계획 업데이트"}
          </button>
          {plan && <p className="form-note">{today} · 목표 {fmt(plan.targetKcal)}kcal · {plan.feedings}회 스냅샷</p>}
        </section>
        <section className="form-section">
          <h2>데이터 백업</h2>
          <p className="form-note">기록은 이 브라우저에 저장됩니다. 기기를 바꾸기 전 JSON 백업을 내려받으세요.</p>
          <div className="button-grid">
            <button className="button secondary" onClick={exportData}><Download size={18} /> 내보내기</button>
            <button className="button secondary" onClick={() => importRef.current?.click()}><Upload size={18} /> 가져오기</button>
          </div>
          <input ref={importRef} className="hidden-input" type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </section>
        <FamilySharingSection
          authState={authState}
          household={household}
          busy={familyBusy}
          onCreate={createHousehold}
          onJoin={joinHousehold}
          onLeave={leaveHousehold}
          onAuthChange={refreshHousehold}
          onLogout={logout}
        />
        <section className="form-section danger-zone">
          <h2>전체 초기화</h2>
          <button className="button danger" onClick={() => {
            if (!window.confirm("모든 기록을 초기화할까요? 되돌릴 수 없습니다.")) return;
            updateDb(() => defaultDatabase(), "초기 예시 상태로 되돌렸어요.");
          }}><Trash2 size={18} /> 모든 데이터 초기화</button>
        </section>
      </div>
    </>
  );
}

function FamilySharingSection({
  authState,
  household,
  busy,
  onCreate,
  onJoin,
  onLeave,
  onAuthChange,
  onLogout,
}: {
  authState: AuthState;
  household: HouseholdInfo | null;
  busy: boolean;
  onCreate: (name: string) => void;
  onJoin: (inviteCode: string) => void;
  onLeave: () => void;
  onAuthChange: () => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState("우리 가족");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  function copyInviteCode() {
    if (!household) return;
    navigator.clipboard?.writeText(household.inviteCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <section className="form-section">
      <h2><Users size={18} /> 가족 공유</h2>
      {authState === "checking" && <p className="form-note">로그인 상태를 확인하는 중…</p>}
      {authState === "signed-out" && <AuthForm onAuthChange={onAuthChange} />}
      {authState === "signed-in" && !household && (
        <>
          <p className="form-note">
            아직 공유 중인 가족이 없어요. 새로 만들거나, 다른 가족이 준 초대 코드로 참여하세요.
          </p>
          <div className="field-grid">
            <label>
              가족 이름
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="우리 가족" />
            </label>
          </div>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => onCreate(name.trim() || "우리 가족")}
          >
            <Users size={18} /> 가족 만들기 (지금 기록으로 시작)
          </button>
          <div className="field-grid">
            <label>
              초대 코드
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="예: AB12CD"
              />
            </label>
          </div>
          <button
            className="button secondary full"
            disabled={busy || !code.trim()}
            onClick={() => onJoin(code.trim())}
          >
            초대 코드로 참여하기
          </button>
          <p className="form-note">
            가족을 만들면 지금 이 기기의 기록이 그대로 공유 데이터의 시작점이 되고, 초대 코드로
            참여하면 그 가족의 기존 기록으로 이 기기 내용이 바뀌어요.
          </p>
        </>
      )}
      {authState === "signed-in" && household && (
        <>
          <div className="plan-preview">
            <div>
              <span>가족 이름</span>
              <strong>{household.name}</strong>
            </div>
            <div>
              <span>초대 코드</span>
              <strong className="invite-code">{household.inviteCode}</strong>
            </div>
          </div>
          <button className="button secondary full" onClick={copyInviteCode}>
            <Copy size={18} /> {copied ? "복사했어요" : "초대 코드 복사"}
          </button>
          <div className="menu-group">
            {household.members.map((member) => (
              <div className="menu-row" key={member.email}>
                <span className="menu-icon"><Users size={18} /></span>
                <span>
                  <strong>{member.displayName ?? member.email}</strong>
                  <small>{member.role === "owner" ? "만든 사람" : "구성원"}</small>
                </span>
              </div>
            ))}
          </div>
          <p className="form-note">
            다른 가족이 기록을 바꾸면 몇 초 안에 이 화면에도 자동으로 반영돼요.
          </p>
          <button className="button danger full" disabled={busy} onClick={onLeave}>
            <LogOut size={18} /> 가족 공유 나가기
          </button>
        </>
      )}
      {authState === "signed-in" && (
        <button className="button secondary full" onClick={onLogout}>
          <LogOut size={18} /> 로그아웃
        </button>
      )}
    </section>
  );
}

function AuthForm({ onAuthChange }: { onAuthChange: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, password, displayName },
        ),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "처리하지 못했어요. 다시 시도해주세요.");
        return;
      }
      onAuthChange();
    } catch {
      setError("네트워크 오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="form-note">
        가족과 기록을 함께 보려면 먼저 로그인해주세요. 계정이 없다면 회원가입으로 새로 만들 수
        있어요.
      </p>
      <div className="tab-toggle">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          onClick={() => {
            setMode("signup");
            setError("");
          }}
        >
          회원가입
        </button>
      </div>
      {mode === "signup" && (
        <label>
          이름(표시용)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="예: 욱환"
          />
        </label>
      )}
      <label>
        이메일
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "8자 이상" : ""}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
      </label>
      {error && (
        <div className="inline-alert">
          <ShieldAlert size={18} /> {error}
        </div>
      )}
      <button className="button primary full" type="submit" disabled={busy}>
        {mode === "login" ? "로그인" : "회원가입"}
      </button>
    </form>
  );
}

function FeedSheet({
  plan,
  serving,
  onClose,
  onSave,
}: {
  plan: DailyPlan;
  serving: { naturalG: number; dryG: number };
  onClose: () => void;
  onSave: (values: {
    naturalOfferedG: number;
    naturalEatenG: number;
    dryOfferedG: number;
    dryEatenG: number;
    note: string;
    time: string;
  }) => void;
}) {
  const [naturalOfferedG, setNaturalOfferedG] = useState(Math.round(serving.naturalG));
  const [naturalEatenG, setNaturalEatenG] = useState(Math.round(serving.naturalG));
  const [naturalEatenTouched, setNaturalEatenTouched] = useState(false);
  const [dryOfferedG, setDryOfferedG] = useState(Math.round(serving.dryG));
  const [dryEatenG, setDryEatenG] = useState(Math.round(serving.dryG));
  const [dryEatenTouched, setDryEatenTouched] = useState(false);
  const [note, setNote] = useState("");

  // 목표량(낸 양)을 바꿀 때, 급여량(먹은 양)을 사용자가 따로 건드린 적이 없다면
  // 함께 따라가게 한다. 이미 급여량을 직접 수정한 경우에는 그 값을 그대로 둔다.
  // 저울에서 소수점은 보이지 않으니 항상 정수 그램으로 반올림한다.
  function changeNaturalOffered(value: number) {
    const rounded = Math.round(value);
    setNaturalOfferedG(rounded);
    if (!naturalEatenTouched) setNaturalEatenG(rounded);
  }
  function changeNaturalEaten(value: number) {
    setNaturalEatenTouched(true);
    setNaturalEatenG(Math.round(value));
  }
  function changeDryOffered(value: number) {
    const rounded = Math.round(value);
    setDryOfferedG(rounded);
    if (!dryEatenTouched) setDryEatenG(rounded);
  }
  function changeDryEaten(value: number) {
    setDryEatenTouched(true);
    setDryEatenG(Math.round(value));
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="급여량 수정">
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><div><span className="eyebrow">이번 끼니</span><h2>목표량과 급여량</h2></div><IconButton label="닫기" onClick={onClose}><X size={20} /></IconButton></div>
        {plan.batchId && <div className="sheet-source"><strong>자연식</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={naturalOfferedG} onChange={(e) => changeNaturalOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={naturalEatenG} onChange={(e) => changeNaturalEaten(Number(e.target.value))} /></label></div></div>}
        {plan.dryFoodId && <div className="sheet-source"><strong>시중사료</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={dryOfferedG} onChange={(e) => changeDryOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={dryEatenG} onChange={(e) => changeDryEaten(Number(e.target.value))} /></label></div></div>}
        <label>메모<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="남긴 이유, 식욕 등" /></label>
        <button className="button primary full" onClick={() => onSave({ naturalOfferedG, naturalEatenG, dryOfferedG, dryEatenG, note, time: localTime() })}>급여 기록 저장</button>
      </div>
    </div>
  );
}

function FeedEditor({
  record,
  onClose,
  onSave,
}: {
  record: FeedRecord;
  onClose: () => void;
  onSave: (values: {
    datetime: string;
    offeredG: number;
    eatenG: number;
    note: string;
    naturalOfferedG?: number;
    naturalEatenG?: number;
    dryOfferedG?: number;
    dryEatenG?: number;
  }) => void;
}) {
  // 자연식과 사료가 둘 다 있는 혼합(plan) 기록은 각각 따로 수정할 수 있게 하고,
  // 급여원이 하나뿐인 기록은 기존처럼 목표량/급여량 한 쌍만 보여준다.
  const isMixed = Boolean(record.batchId) && Boolean(record.dryFoodId);
  const [datetime, setDatetime] = useState(record.datetime);
  const [note, setNote] = useState(record.note);

  const [offeredG, setOfferedG] = useState(Math.round(record.offeredG));
  const [eatenG, setEatenG] = useState(Math.round(record.eatenG));
  const [eatenTouched, setEatenTouched] = useState(record.offeredG !== record.eatenG);
  function changeOffered(value: number) {
    const rounded = Math.round(value);
    setOfferedG(rounded);
    if (!eatenTouched) setEatenG(rounded);
  }
  function changeEaten(value: number) {
    setEatenTouched(true);
    setEatenG(Math.round(value));
  }

  const [naturalOfferedG, setNaturalOfferedG] = useState(Math.round(record.naturalOfferedG ?? 0));
  const [naturalEatenG, setNaturalEatenG] = useState(Math.round(record.naturalEatenG ?? 0));
  const [naturalEatenTouched, setNaturalEatenTouched] = useState(
    (record.naturalOfferedG ?? 0) !== (record.naturalEatenG ?? 0),
  );
  function changeNaturalOffered(value: number) {
    const rounded = Math.round(value);
    setNaturalOfferedG(rounded);
    if (!naturalEatenTouched) setNaturalEatenG(rounded);
  }
  function changeNaturalEaten(value: number) {
    setNaturalEatenTouched(true);
    setNaturalEatenG(Math.round(value));
  }

  const [dryOfferedG, setDryOfferedG] = useState(Math.round(record.dryOfferedG ?? 0));
  const [dryEatenG, setDryEatenG] = useState(Math.round(record.dryEatenG ?? 0));
  const [dryEatenTouched, setDryEatenTouched] = useState(
    (record.dryOfferedG ?? 0) !== (record.dryEatenG ?? 0),
  );
  function changeDryOffered(value: number) {
    const rounded = Math.round(value);
    setDryOfferedG(rounded);
    if (!dryEatenTouched) setDryEatenG(rounded);
  }
  function changeDryEaten(value: number) {
    setDryEatenTouched(true);
    setDryEatenG(Math.round(value));
  }

  function submit() {
    // 목표량(계획된 양)과 급여량(실제로 준 양)은 서로 다른 값일 수 있으므로
    // 급여량을 목표량으로 강제로 깎지 않는다.
    if (isMixed) {
      const totalOffered = naturalOfferedG + dryOfferedG;
      const totalEaten = naturalEatenG + dryEatenG;
      onSave({
        datetime,
        note,
        offeredG: totalOffered,
        eatenG: totalEaten,
        naturalOfferedG,
        naturalEatenG,
        dryOfferedG,
        dryEatenG,
      });
    } else {
      onSave({ datetime, note, offeredG, eatenG });
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="급여 기록 수정">
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><div><span className="eyebrow">기록 수정</span><h2>{record.label}</h2></div><IconButton label="닫기" onClick={onClose}><X size={20} /></IconButton></div>
        <label>날짜와 시간<input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} /></label>
        {isMixed ? (
          <>
            <div className="sheet-source"><strong>자연식</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={naturalOfferedG} onChange={(e) => changeNaturalOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={naturalEatenG} onChange={(e) => changeNaturalEaten(Number(e.target.value))} /></label></div></div>
            <div className="sheet-source"><strong>시중사료</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={dryOfferedG} onChange={(e) => changeDryOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={dryEatenG} onChange={(e) => changeDryEaten(Number(e.target.value))} /></label></div></div>
          </>
        ) : (
          <div className="field-grid"><label>목표량(g)<input type="number" step="1" value={offeredG} onChange={(e) => changeOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={eatenG} onChange={(e) => changeEaten(Number(e.target.value))} /></label></div>
        )}
        <label>메모<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="button primary full" onClick={submit}>수정 내용 저장</button>
      </div>
    </div>
  );
}
