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
  ChevronsUpDown,
  ClipboardList,
  Cookie,
  Download,
  Edit3,
  HeartPulse,
  Home,
  Mail,
  PackageCheck,
  PawPrint,
  Pill,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Smartphone,
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
  useCallback,
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
  | "pet-add"
  | "natural"
  | "dry"
  | "snacks"
  | "plan"
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

export type Pet = {
  id: string;
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

export type Batch = {
  id: string;
  petId: string;
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

export type DryFood = {
  id: string;
  petId: string;
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

export type Snack = {
  id: string;
  petId: string;
  name: string;
  totalWeight: number;
  usedWeight: number;
  kcalPer100: number;
  protein: number;
  fat: number;
  carb: number;
};

export type Medication = {
  id: string;
  petId: string;
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

export type FeedRecord = {
  id: string;
  petId: string;
  datetime: string;
  label: string;
  source: "plan" | "batch" | "dry" | "custom" | "snack";
  offeredG: number;
  eatenG: number;
  calculatedKcal: number;
  protein: number;
  fat: number;
  carb?: number;
  note: string;
  batchId?: string;
  dryFoodId?: string;
  snackId?: string;
  naturalOfferedG?: number;
  naturalEatenG?: number;
  dryOfferedG?: number;
  dryEatenG?: number;
  naturalKcalPer100?: number;
  dryKcalPer100?: number;
};

export type MedicationLog = {
  id: string;
  petId: string;
  medicationId: string;
  datetime: string;
  stockUsed: number;
};

export type HealthRecord = {
  id: string;
  petId: string;
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

export type DailyPlan = {
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

// 4단계(다견 지원): 실제로 저장·동기화되는 형태는 항상 이 멀티펫 구조다.
// dailyPlans는 날짜만으로는 반려동물을 구분할 수 없으므로 `${petId}:${date}`
// 복합 키로 저장한다(예: "pet-abc123:2026-07-24").
export type Database = {
  schemaVersion: number;
  pets: Pet[];
  batches: Batch[];
  dryFoods: DryFood[];
  snacks: Snack[];
  medications: Medication[];
  feedLog: FeedRecord[];
  medLog: MedicationLog[];
  healthLog: HealthRecord[];
  dailyPlans: Record<string, DailyPlan>;
};

// 대부분의 화면(오늘/기록/건강/통계/자연식/사료/간식/약)은 "지금 선택된
// 반려동물" 하나만 알면 된다. 그래서 기존 컴포넌트들이 원래 쓰던 모양
// (pet 단수 + 이 반려동물의 기록만 담긴 배열, dailyPlans는 date로만 키)을
// 그대로 유지하는 파생 뷰 타입을 따로 둔다. 실제 저장·동기화 대상은 항상
// 위의 멀티펫 Database이고, 이 타입은 최상위 컴포넌트가 활성 반려동물
// 기준으로 파생시켜 화면에 내려줄 때만 쓴다.
export type PetView = {
  schemaVersion: number;
  pet: Pet;
  batches: Batch[];
  dryFoods: DryFood[];
  snacks: Snack[];
  medications: Medication[];
  feedLog: FeedRecord[];
  medLog: MedicationLog[];
  healthLog: HealthRecord[];
  dailyPlans: Record<string, DailyPlan>;
};

// 가족 공유(household) 관련 타입. 실제 데이터는 서버(D1)의 households.data에
// Database 통째로 저장되고, 이 클라이언트는 주기적으로 가져오고(pull) 저장(push)한다.
type HouseholdMember = {
  userId: string | null;
  email: string;
  displayName: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

type HouseholdInfo = {
  id: string;
  name: string;
  dataVersion: number;
  updatedAt: string;
  updatedByEmail?: string | null;
  role: "owner" | "member";
  members: HouseholdMember[];
};

// household_invitations 한 건을 화면에 보여주기 위한 형태(토큰 원본/해시는
// 서버가 애초에 응답에 포함하지 않는다).
type HouseholdInvitation = {
  id: string;
  email: string;
  role: "owner" | "member";
  createdAt: string;
  expiresAt: string;
  status: "pending" | "sent_pending" | "expired" | "cancelled" | "accepted";
};

type AuthState = "checking" | "signed-out" | "signed-in";

const STORAGE_KEY = "petDietManager";
const LEGACY_KEY = "dogDietApp_v1";
// 지금 선택된 반려동물은 기기별 UI 상태라 STORAGE_KEY(가족과 동기화되는
// 본체 데이터)와는 별도의 키에 저장한다. 그래야 반려동물을 전환해도 다른
// 가족 구성원의 화면이 강제로 전환되지 않는다.
const ACTIVE_PET_KEY = "petDietManager_activePetId";

// PWA: 오프라인 상태를 알리는 동시에 "왜 지금 저장이 안 되는지"까지 설명하는
// 문구. 상단 배너와, 오프라인 중 저장을 시도했을 때 뜨는 토스트에 그대로 재사용한다.
const OFFLINE_MESSAGE =
  "인터넷 연결이 끊겼어요. 기존 화면은 볼 수 있지만 새 기록은 저장할 수 없어요.";

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
  { name: "두부", grams: 0, kcalPer100: 50, protein: 5.6, fat: 3.4, carb: 0.8 },
  { name: "순두부", grams: 0, kcalPer100: 40, protein: 4, fat: 2.7, carb: 0.9 },
  { name: "연두부", grams: 0, kcalPer100: 45, protein: 5.7, fat: 2.6, carb: 0.9 },
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

export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fmt(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// 반려동물 한 마리의 빈 프로필. id는 호출할 때마다 새로 만들어지므로,
// 이미 저장된 데이터를 다시 정규화할 때는 이 함수를 쓰지 않는다(그러면
// 매번 새 id가 생겨 반려동물이 중복되는 문제가 생긴다). 정말 "새 반려동물"을
// 만들 때만 쓴다.
export function emptyPet(id: string = uid("pet")): Pet {
  return {
    id,
    name: "",
    birthdate: "",
    sex: "female-neutered",
    registrationNo: "",
    weightKg: 0,
    targetWeightKg: null,
    activity: "normal",
    condition: "none",
    weightGoal: "maintain",
    dailyTargetKcal: 0,
    vetTargetKcal: null,
    feedingsPerDay: 3,
    fatLimitG: null,
    naturalRatio: 100,
    batchId: "",
    dryFoodId: "",
    photoDataUrl: null,
  };
}

// 로그인 전/데이터가 없는 상태, 그리고 설정 화면의 "전체 초기화"는 예시(샘플)
// 데이터가 아니라 반려동물 프로필까지 포함해 정말로 아무것도 없는 빈 상태여야
// 한다. 그래서 빈 데이터를 만드는 함수를 하나만 둔다. 4단계(다견 지원)부터는
// 빈 상태도 "반려동물 한 마리"로 시작한다(0마리 상태는 UI에서 만들지 않음).
export function emptyDatabase(): Database {
  return {
    schemaVersion: 4,
    pets: [emptyPet()],
    batches: [],
    dryFoods: [],
    snacks: [],
    medications: [],
    feedLog: [],
    medLog: [],
    healthLog: [],
    dailyPlans: {},
  };
}

// updateDb 콜백 안에서 "지금 활성화된 반려동물"만 patch하고 나머지 반려동물은
// 그대로 두기 위한 헬퍼. petId가 pets 배열에 없으면 아무 것도 바꾸지 않는다.
function withPet(database: Database, petId: string, patch: (pet: Pet) => Pet): Database {
  return {
    ...database,
    pets: database.pets.map((item) => (item.id === petId ? patch(item) : item)),
  };
}

// db(항상 전체 멀티펫 데이터)에서 지금 선택된 반려동물 하나만 남긴 뷰를
// 만든다. 기존 단일-반려동물 시절 컴포넌트들이 그대로 쓸 수 있도록
// PetView 모양(pet 단수 + 이 반려동물의 기록만 담긴 배열)으로 파생시킨다.
// 순수 함수로 분리해 두어야 petId별 격리 로직을 컴포넌트 없이도 검증할 수 있다.
export function buildPetView(database: Database, petId: string): PetView {
  const pet = database.pets.find((item) => item.id === petId) ?? database.pets[0] ?? emptyPet(petId || undefined);
  const resolvedId = pet.id;
  return {
    schemaVersion: database.schemaVersion,
    pet,
    batches: database.batches.filter((item) => item.petId === resolvedId),
    dryFoods: database.dryFoods.filter((item) => item.petId === resolvedId),
    snacks: database.snacks.filter((item) => item.petId === resolvedId),
    medications: database.medications.filter((item) => item.petId === resolvedId),
    feedLog: database.feedLog.filter((item) => item.petId === resolvedId),
    medLog: database.medLog.filter((item) => item.petId === resolvedId),
    healthLog: database.healthLog.filter((item) => item.petId === resolvedId),
    dailyPlans: Object.fromEntries(
      Object.entries(database.dailyPlans)
        .filter(([key]) => key.startsWith(`${resolvedId}:`))
        .map(([key, plan]) => [key.slice(resolvedId.length + 1), plan]),
    ),
  };
}

// 반려동물 삭제: 마지막 한 마리는 차단하고(원본 그대로 반환), 그 반려동물이
// 걸려있는 급여·재고·건강·계획 기록도 함께 지운다. 다른 반려동물의 기록은
// 절대 건드리지 않는다.
export function cascadeDeletePet(database: Database, petId: string): Database {
  if (database.pets.length <= 1) return database;
  const prefix = `${petId}:`;
  return {
    ...database,
    pets: database.pets.filter((item) => item.id !== petId),
    batches: database.batches.filter((item) => item.petId !== petId),
    dryFoods: database.dryFoods.filter((item) => item.petId !== petId),
    snacks: database.snacks.filter((item) => item.petId !== petId),
    medications: database.medications.filter((item) => item.petId !== petId),
    feedLog: database.feedLog.filter((item) => item.petId !== petId),
    medLog: database.medLog.filter((item) => item.petId !== petId),
    healthLog: database.healthLog.filter((item) => item.petId !== petId),
    dailyPlans: Object.fromEntries(
      Object.entries(database.dailyPlans).filter(([key]) => !key.startsWith(prefix)),
    ),
  };
}

// 앱에서 쓰는 모든 수량(그램·kcal·재고·횟수 등)은 음수가 될 수 없다.
// 유한하지 않은 값(NaN·Infinity)은 fallback으로, 음수는 0으로 강제해서
// 저장 단계에서 음수 입력이 재고를 오히려 늘리거나 섭취 열량을 음수로
// 만드는 걸 막는다.
export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed < 0 ? 0 : parsed;
}

// 컨트롤드 입력(state)에서 직접 Number()로 변환하는 지점(폼 제출을 거치지
// 않는 실시간 입력)에도 동일한 규칙을 적용하기 위한 헬퍼.
export function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// v4(다견) 백업/동기화 데이터에 이미 들어있는 반려동물 배열을 정규화한다.
// 각 반려동물의 id는 그대로 보존한다 — 여기서 새 id를 만들면 재정규화할
// 때마다(예: 저장→불러오기 왕복) 반려동물이 중복 생성된다.
function parsePets(rawPets: unknown): Pet[] {
  if (!Array.isArray(rawPets) || rawPets.length === 0) return [emptyPet()];
  return (rawPets as Record<string, unknown>[]).map((p) => ({
    id: String(p.id ?? uid("pet")),
    name: String(p.name ?? ""),
    birthdate: String(p.birthdate ?? ""),
    weightKg: toNumber(p.weightKg),
    targetWeightKg: p.targetWeightKg ? toNumber(p.targetWeightKg) : null,
    activity: (p.activity as Pet["activity"]) ?? "normal",
    condition: (p.condition as Pet["condition"]) ?? "none",
    weightGoal: (p.weightGoal as Pet["weightGoal"]) ?? "maintain",
    dailyTargetKcal: toNumber(p.dailyTargetKcal),
    vetTargetKcal: p.vetTargetKcal ? toNumber(p.vetTargetKcal) : null,
    feedingsPerDay: Math.max(1, toNumber(p.feedingsPerDay, 3)),
    fatLimitG: p.fatLimitG ? toNumber(p.fatLimitG) : null,
    naturalRatio: toNumber(p.naturalRatio, 100),
    batchId: String(p.batchId ?? ""),
    dryFoodId: String(p.dryFoodId ?? ""),
    sex: (p.sex as Pet["sex"]) ?? "female-neutered",
    registrationNo: String(p.registrationNo ?? ""),
    photoDataUrl: typeof p.photoDataUrl === "string" ? p.photoDataUrl : null,
  }));
}

function parseBatches(raw: unknown, fallbackPetId: string): Batch[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((b) => ({
    id: String(b.id ?? uid("batch")),
    petId: String(b.petId ?? fallbackPetId),
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
  }));
}

function parseDryFoods(raw: unknown, fallbackPetId: string): DryFood[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((d) => ({
    id: String(d.id ?? uid("dry")),
    petId: String(d.petId ?? fallbackPetId),
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
  }));
}

function parseSnacks(raw: unknown, fallbackPetId: string): Snack[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((s) => ({
    id: String(s.id ?? uid("snack")),
    petId: String(s.petId ?? fallbackPetId),
    name: String(s.name ?? "간식"),
    totalWeight: toNumber(s.totalWeight),
    usedWeight: toNumber(s.usedWeight),
    kcalPer100: toNumber(s.kcalPer100),
    protein: toNumber(s.protein),
    fat: toNumber(s.fat),
    carb: toNumber(s.carb),
  }));
}

function parseMedications(raw: unknown, fallbackPetId: string): Medication[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((m) => ({
    id: String(m.id ?? uid("med")),
    petId: String(m.petId ?? fallbackPetId),
    type: (m.type === "med" ? "med" : "supplement") as Medication["type"],
    name: String(m.name ?? "약/영양제"),
    prescribedDate: String(m.prescribedDate ?? ""),
    dose: String(m.dose ?? ""),
    perDay: Math.max(1, toNumber(m.perDay, 1)),
    stock: toNumber(m.stock),
    stockUnit: String(m.stockUnit ?? "회분"),
    // 1회당 차감량은 등록·수정·급여 완료 어디서든 0 이하가 될 수 없다.
    // 예전 백업 데이터에 0·음수·빈 값이 남아있어도 여기서 안전한 기본값(1)로 대체한다.
    stockPerDose: toNumber(m.stockPerDose) > 0 ? toNumber(m.stockPerDose) : 1,
    memo: String(m.memo ?? ""),
  }));
}

function parseFeedLog(raw: unknown, fallbackPetId: string): FeedRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((f) => {
    const grams = toNumber(f.grams);
    return {
      id: String(f.id ?? uid("feed")),
      petId: String(f.petId ?? fallbackPetId),
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
      carb: f.carb !== undefined ? toNumber(f.carb) : undefined,
      note: String(f.note ?? ""),
      batchId: f.batchId ? String(f.batchId) : undefined,
      dryFoodId: f.dryFoodId ? String(f.dryFoodId) : undefined,
      snackId: f.snackId ? String(f.snackId) : undefined,
      naturalOfferedG: toNumber(f.naturalOfferedG ?? f.natGrams),
      naturalEatenG: toNumber(f.naturalEatenG ?? f.natGrams),
      dryOfferedG: toNumber(f.dryOfferedG ?? f.dryGrams),
      dryEatenG: toNumber(f.dryEatenG ?? f.dryGrams),
      naturalKcalPer100: toNumber(f.naturalKcalPer100),
      dryKcalPer100: toNumber(f.dryKcalPer100),
    };
  });
}

function parseMedLog(raw: unknown, fallbackPetId: string): MedicationLog[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((m) => ({
    id: String(m.id ?? uid("medlog")),
    petId: String(m.petId ?? fallbackPetId),
    medicationId: String(m.medicationId ?? m.medId ?? ""),
    datetime: String(m.datetime ?? `${localDate()}T${localTime()}`),
    stockUsed: toNumber(m.stockUsed, 0),
  }));
}

function parseHealthLog(raw: unknown, fallbackPetId: string): HealthRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((h) => ({
    id: String(h.id ?? uid("health")),
    petId: String(h.petId ?? fallbackPetId),
    datetime: String(h.datetime ?? `${localDate()}T${localTime()}`),
    weightKg: h.weightKg ? toNumber(h.weightKg) : null,
    bcs: h.bcs ? toNumber(h.bcs) : null,
    appetite: (h.appetite as HealthRecord["appetite"]) ?? "normal",
    vomitCount: toNumber(h.vomitCount),
    stool: h.stool ? toNumber(h.stool) : null,
    vitality: (h.vitality as HealthRecord["vitality"]) ?? "normal",
    pain: Boolean(h.pain),
    note: String(h.note ?? ""),
  }));
}

// dailyPlans는 날짜만으로는 반려동물을 구분할 수 없어 `${petId}:${date}`
// 복합 키로 저장한다. 이미 v4(복합 키) 데이터면 그대로 두고, v3 이하(날짜만
// 키였던) 데이터면 fallbackPetId를 붙여 옮긴다.
function parseDailyPlans(
  raw: unknown,
  fallbackPetId: string,
  alreadyComposite: boolean,
): Record<string, DailyPlan> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, DailyPlan>;
  if (alreadyComposite) return { ...source };
  const result: Record<string, DailyPlan> = {};
  for (const [date, plan] of Object.entries(source)) {
    result[`${fallbackPetId}:${date}`] = plan;
  }
  return result;
}

export function normalizeDatabase(raw: unknown): Database {
  // 예시(사실상 실제 시드) 데이터가 아니라 빈 상태를 기준으로 정규화한다.
  // 그래야 로그인 전이나 데이터가 없는 상태에서 "봄이" 샘플이 섞여 들어가지 않는다.
  const base = emptyDatabase();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Record<string, unknown>;

  if (Array.isArray(source.pets)) {
    // 이미 4단계(다견) 구조 — 반려동물 id를 그대로 보존하고, 기록에 이미
    // 붙어있는 petId도 그대로 쓴다. 여기서 새 id를 만들지 않아야 백업을
    // 내보냈다가 다시 불러오거나, 이미 마이그레이션된 데이터를 다시
    // 정규화해도 반려동물이나 기록이 중복되지 않는다.
    const pets = parsePets(source.pets);
    const fallbackPetId = pets[0].id;
    return {
      schemaVersion: 4,
      pets,
      batches: parseBatches(source.batches, fallbackPetId),
      dryFoods: parseDryFoods(source.dryFoods, fallbackPetId),
      snacks: parseSnacks(source.snacks, fallbackPetId),
      medications: parseMedications(source.medications ?? source.meds, fallbackPetId),
      feedLog: parseFeedLog(source.feedLog, fallbackPetId),
      medLog: parseMedLog(source.medLog, fallbackPetId),
      healthLog: parseHealthLog(source.healthLog ?? source.symptomLog, fallbackPetId),
      dailyPlans: parseDailyPlans(source.dailyPlans, fallbackPetId, true),
    };
  }

  // v3 이하(단일 반려동물) 또는 그보다 예전 레거시(dog) 구조. 반려동물
  // 하나로 취급하고, 새 petId를 하나만 만들어 이 반려동물과 기존의 모든
  // 기록·재고·계획에 동일하게 연결한다. 이 분기는 raw에 pets 배열이 없을
  // 때만 타므로, 한 번 4단계로 옮겨진 데이터를 다시 정규화해도 여기로
  // 다시 들어오지 않는다(=반려동물이 중복 생성되지 않는다).
  const legacyDog = (source.dog ?? source.pet ?? {}) as Record<string, unknown>;
  const petId = String(legacyDog.id ?? uid("pet"));
  const pet: Pet = {
    id: petId,
    name: String(legacyDog.name ?? ""),
    birthdate: String(legacyDog.birthdate ?? ""),
    weightKg: toNumber(legacyDog.weightKg),
    targetWeightKg: legacyDog.idealWeightKg
      ? toNumber(legacyDog.idealWeightKg)
      : ((legacyDog.targetWeightKg as number | null) ?? null),
    activity: (legacyDog.activity as Pet["activity"]) ?? "normal",
    condition:
      legacyDog.disease === "chronic" || legacyDog.disease === "acute"
        ? (legacyDog.disease as Pet["condition"])
        : ((legacyDog.condition as Pet["condition"]) ?? "none"),
    weightGoal: (legacyDog.weightGoal as Pet["weightGoal"]) ?? "maintain",
    dailyTargetKcal: toNumber(legacyDog.dailyTargetKcal),
    vetTargetKcal: legacyDog.vetTargetKcal ? toNumber(legacyDog.vetTargetKcal) : null,
    feedingsPerDay: Math.max(1, toNumber(legacyDog.feedingsPerDay, 3)),
    fatLimitG: legacyDog.fatLimitG ? toNumber(legacyDog.fatLimitG) : null,
    naturalRatio: toNumber(legacyDog.feedNatRatio ?? legacyDog.naturalRatio, 100),
    batchId: String(legacyDog.feedBatchId ?? legacyDog.batchId ?? ""),
    dryFoodId: String(legacyDog.feedDryId ?? legacyDog.dryFoodId ?? ""),
    sex: (legacyDog.sex as Pet["sex"]) ?? "female-neutered",
    registrationNo: String(legacyDog.registrationNo ?? ""),
    photoDataUrl: typeof legacyDog.photoDataUrl === "string" ? legacyDog.photoDataUrl : null,
  };

  return {
    schemaVersion: 4,
    pets: [pet],
    batches: Array.isArray(source.batches) ? parseBatches(source.batches, petId) : base.batches,
    dryFoods: Array.isArray(source.dryFoods) ? parseDryFoods(source.dryFoods, petId) : base.dryFoods,
    snacks: Array.isArray(source.snacks) ? parseSnacks(source.snacks, petId) : base.snacks,
    medications: Array.isArray(source.medications ?? source.meds)
      ? parseMedications(source.medications ?? source.meds, petId)
      : base.medications,
    feedLog: parseFeedLog(source.feedLog, petId),
    medLog: parseMedLog(source.medLog, petId),
    healthLog: parseHealthLog(source.healthLog ?? source.symptomLog, petId),
    dailyPlans: parseDailyPlans(source.dailyPlans, petId, false),
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

export function effectiveTarget(pet: Pet) {
  return pet.vetTargetKcal && pet.vetTargetKcal > 0
    ? pet.vetTargetKcal
    : pet.dailyTargetKcal;
}

export function merEstimate(pet: Pet) {
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

export function remaining(total: number, used: number) {
  return Math.max(0, total - used);
}

// 약·영양제 1회당 차감량은 재고 관리의 기준이 되는 값이라, 0이면 재고가
// 전혀 줄지 않는데도 "급여 완료" 처리가 가능해지는 문제가 생긴다. 그래서
// 등록·수정·급여 완료 어디서든 이 함수 하나로 동일한 규칙을 적용한다:
// 유한한 값이면서 0보다 커야 유효하다(소수점은 허용).
export function isValidStockPerDose(value: unknown): boolean {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

// 0.2·0.25처럼 소수점 차감량을 반복해서 빼거나 더하면 부동소수점 오차로
// 9.799999999999999 같은 값이 그대로 저장·표시될 수 있다. 재고 값을 쓸
// 때마다 소수 3자리로 반올림해 화면에 지저분한 값이 노출되지 않게 한다.
export function roundTo(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// 약·영양제를 1회 급여 완료 처리할 때 재고에서 실제로 빼는 양을 계산하는
// 순수 함수. 부동소수점 오차가 쌓이지 않도록 항상 roundTo를 거친다.
export function applyMedicationDose(stock: number, stockPerDose: number) {
  return roundTo(Math.max(0, stock - stockPerDose));
}

export function planSettingsHash(db: PetView) {
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

export function createPlanSnapshot(db: PetView, date: string): DailyPlan | null {
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

// 먹은 양(eatenG)이 0g이어도 "급여를 기록했다"는 이유만으로 무조건 완료로
// 취급하면, 실제로는 안 먹었는데 완료로 보이는 오해가 생긴다. 그래서 목표량
// 대비 먹은 양을 기준으로 상태를 구분해 화면에 정확히 보여준다.
export function feedStatus(record: FeedRecord): "eaten" | "partial" | "none" {
  if (!(record.eatenG > 0)) return "none";
  if (record.eatenG < record.offeredG) return "partial";
  return "eaten";
}

function feedStatusLabel(status: "eaten" | "partial" | "none") {
  return status === "none" ? "먹지 않음" : status === "partial" ? "일부 섭취" : "섭취 완료";
}

// 오늘 계획된 급여 중 "시도한" 횟수(0g만 먹었어도 슬롯은 소모됨)와 실제로
// "먹은" 횟수는 다를 수 있다. 화면과 스크린리더 문구 모두 이 두 값을
// 분리해서 보여줘야 "4회 중 1회 완료"처럼 0g도 완료로 오해되지 않는다.
export function planMealCounts(todayFeeds: FeedRecord[]) {
  const planFeeds = todayFeeds.filter((item) => item.source === "plan");
  return {
    attempted: planFeeds.length,
    eaten: planFeeds.filter((item) => feedStatus(item) === "eaten").length,
  };
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

function ProgressSegments({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label?: string;
}) {
  return (
    <div className="segments" aria-label={label ?? `${total}회 중 ${done}회 완료`}>
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
  small = false,
  photoUrl,
  editable = false,
  onPick,
}: {
  large?: boolean;
  small?: boolean;
  photoUrl?: string | null;
  editable?: boolean;
  onPick?: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`pet-avatar ${large ? "large" : ""} ${small ? "small" : ""}`}>
      {photoUrl ? (
        <img src={photoUrl} alt="반려동물 프로필 사진" className="avatar-photo" />
      ) : (
        <PawPrint size={large ? 44 : small ? 18 : 25} strokeWidth={1.9} />
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

// 급여 기록 하나를 삭제하거나 수정 전 상태로 되돌릴 때, 그 기록이 실제로
// 차감했던 자연식/사료/간식 재고를 되돌려(direction=-1) 놓거나 다시
// 차감(direction=1)하는 순수 함수. FeedEditor의 "수정"은 이 함수를
// direction=-1(원래 기록 되돌리기) 다음 direction=1(새 값 재적용) 순서로
// 두 번 호출해서 구현한다.
export function restoreInventory(current: Database, record: FeedRecord, direction: -1 | 1): Database {
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
  const snackAmount = record.source === "snack" ? Math.max(record.offeredG, record.eatenG) : 0;
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
    snacks: current.snacks.map((item) =>
      item.id === record.snackId
        ? { ...item, usedWeight: Math.max(0, item.usedWeight + direction * snackAmount) }
        : item,
    ),
  };
}

// 오늘 남은 끼니에 급여할 자연식/사료 양(그램)과 예상 kcal을 계산하는 순수
// 함수. 오늘 이미 급여한 자연식/사료 양을 하루 목표량에서 뺀 "남은 양"을
// 남은 끼니 수로 나누고, 오늘 먹인 간식 열량만큼은 미리 빼서(자연식:사료
// 비율은 그대로 유지) 다음 급여량에 반영한다.
export function computeNextServing(
  todayPlan: DailyPlan | undefined,
  todayFeeds: FeedRecord[],
  completedPlanMeals: number,
): { remainingMeals: number; naturalG: number; dryG: number; kcal: number } | null {
  if (!todayPlan) return null;
  const remainingMeals = Math.max(0, todayPlan.feedings - completedPlanMeals);
  if (remainingMeals === 0) {
    return { remainingMeals, naturalG: 0, dryG: 0, kcal: 0 };
  }
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
  const snackKcalToday = todayFeeds
    .filter((item) => item.source === "snack")
    .reduce((sum, item) => sum + item.calculatedKcal, 0);
  const naturalRemainingKcal = (naturalRemainingG * todayPlan.naturalKcalPer100) / 100;
  const dryRemainingKcal = (dryRemainingG * todayPlan.dryKcalPer100) / 100;
  const remainingKcalTotal = naturalRemainingKcal + dryRemainingKcal;
  const adjustedKcalTotal = Math.max(0, remainingKcalTotal - snackKcalToday);
  const shrinkRatio = remainingKcalTotal > 0 ? adjustedKcalTotal / remainingKcalTotal : 0;
  const naturalG = Math.round((naturalRemainingG * shrinkRatio) / remainingMeals);
  const dryG = Math.round((dryRemainingG * shrinkRatio) / remainingMeals);
  const kcal =
    (naturalG * todayPlan.naturalKcalPer100) / 100 + (dryG * todayPlan.dryKcalPer100) / 100;
  return { remainingMeals, kcal, naturalG, dryG };
}

// 아래 3개 build* 함수는 PetDietApp 컴포넌트 안의 recordPlannedMeal/
// takeMedication/quickHealthNote가 기록 객체를 만드는 부분만 그대로 뽑아낸
// 순수 함수다(영양 계산·id/시간 생성 방식은 그대로, 재고 차감이나 updateDb
// 호출 같은 부수효과는 그대로 컴포넌트에 남아 있다). 테스트에서 활성
// 반려동물(petId)이 새 기록에 실제로 찍히는지 컴포넌트를 렌더링하지 않고도
// 검증할 수 있도록 분리했다 — 컴포넌트는 이 함수들을 그대로 호출한다.
export function buildPlannedMealRecord(params: {
  petId: string;
  today: string;
  time?: string;
  note?: string;
  todayPlan: DailyPlan;
  batch?: Batch;
  dry?: DryFood;
  naturalOfferedG: number;
  naturalEatenG: number;
  dryOfferedG: number;
  dryEatenG: number;
}): FeedRecord {
  const { petId, today, time, note, todayPlan, batch, dry, naturalOfferedG, naturalEatenG, dryOfferedG, dryEatenG } =
    params;
  const kcal =
    (naturalEatenG * todayPlan.naturalKcalPer100) / 100 + (dryEatenG * todayPlan.dryKcalPer100) / 100;
  const protein =
    ((batch?.proteinPer100 ?? 0) * naturalEatenG) / 100 + ((dry?.protein ?? 0) * dryEatenG) / 100;
  const fat = ((batch?.fatPer100 ?? 0) * naturalEatenG) / 100 + ((dry?.fat ?? 0) * dryEatenG) / 100;
  return {
    id: uid("feed"),
    petId,
    datetime: `${today}T${time ?? localTime()}`,
    label: [batch?.name, dry?.name].filter(Boolean).join(" + ") || "급여 계획",
    source: "plan",
    offeredG: naturalOfferedG + dryOfferedG,
    eatenG: naturalEatenG + dryEatenG,
    calculatedKcal: kcal,
    protein,
    fat,
    note: note ?? "",
    batchId: batch?.id,
    dryFoodId: dry?.id,
    naturalOfferedG,
    naturalEatenG,
    dryOfferedG,
    dryEatenG,
    naturalKcalPer100: todayPlan.naturalKcalPer100,
    dryKcalPer100: todayPlan.dryKcalPer100,
  };
}

export function buildMedicationLog(params: {
  petId: string;
  today: string;
  medicationId: string;
  stockUsed: number;
}): MedicationLog {
  return {
    id: uid("medlog"),
    petId: params.petId,
    medicationId: params.medicationId,
    datetime: `${params.today}T${localTime()}`,
    stockUsed: params.stockUsed,
  };
}

export function buildQuickHealthNote(params: { petId: string; today: string; note: string }): HealthRecord {
  return {
    id: uid("health"),
    petId: params.petId,
    datetime: `${params.today}T${localTime()}`,
    weightKg: null,
    bcs: null,
    appetite: "normal",
    vomitCount: 0,
    stool: null,
    vitality: "normal",
    pain: false,
    note: params.note.trim(),
  };
}

export default function PetDietApp() {
  const [db, setDb] = useState<Database>(() => emptyDatabase());
  // 지금 선택된 반려동물. db(가족과 동기화되는 본체 데이터)와는 별도로
  // 관리하는 기기별 UI 상태다 — 반려동물을 전환해도 household push가
  // 일어나지 않고, 다른 가족 구성원의 화면도 강제로 전환되지 않는다.
  const [activePetId, setActivePetId] = useState<string>(() => db.pets[0]?.id ?? "");
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [history, setHistory] = useState<Page[]>([]);
  const [toast, setToast] = useState("");
  // PWA: 네트워크 연결 상태. 오프라인일 때는 updateDb 자체를 막아 서버 저장이
  // 필요한 모든 기록(급여·복약·체중·건강 등)이 조용히 실패하거나 로컬에만
  // 임시로 남는 일을 방지한다. 초기값은 true로 두고(SSR/첫 렌더 중에는
  // navigator가 없음) 마운트 직후 useEffect에서 실제 값으로 바로잡는다.
  const [isOnline, setIsOnline] = useState(true);
  const wasOnlineRef = useRef(true);
  const [feedSheetOpen, setFeedSheetOpen] = useState(false);
  const [snackSheetOpen, setSnackSheetOpen] = useState(false);
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
          const parsed = normalizeDatabase(JSON.parse(current ?? legacy ?? "{}"));
          setDb(parsed);
          const storedActivePetId = window.localStorage.getItem(ACTIVE_PET_KEY);
          setActivePetId(
            storedActivePetId && parsed.pets.some((p) => p.id === storedActivePetId)
              ? storedActivePetId
              : (parsed.pets[0]?.id ?? ""),
          );
        }
      } catch {
        setDb(emptyDatabase());
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db, hydrated]);

  useEffect(() => {
    if (hydrated && activePetId) window.localStorage.setItem(ACTIVE_PET_KEY, activePetId);
  }, [activePetId, hydrated]);

  // 동기화(가족 pull) 중 지금 선택된 반려동물이 사라졌다면(다른 구성원이
  // 삭제했거나, 이 기기에 남아있던 activePetId가 더 이상 유효하지 않다면)
  // 존재하는 첫 반려동물로 안전하게 전환한다.
  useEffect(() => {
    if (!hydrated) return;
    if (activePetId && !db.pets.some((p) => p.id === activePetId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActivePetId(db.pets[0]?.id ?? "");
    }
  }, [db.pets, hydrated, activePetId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // PWA: 온/오프라인 전환을 감지한다. 오프라인 → 온라인으로 돌아올 때만
  // "다시 연결됐어요" 토스트를 띄운다(최초 마운트 시 이미 온라인이었다면 띄우지 않음).
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);
    wasOnlineRef.current = navigator.onLine;

    function handleOnline() {
      if (!wasOnlineRef.current) setToast("인터넷에 다시 연결됐어요.");
      wasOnlineRef.current = true;
      setIsOnline(true);
    }
    function handleOffline() {
      wasOnlineRef.current = false;
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

  useEffect(() => {
    if (!hydrated) return;
    // Google 로그인/연결이 끝나고 이 페이지로 돌아왔을 때(app/api/auth/google/*
    // 라우트가 붙여준 쿼리스트링) 결과를 토스트로 보여주고 URL은 깨끗하게 되돌린다.
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    const googleLinked = params.get("googleLinked");
    const reauthDone = params.get("reauthDone");
    if (!authError && !googleLinked && !reauthDone) return;

    const messages: Record<string, string> = {
      login_required: "먼저 로그인해주세요.",
      reauth_required: "본인 확인이 만료됐어요. 다시 확인해주세요.",
      reauth_account_mismatch: "본인 확인에 사용한 Google 계정이 이 계정에 연결된 계정과 달라요.",
      google_unavailable: "지금은 Google 로그인을 사용할 수 없어요.",
      google_cancelled: "Google 로그인을 취소했어요.",
      google_error: "Google 로그인 중 문제가 발생했어요.",
      google_expired: "로그인 시도 시간이 지났어요. 다시 시도해주세요.",
      google_email_unverified: "Google 계정의 이메일이 인증되지 않았어요.",
      google_email_in_use: "이미 같은 이메일로 가입된 계정이 있어요. 비밀번호로 로그인한 뒤 계정 설정에서 Google을 연결해주세요.",
      google_already_linked: "이 Google 계정은 이미 다른 계정에 연결되어 있어요.",
      account_unavailable: "이용할 수 없는 계정이에요.",
      consent_required: "Google로 처음 가입하려면 회원가입 탭에서 약관에 동의한 뒤 다시 시도해주세요.",
    };
    const reauthDoneMessages: Record<string, string> = {
      "account-delete": "본인 확인을 완료했어요. 아래에서 탈퇴 확정 버튼을 다시 눌러주세요.",
      "ownership-transfer": "본인 확인을 완료했어요. 아래에서 이전 확정 버튼을 다시 눌러주세요.",
      "household-delete": "본인 확인을 완료했어요. 아래에서 가족 공간 삭제 확정 버튼을 다시 눌러주세요.",
    };
    if (reauthDone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage("settings");
      setToast(reauthDoneMessages[reauthDone] ?? "본인 확인을 완료했어요.");
    } else {
      setToast(
        googleLinked ? "Google 계정을 연결했어요." : messages[authError ?? ""] ?? "처리하지 못했어요.",
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("authError");
    url.searchParams.delete("googleLinked");
    url.searchParams.delete("reauthDone");
    window.history.replaceState(null, "", url.pathname + url.search);
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
      setToast("가족을 만들었어요. 이메일로 구성원을 초대해보세요.");
      await refreshHousehold();
    } finally {
      setFamilyBusy(false);
    }
  }

  async function leaveHousehold() {
    if (!household) return;
    if (household.role === "owner") {
      setToast(
        household.members.length > 1
          ? "관리자는 바로 나갈 수 없어요. 먼저 다른 구성원에게 소유권을 이전해주세요."
          : "혼자 남은 관리자는 '나가기' 대신 '위험 영역'의 가족 공간 삭제를 이용해주세요.",
      );
      return;
    }
    if (
      !window.confirm(
        "가족 공유를 그만둘까요? 지금까지 공유된 데이터는 이 기기에 그대로 남고, 앞으로는 이 기기에만 저장돼요.",
      )
    )
      return;
    setFamilyBusy(true);
    try {
      const res = await fetch("/api/household/leave", { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setToast(payload.error ?? "가족 공유를 나가지 못했어요.");
        return;
      }
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

  // 계정 탈퇴 API가 이미 세션 쿠키를 지웠으므로 여기서는 로그아웃 요청을
  // 다시 보내지 않고, 화면 상태만 로그아웃 상태로 되돌린다.
  function handleAccountDeleted() {
    setHousehold(null);
    setAuthState("signed-out");
    setToast("계정을 삭제했어요.");
  }

  // /invite/accept?token=... 으로 들어오면 그 페이지가 안전한 내부 경로인
  // /?inviteToken=...으로 리다이렉트해준다. 이 앱은 별도 로그인 페이지가
  // 없는 SPA라, 로그인 전이면 여기서 토큰을 잠시 들고 있다가 로그인/회원가입이
  // 끝나는 즉시 자동으로 수락 API를 호출한다.
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("inviteToken");
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingInviteToken(token);
    const url = new URL(window.location.href);
    url.searchParams.delete("inviteToken");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [hydrated]);

  useEffect(() => {
    if (!pendingInviteToken) return;
    if (authState === "signed-out") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage("settings");
      setToast("초대를 수락하려면 먼저 로그인하거나 회원가입해주세요.");
      return;
    }
    if (authState !== "signed-in") return;
    const token = pendingInviteToken;
    setPendingInviteToken(null);
    const inviteErrorMessages: Record<string, string> = {
      not_found: "초대를 찾을 수 없거나 유효하지 않아요.",
      cancelled: "취소된 초대예요. 가족 관리자에게 새 초대를 요청해주세요.",
      used: "이미 사용된 초대예요.",
      expired: "만료된 초대예요. 가족 관리자에게 새 초대를 요청해주세요.",
      not_sent: "아직 발송 처리 중인 초대예요. 잠시 후 다시 시도해주세요.",
      unverified_email: "이메일 인증을 먼저 완료한 뒤 초대 링크를 다시 열어주세요.",
      email_mismatch: "로그인한 계정의 이메일이 초대받은 이메일과 달라요. 초대받은 이메일 계정으로 로그인해주세요.",
      already_in_other_household: "이미 다른 가족에 속해 있어요. 먼저 기존 가족에서 나간 뒤 다시 시도해주세요.",
      conflict: "초대를 처리하지 못했어요. 새로고침 후 다시 시도해주세요.",
    };
    fetch("/api/household/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          ok?: boolean;
          alreadyMember?: boolean;
        };
        if (!res.ok) {
          setToast(payload.error ?? inviteErrorMessages[payload.code ?? ""] ?? "초대를 처리하지 못했어요.");
          return;
        }
        setToast(payload.alreadyMember ? "이미 이 가족의 구성원이에요." : "가족에 합류했어요.");
        await refreshHousehold();
      })
      .catch(() => setToast("네트워크 오류로 초대를 처리하지 못했어요."));
  }, [pendingInviteToken, authState]);

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
    // PWA: 오프라인일 때는 서버 저장이 필요한 모든 기록 변경(급여·복약·체중·
    // 건강 등)을 실행하지 않는다. 기존 온라인 저장 로직(setDb/setToast) 자체는
    // 그대로 두고, 이 가드만 앞단에 추가한다.
    if (!isOnline) {
      setToast(OFFLINE_MESSAGE);
      return;
    }
    setDb((current) => updater(current));
    if (message) setToast(message);
  }

  // db는 항상 "가족과 동기화되는 전체(멀티펫) 데이터"다. 화면 대부분은
  // 지금 선택된 반려동물 하나만 신경 쓰면 되므로, 기존 컴포넌트들이 원래
  // 쓰던 모양(pet 단수 + 이 반려동물의 기록만 담긴 배열)으로 파생시킨 뷰를
  // 만들어 화면에는 이 view를 db처럼 내려준다. updateDb(현재 db를 바꾸는
  // 함수)는 항상 전체 db를 대상으로 동작해야 하므로 view가 아니라 실제
  // db/setDb를 그대로 사용한다.
  const view: PetView = useMemo(() => buildPetView(db, activePetId), [db, activePetId]);

  function switchPet(petId: string) {
    setActivePetId(petId);
  }

  function addPet(pet: Omit<Pet, "id">) {
    const id = uid("pet");
    updateDb(
      (current) => ({ ...current, pets: [...current.pets, { ...pet, id }] }),
      `${pet.name || "새 반려동물"}을 추가했어요.`,
    );
    setActivePetId(id);
    return id;
  }

  // 반려동물 삭제: 마지막 한 마리는 차단하고, 그 반려동물이 걸려있는
  // 급여·재고·건강·계획 기록도 함께 지운다. activePetId가 삭제된 반려동물을
  // 가리키고 있었다면 위쪽 안전-전환 useEffect가 알아서 첫 반려동물로
  // 되돌린다(가족 동기화로 다른 기기에서 삭제된 경우와 동일한 경로).
  function deletePet(petId: string) {
    if (db.pets.length <= 1) {
      setToast("마지막 반려동물은 삭제할 수 없어요.");
      return;
    }
    updateDb((current) => cascadeDeletePet(current, petId), "반려동물과 관련 기록을 모두 삭제했어요.");
  }

  const todayFeeds = useMemo(
    () =>
      dateRecords(view.feedLog, today).sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [view.feedLog, today],
  );
  const todayKcal = todayFeeds.reduce((sum, item) => sum + item.calculatedKcal, 0);
  const todayPlan = view.dailyPlans[today];
  const planIsCurrent = todayPlan?.settingsHash === planSettingsHash(view);
  const { attempted: completedPlanMeals, eaten: eatenPlanMeals } = planMealCounts(todayFeeds);

  const nextServing = useMemo(
    () => computeNextServing(todayPlan, todayFeeds, completedPlanMeals),
    [todayPlan, completedPlanMeals, todayFeeds],
  );

  if (!hydrated) {
    return (
      <main className="app-stage">
        <div className="app-frame">
          <div className="loading-cover">기록을 불러오는 중…</div>
        </div>
      </main>
    );
  }

  // petOverride를 받으면 화면에 아직 저장하지 않은 급여 계획 초안(draft)을
  // 기준으로 스냅샷을 만들고, pet 저장과 오늘 계획 적용을 한 번의 updateDb로
  // 원자적으로 처리한다. 이렇게 해야 "설정 저장을 누르지 않고 오늘 계획 적용을
  // 눌렀을 때 화면에 보이는 값이 아니라 예전 저장값으로 적용되는" 문제가 없다.
  function applyTodayPlan(petOverride?: Pet) {
    const draftView = petOverride ? { ...view, pet: petOverride } : view;
    const snapshot = createPlanSnapshot(draftView, today);
    if (!snapshot) {
      setToast("급여 계획에서 목표 열량과 급여원을 먼저 저장해주세요.");
      open("plan");
      return;
    }
    if (todayFeeds.length > 0) {
      const confirmed = window.confirm(
        `오늘 급여 기록이 ${todayFeeds.length}건 있습니다. 기록은 유지하고 남은 급여량만 새 계획으로 다시 계산할까요?`,
      );
      if (!confirmed) return;
    }
    const petId = view.pet.id;
    updateDb(
      (current) => ({
        ...(petOverride ? withPet(current, petId, () => petOverride) : current),
        dailyPlans: { ...current.dailyPlans, [`${petId}:${today}`]: snapshot },
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
    const batch = view.batches.find((item) => item.id === todayPlan.batchId);
    const dry = view.dryFoods.find((item) => item.id === todayPlan.dryFoodId);
    if (batch && naturalUsedG > remaining(batch.totalWeight, batch.usedWeight) + 0.001) {
      setToast(`${batch.name} 재고가 부족해 기록하지 않았어요.`);
      return;
    }
    if (dry && dryUsedG > remaining(dry.totalWeight, dry.usedWeight) + 0.001) {
      setToast(`${dry.name} 재고가 부족해 기록하지 않았어요.`);
      return;
    }
    const record = buildPlannedMealRecord({
      petId: view.pet.id,
      today,
      time: values?.time,
      note: values?.note,
      todayPlan,
      batch,
      dry,
      naturalOfferedG,
      naturalEatenG,
      dryOfferedG,
      dryEatenG,
    });
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
    const batch = view.batches.find((item) => item.id === record.batchId);
    const dry = view.dryFoods.find((item) => item.id === record.dryFoodId);
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
    const done = dateRecords(view.medLog, today).filter(
      (item) => item.medicationId === medication.id,
    ).length;
    if (done >= medication.perDay) {
      setToast("오늘 예정 횟수를 이미 모두 완료했어요.");
      return;
    }
    // 1회당 차감량이 0 이하·NaN이면 재고가 전혀 줄지 않으면서 "완료"만
    // 기록되는 상황이 생긴다. 등록 화면에서 막고 있지만, 예전 백업 데이터
    // 등으로 여기까지 들어올 수 있으니 급여 완료 시점에도 한 번 더 막는다.
    if (!isValidStockPerDose(medication.stockPerDose)) {
      setToast(`${medication.name}의 1회당 차감량 정보가 올바르지 않아요. 등록 정보를 다시 확인해주세요.`);
      return;
    }
    if (medication.stock < medication.stockPerDose) {
      setToast(`${medication.name} 재고가 부족해요.`);
      return;
    }
    const log = buildMedicationLog({
      petId: view.pet.id,
      today,
      medicationId: medication.id,
      stockUsed: medication.stockPerDose,
    });
    updateDb(
      (current) => ({
        ...current,
        medications: current.medications.map((item) =>
          item.id === medication.id
            ? { ...item, stock: applyMedicationDose(item.stock, medication.stockPerDose) }
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
            ? { ...item, stock: roundTo(item.stock + log.stockUsed) }
            : item,
        ),
        medLog: current.medLog.filter((item) => item.id !== log.id),
      }),
      "급여 체크를 취소하고 재고를 복원했어요.",
    );
  }

  function quickHealthNote(note: string) {
    if (!note.trim()) return;
    const row = buildQuickHealthNote({ petId: view.pet.id, today, note });
    updateDb((current) => ({ ...current, healthLog: [...current.healthLog, row] }), "건강 메모를 남겼어요.");
  }

  function recordSnack(snackId: string, grams: number) {
    const snack = view.snacks.find((item) => item.id === snackId);
    if (!snack || !(grams > 0)) return;
    if (grams > remaining(snack.totalWeight, snack.usedWeight) + 0.001) {
      setToast(`${snack.name} 재고가 부족해요.`);
      return;
    }
    const kcal = (grams * snack.kcalPer100) / 100;
    const record: FeedRecord = {
      id: uid("feed"),
      petId: view.pet.id,
      datetime: `${today}T${localTime()}`,
      label: snack.name,
      source: "snack",
      offeredG: grams,
      eatenG: grams,
      calculatedKcal: kcal,
      protein: (grams * snack.protein) / 100,
      fat: (grams * snack.fat) / 100,
      carb: (grams * snack.carb) / 100,
      note: "",
      snackId: snack.id,
    };
    // 간식 열량이 하루 목표 열량의 10%를 넘으면(수의사들이 흔히 권장하는
    // 기준) 가볍게 경고해서, 자연식·사료 배합의 영양 균형이 조용히 무너지지
    // 않도록 한다.
    const target = todayPlan?.targetKcal ?? effectiveTarget(view.pet);
    const snackKcalSoFar = todayFeeds
      .filter((item) => item.source === "snack")
      .reduce((sum, item) => sum + item.calculatedKcal, 0);
    const snackKcalAfter = snackKcalSoFar + kcal;
    const overTenPercent = target > 0 && snackKcalAfter > target * 0.1;
    updateDb(
      (current) => ({
        ...current,
        feedLog: [...current.feedLog, record],
        snacks: current.snacks.map((item) =>
          item.id === snack.id ? { ...item, usedWeight: item.usedWeight + grams } : item,
        ),
      }),
      overTenPercent
        ? `간식을 기록했어요. 오늘 간식이 목표 열량의 ${Math.round((snackKcalAfter / target) * 100)}%예요 (권장 10% 이내).`
        : "간식을 기록했어요.",
    );
    setSnackSheetOpen(false);
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
    db: view,
    pets: db.pets,
    switchPet,
    addPet,
    deletePet,
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
          eatenPlanMeals={eatenPlanMeals}
          nextServing={nextServing}
          applyTodayPlan={applyTodayPlan}
          recordPlannedMeal={() => recordPlannedMeal()}
          openFeedSheet={() => setFeedSheetOpen(true)}
          openSnackSheet={() => setSnackSheetOpen(true)}
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
    case "pet-add":
      content = <PetAddPage {...shared} />;
      break;
    case "natural":
      content = <NaturalFoodPage {...shared} />;
      break;
    case "dry":
      content = <DryFoodPage {...shared} />;
      break;
    case "snacks":
      content = <SnackPage {...shared} />;
      break;
    case "plan":
      content = (
        <FeedingPlanPage
          {...shared}
          plan={todayPlan}
          applyTodayPlan={applyTodayPlan}
        />
      );
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
          exportData={exportData}
          importRef={importRef}
          importData={importData}
          authState={authState}
          household={household}
          familyBusy={familyBusy}
          createHousehold={createHousehold}
          leaveHousehold={leaveHousehold}
          refreshHousehold={refreshHousehold}
          logout={logout}
          onAccountDeleted={handleAccountDeleted}
        />
      );
  }

  return (
    <main className="app-stage">
      <div className={`app-frame ${page === "stats" ? "stats-mode" : ""}`}>
        {!isOnline && (
          <div className="offline-banner" role="status">
            {OFFLINE_MESSAGE}
          </div>
        )}
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
      {snackSheetOpen && (
        <SnackSheet snacks={view.snacks} onClose={() => setSnackSheetOpen(false)} onSave={recordSnack} openSnackPage={() => { setSnackSheetOpen(false); open("snacks"); }} />
      )}
    </main>
  );
}

type SharedProps = {
  db: PetView;
  pets: Pet[];
  switchPet: (petId: string) => void;
  addPet: (pet: Omit<Pet, "id">) => string;
  deletePet: (petId: string) => void;
  open: (page: Page) => void;
  back: () => void;
  home: () => void;
  updateDb: (updater: (current: Database) => Database, message?: string) => void;
  today: string;
  setToast: (message: string) => void;
};

function HomePage({
  db,
  pets,
  switchPet,
  open,
  today,
  todayFeeds,
  todayKcal,
  todayPlan,
  planIsCurrent,
  completedPlanMeals,
  eatenPlanMeals,
  nextServing,
  applyTodayPlan,
  recordPlannedMeal,
  openFeedSheet,
  openSnackSheet,
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
  eatenPlanMeals: number;
  nextServing: { remainingMeals: number; naturalG: number; dryG: number; kcal: number } | null;
  applyTodayPlan: (petOverride?: Pet) => void;
  recordPlannedMeal: () => void;
  openFeedSheet: () => void;
  openSnackSheet: () => void;
  takeMedication: (medication: Medication) => void;
  quickHealthNote: (note: string) => void;
  deleteFeed: (record: FeedRecord) => void;
  editFeed: (record: FeedRecord) => void;
}) {
  const [healthNote, setHealthNote] = useState("");
  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const target = todayPlan?.targetKcal ?? effectiveTarget(db.pet);
  const progress = target > 0 ? Math.min(100, (todayKcal / target) * 100) : 0;
  const medLogs = dateRecords(db.medLog, today);
  // 약(med)과 영양제(supplement)를 하나로 묶어 "다음 항목" 하나만 고르면
  // 둘 중 하나만 계속 화면에 보이게 된다. 메인 화면에는 두 종류를 각각
  // 독립적으로 보여줘야 하므로 타입별로 따로 계산한다.
  const meds = db.medications.filter((item) => item.type === "med");
  const supplements = db.medications.filter((item) => item.type === "supplement");
  const doneCountFor = (medication: Medication) =>
    medLogs.filter((row) => row.medicationId === medication.id).length;
  const nextMed = meds.find((item) => doneCountFor(item) < item.perDay);
  const nextSupplement = supplements.find((item) => doneCountFor(item) < item.perDay);
  const totalMedDoses = meds.reduce((sum, item) => sum + item.perDay, 0);
  const totalSupplementDoses = supplements.reduce((sum, item) => sum + item.perDay, 0);
  const medIds = new Set(meds.map((item) => item.id));
  const supplementIds = new Set(supplements.map((item) => item.id));
  const completedMeds = medLogs.filter((row) => medIds.has(row.medicationId)).length;
  const completedSupplements = medLogs.filter((row) => supplementIds.has(row.medicationId)).length;
  // datetime은 분 단위(HH:MM)까지만 기록되어 같은 분 안에 여러 메모를 남기면
  // 값이 동일해질 수 있다. 이럴 때도 항상 "가장 나중에 입력한" 메모가 위에
  // 오도록 배열 인덱스를 2차 기준으로 사용해 정렬한다.
  const latestHealth = db.healthLog
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.datetime.localeCompare(a.item.datetime) || b.index - a.index)[0]?.item;
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
          <div className="home-greeting-row">
            <h1>{db.pet.name ? `${db.pet.name}, 밥먹자!` : "댕댕아, 밥먹자!"}</h1>
            {/* 반려동물이 한 마리뿐이면 전환할 대상이 없으므로 아이콘 자체를 숨긴다. */}
            {pets.length > 1 && (
              <button
                type="button"
                className="pet-switch-trigger"
                aria-label="다른 반려동물로 변경"
                onClick={() => setPetMenuOpen(true)}
              >
                <ChevronsUpDown size={16} />
              </button>
            )}
          </div>
        </div>
        <IconButton label="설정 메뉴" onClick={() => open("menu")} className="gear-button">
          <Settings size={23} />
        </IconButton>
      </div>
      {petMenuOpen && (
        <div className="modal-backdrop" onClick={() => setPetMenuOpen(false)}>
          <div className="pet-switch-sheet" onClick={(event) => event.stopPropagation()}>
            <h2>반려동물 전환</h2>
            <div className="pet-switch-sheet-list">
              {pets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pet-switch-sheet-row"
                  onClick={() => {
                    switchPet(item.id);
                    setPetMenuOpen(false);
                  }}
                >
                  <PetAvatar small photoUrl={item.photoDataUrl} />
                  <span>{item.name || "이름 없음"}</span>
                  {item.id === db.pet.id && <Check size={18} className="pet-switch-sheet-check" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
                    {[
                      nextServing.naturalG > 0 ? `자연식 ${fmt(nextServing.naturalG)}g` : null,
                      nextServing.dryG > 0 ? `사료 ${fmt(nextServing.dryG)}g` : null,
                    ]
                      .filter(Boolean)
                      .join(" + ") || "급여 없음"}
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
                <button className="button primary" onClick={() => applyTodayPlan()}>
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
              <button className="button secondary" onClick={openSnackSheet}>
                <Cookie size={16} />
                간식 급여
              </button>
            </div>
          </div>
          <button
            className="hero-icon meal-icon"
            aria-label="이번 끼니 급여 완료"
            onClick={todayPlan && nextServing?.remainingMeals ? recordPlannedMeal : () => applyTodayPlan()}
          >
            <UtensilsCrossed size={54} strokeWidth={1.65} />
          </button>
          <div className="wide-progress">
            <ProgressSegments
              done={completedPlanMeals}
              total={todayPlan?.feedings ?? db.pet.feedingsPerDay}
              label={`${todayPlan?.feedings ?? db.pet.feedingsPerDay}회 중 급여 시도 ${completedPlanMeals}회, 섭취 ${eatenPlanMeals}회`}
            />
            <span>
              {completedPlanMeals}/{todayPlan?.feedings ?? db.pet.feedingsPerDay}회 급여 시도
              {completedPlanMeals > 0 && ` · ${eatenPlanMeals}회 섭취`}
            </span>
          </div>
        </section>

        <div className="medicine-cards-row">
          <section className="hero-action-card medicine-card compact">
            <div className="action-copy">
              <span className="eyebrow">약</span>
              {nextMed ? (
                <>
                  <h2>{nextMed.name}</h2>
                  <p>{nextMed.dose || `하루 ${nextMed.perDay}회`}</p>
                  <button className="button ink small" onClick={() => takeMedication(nextMed)}>
                    <Check size={16} />
                    완료
                  </button>
                </>
              ) : (
                <>
                  <h2>{meds.length ? "오늘 모두 완료" : "등록된 약이 없어요"}</h2>
                  <button className="button secondary small" onClick={() => open("meds")}>
                    관리하기
                  </button>
                </>
              )}
            </div>
            <button
              className="hero-icon medicine-icon"
              aria-label="약 급여 체크"
              onClick={() => (nextMed ? takeMedication(nextMed) : open("meds"))}
            >
              <Pill size={38} strokeWidth={1.6} />
            </button>
            <div className="wide-progress">
              <ProgressSegments done={completedMeds} total={totalMedDoses || 1} />
              <span>
                {completedMeds}/{totalMedDoses || 0}회 완료
              </span>
            </div>
          </section>
          <section className="hero-action-card medicine-card compact">
            <div className="action-copy">
              <span className="eyebrow">영양제</span>
              {nextSupplement ? (
                <>
                  <h2>{nextSupplement.name}</h2>
                  <p>{nextSupplement.dose || `하루 ${nextSupplement.perDay}회`}</p>
                  <button className="button ink small" onClick={() => takeMedication(nextSupplement)}>
                    <Check size={16} />
                    완료
                  </button>
                </>
              ) : (
                <>
                  <h2>{supplements.length ? "오늘 모두 완료" : "등록된 영양제가 없어요"}</h2>
                  <button className="button secondary small" onClick={() => open("supplements")}>
                    관리하기
                  </button>
                </>
              )}
            </div>
            <button
              className="hero-icon medicine-icon"
              aria-label="영양제 급여 체크"
              onClick={() => (nextSupplement ? takeMedication(nextSupplement) : open("supplements"))}
            >
              <Sparkles size={38} strokeWidth={1.6} />
            </button>
            <div className="wide-progress">
              <ProgressSegments done={completedSupplements} total={totalSupplementDoses || 1} />
              <span>
                {completedSupplements}/{totalSupplementDoses || 0}회 완료
              </span>
            </div>
          </section>
        </div>

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
                      <span className="row-title">
                        <strong>{record.label}</strong>
                        {feedStatus(record) !== "eaten" && (
                          <span className={`status-pill status-${feedStatus(record)}`}>
                            {feedStatusLabel(feedStatus(record))}
                          </span>
                        )}
                      </span>
                      <span>
                        목표량 {fmt(record.offeredG)}g · 급여량 {fmt(record.eatenG)}g ·{" "}
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
        { page: "snacks" as Page, title: "간식", subtitle: `${db.snacks.length}개 등록`, icon: <Cookie /> },
        { page: "plan" as Page, title: "급여 계획", subtitle: "목표 · 배분 설정", icon: <CalendarDays /> },
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
        { page: "settings" as Page, title: "설정", subtitle: "백업 · 가족계정", icon: <Settings /> },
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

function PetPage({ db, pets, switchPet, open, back, home }: SharedProps) {
  return (
    <>
      <PageHeader title="반려동물 관리" onBack={back} onHome={home} />
      <div className="page-content">
        {/* 제목이나 박스 없이, 등록된 반려동물의 원형 아이콘+이름을 가로로
            나열하고 맨 끝에 추가(+) 버튼을 둔다. 반려동물이 많아지면 이 줄만
            가로로 스크롤된다. */}
        <div className="pet-select-row">
          {pets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pet-select-item ${item.id === db.pet.id ? "active" : ""}`}
              aria-pressed={item.id === db.pet.id}
              onClick={() => switchPet(item.id)}
            >
              <PetAvatar small photoUrl={item.photoDataUrl} />
              <span>{item.name || "이름 없음"}</span>
            </button>
          ))}
          <IconButton label="반려동물 추가" onClick={() => open("pet-add")} className="pet-add-circle">
            <Plus size={20} />
          </IconButton>
        </div>
        <section className="pet-profile-card">
          <PetAvatar large photoUrl={db.pet.photoDataUrl} />
          <div className="pet-name-row">
            <h2>{db.pet.name || "이름 없음"}</h2>
            <IconButton label="반려동물 정보 수정" onClick={() => open("pet-edit")} className="pet-edit-button">
              <Edit3 size={17} />
            </IconButton>
          </div>
          <p>
            {ageText(db.pet.birthdate)} ·{" "}
            {db.pet.sex === "female-neutered" ? "중성화 암컷" : "프로필 등록"}
          </p>
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

function PetEditPage({ db, pets, deletePet, updateDb, open, back, home }: SharedProps) {
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
    updateDb((current) => withPet(current, pet.id, () => pet), "반려동물 정보를 저장했어요.");
    back();
  }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = pets.length > 1;
  function confirmedDelete() {
    deletePet(pet.id);
    setConfirmDelete(false);
    open("pet");
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
              <input type="number" min="0" step="0.01" value={pet.weightKg} onChange={(e) => updateAndRecalc({ weightKg: nonNegative(Number(e.target.value)) })} />
            </label>
            <label>
              목표 체중(kg)
              <input type="number" min="0" step="0.01" value={pet.targetWeightKg ?? ""} onChange={(e) => updateAndRecalc({ targetWeightKg: e.target.value ? nonNegative(Number(e.target.value)) : null })} />
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
              <input type="number" min="0" value={pet.dailyTargetKcal} onChange={(e) => setPet({ ...pet, dailyTargetKcal: nonNegative(Number(e.target.value)) })} />
            </label>
            <label>
              1일 급여 횟수
              <input type="number" min="1" max="12" value={pet.feedingsPerDay} onChange={(e) => setPet({ ...pet, feedingsPerDay: Math.max(1, nonNegative(Number(e.target.value))) })} />
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
        <button
          type="button"
          className="button danger-outline full pet-delete-button"
          disabled={!canDelete}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={18} />
          반려동물 정보 삭제
        </button>
        {!canDelete && <p className="form-note">마지막 반려동물은 삭제할 수 없어요.</p>}
      </form>
      {confirmDelete && (
        <ConfirmDialog title={`${pet.name || "이 반려동물"}의 정보를 삭제할까요?`} onClose={() => setConfirmDelete(false)}>
          <p className="form-note warning">
            반려동물 정보를 삭제하면 해당 반려동물의 급여, 식단, 체중, 건강, 복약 기록 등 기존 데이터도 모두
            삭제되며 복구할 수 없습니다. 그래도 삭제할까요?
          </p>
          <div className="button-grid">
            <button className="button secondary" onClick={() => setConfirmDelete(false)}>
              아니요, 취소
            </button>
            <button className="button danger" onClick={confirmedDelete}>
              예, 삭제할게요
            </button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}

// PetEditPage와 필드 구성은 거의 같지만, 기존 반려동물을 고쳐쓰는 게 아니라
// 새 반려동물을 처음부터 만든다. addPet이 새 id를 부여하고 즉시 활성
// 반려동물로 전환한다.
function PetAddPage({ addPet, back, home }: SharedProps) {
  const [pet, setPet] = useState<Omit<Pet, "id">>(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = emptyPet();
    return rest;
  });
  function updateAndRecalc(patch: Partial<Pet>) {
    setPet((current) => {
      const next = { ...current, ...patch };
      return { ...next, dailyTargetKcal: merEstimate(next as Pet) };
    });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!pet.name.trim()) return;
    addPet(pet);
    back();
  }
  return (
    <>
      <PageHeader title="반려동물 추가" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={save}>
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
              <input type="number" min="0" step="0.01" value={pet.weightKg} onChange={(e) => updateAndRecalc({ weightKg: nonNegative(Number(e.target.value)) })} />
            </label>
            <label>
              목표 체중(kg)
              <input type="number" min="0" step="0.01" value={pet.targetWeightKg ?? ""} onChange={(e) => updateAndRecalc({ targetWeightKg: e.target.value ? nonNegative(Number(e.target.value)) : null })} />
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
              <input type="number" min="0" value={pet.dailyTargetKcal} onChange={(e) => setPet({ ...pet, dailyTargetKcal: nonNegative(Number(e.target.value)) })} />
            </label>
            <label>
              1일 급여 횟수
              <input type="number" min="1" max="12" value={pet.feedingsPerDay} onChange={(e) => setPet({ ...pet, feedingsPerDay: Math.max(1, nonNegative(Number(e.target.value))) })} />
            </label>
          </div>
          <p className="form-note">
            체중·활동량·질환 정보를 반영해 1일 목표 kcal이 자동 계산돼요(참고값{" "}
            <strong>{merEstimate(pet as Pet)} kcal</strong>). 수의사 지정값이 따로 있다면 위 칸에 직접 덮어써주세요.
          </p>
        </section>
        <button className="button primary full" type="submit">
          <Plus size={18} />
          반려동물 추가
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
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarb, setManualCarb] = useState("");
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
  const completedWeight = nonNegative(Number(finalWeight)) || totals.weight;
  const macroTotal = totals.protein * 4 + totals.fat * 9 + totals.carb * 4 || 1;
  const proteinDeg = (totals.protein * 4 * 360) / macroTotal;
  const fatDeg = (totals.fat * 9 * 360) / macroTotal;

  function addIngredientFromSearch(item: IngredientLine) {
    setLines((current) => [...current, { ...item, grams: 0 }]);
    setIngredientQuery("");
  }

  function addManualIngredient() {
    const trimmed = ingredientQuery.trim();
    if (!trimmed) return;
    setLines((current) => [
      ...current,
      {
        name: trimmed,
        grams: 0,
        kcalPer100: Number(manualKcal) || 0,
        protein: Number(manualProtein) || 0,
        fat: Number(manualFat) || 0,
        carb: Number(manualCarb) || 0,
      },
    ]);
    setIngredientQuery("");
    setManualKcal("");
    setManualProtein("");
    setManualFat("");
    setManualCarb("");
  }

  function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!(completedWeight > 0) || !(totals.kcal > 0)) {
      setToast("재료와 완성 중량을 먼저 입력해주세요.");
      return;
    }
    const batch: Batch = {
      id: uid("batch"),
      petId: db.pet.id,
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
        ...withPet(current, db.pet.id, (p) => ({ ...p, batchId: p.batchId || batch.id })),
        batches: [...current.batches, batch],
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
        <SectionTitle title="재료를 검색해주세요" />
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
                <div className="ingredient-manual">
                  <p className="ingredient-empty">일치하는 재료가 없어요. 영양 정보를 직접 입력해 등록할 수 있어요.</p>
                  <div className="manual-ingredient-grid">
                    <label>kcal/100g<input type="number" min="0" step="0.1" value={manualKcal} onChange={(e) => setManualKcal(e.target.value)} placeholder="0" /></label>
                    <label>단백질g<input type="number" min="0" step="0.1" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} placeholder="0" /></label>
                    <label>지방g<input type="number" min="0" step="0.1" value={manualFat} onChange={(e) => setManualFat(e.target.value)} placeholder="0" /></label>
                    <label>탄수화물g<input type="number" min="0" step="0.1" value={manualCarb} onChange={(e) => setManualCarb(e.target.value)} placeholder="0" /></label>
                  </div>
                  <button type="button" className="button secondary small full" onClick={addManualIngredient}>
                    <Plus size={16} /> &quot;{ingredientQuery.trim()}&quot; 직접 추가
                  </button>
                </div>
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
                        i === index ? { ...item, grams: nonNegative(Number(e.target.value)) } : item,
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

function DryFoodPage({ db, updateDb, back, home, setToast, today }: SharedProps) {
  // 보증 성분(조단백·조지방·조섬유·조회분·수분)을 입력하면 Modified Atwater
  // 방식으로 대사에너지를 자동 계산해 kcal 입력칸에 바로 반영한다. 사용자가
  // kcal 칸을 직접 수정하면 그 이후로는 자동 계산을 멈추고 입력값을 존중한다.
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [ash, setAsh] = useState("");
  const [moisture, setMoisture] = useState("");
  const [kcalManual, setKcalManual] = useState<string | null>(null);

  const nfe = Math.max(
    0,
    100 - toNumber(protein) - toNumber(fat) - toNumber(fiber) - toNumber(ash) - toNumber(moisture),
  );
  const estimatedKcal = toNumber(protein) * 3.5 + toNumber(fat) * 8.5 + nfe * 3.5;
  const kcalIsAuto = kcalManual === null;
  const kcalValue = kcalIsAuto ? (estimatedKcal > 0 ? String(Math.round(estimatedKcal * 10) / 10) : "") : kcalManual;

  function resetForm() {
    setProtein("");
    setFat("");
    setFiber("");
    setAsh("");
    setMoisture("");
    setKcalManual(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const item: DryFood = {
      id: uid("dry"),
      petId: db.pet.id,
      name,
      totalWeight: toNumber(form.get("totalWeight")),
      usedWeight: 0,
      kcalPer100: toNumber(form.get("kcalPer100"), estimatedKcal),
      protein: toNumber(protein),
      fat: toNumber(fat),
      fiber: toNumber(fiber),
      ash: toNumber(ash),
      calcium: toNumber(form.get("calcium")),
      phosphorus: toNumber(form.get("phosphorus")),
      moisture: toNumber(moisture),
    };
    if (!(item.kcalPer100 > 0) || !(item.totalWeight > 0)) {
      setToast("제품 중량과 열량 또는 성분표를 입력해주세요.");
      return;
    }
    updateDb(
      (current) => ({
        ...withPet(current, db.pet.id, (p) => ({ ...p, dryFoodId: p.dryFoodId || item.id })),
        dryFoods: [...current.dryFoods, item],
      }),
      "시중사료를 등록했어요.",
    );
    event.currentTarget.reset();
    resetForm();
  }
  return (
    <>
      <PageHeader title="시중사료 관리" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={submit}>
        <SectionTitle title="사료를 검색해주세요" />
        <section className="form-section">
          <label>제품명<input name="name" placeholder="예: 저지방 처방 건식사료" required /></label>
          <div className="field-grid">
            <label>구매 중량(g)<input name="totalWeight" type="number" min="1" required /></label>
            <label>
              대사에너지(kcal/100g)
              <input
                name="kcalPer100"
                type="number"
                step="0.1"
                value={kcalValue}
                onChange={(e) => setKcalManual(e.target.value)}
                placeholder="성분 입력 시 자동 계산"
              />
            </label>
          </div>
          {kcalIsAuto && estimatedKcal > 0 && (
            <p className="form-note">보증 성분 기준 자동 계산된 값이에요. 직접 입력하면 그 값을 우선 사용해요.</p>
          )}
        </section>
        <section className="form-section">
          <h2>보증 성분</h2>
          <div className="field-grid compact">
            <label>조단백 %<input name="protein" type="number" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
            <label>조지방 %<input name="fat" type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} /></label>
            <label>조섬유 %<input name="fiber" type="number" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)} /></label>
            <label>조회분 %<input name="ash" type="number" step="0.1" value={ash} onChange={(e) => setAsh(e.target.value)} /></label>
            <label>칼슘 %<input name="calcium" type="number" step="0.1" /></label>
            <label>인 %<input name="phosphorus" type="number" step="0.1" /></label>
            <label>수분 %<input name="moisture" type="number" step="0.1" value={moisture} onChange={(e) => setMoisture(e.target.value)} /></label>
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
              <button
                className="danger-link"
                onClick={() => {
                  const inUse = db.pet.dryFoodId === food.id || db.dailyPlans[today]?.dryFoodId === food.id;
                  if (inUse) {
                    setToast("해당 사료는 현재 급여 계획에 연결돼 있어 삭제할 수 없어요. 급여 계획에서 다른 사료로 바꾼 뒤 삭제해주세요.");
                    return;
                  }
                  updateDb((current) => ({ ...current, dryFoods: current.dryFoods.filter((item) => item.id !== food.id) }), "사료를 삭제했어요.");
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function SnackPage({ db, updateDb, back, home, setToast }: SharedProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const item: Snack = {
      id: uid("snack"),
      petId: db.pet.id,
      name,
      totalWeight: toNumber(form.get("totalWeight")),
      usedWeight: 0,
      kcalPer100: toNumber(form.get("kcalPer100")),
      protein: toNumber(form.get("protein")),
      fat: toNumber(form.get("fat")),
      carb: toNumber(form.get("carb")),
    };
    if (!(item.kcalPer100 > 0) || !(item.totalWeight > 0)) {
      setToast("제품 중량과 열량을 입력해주세요.");
      return;
    }
    updateDb((current) => ({ ...current, snacks: [...current.snacks, item] }), "간식을 등록했어요.");
    event.currentTarget.reset();
  }
  return (
    <>
      <PageHeader title="간식 관리" onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={submit}>
        <SectionTitle title="간식을 검색해주세요" />
        <section className="form-section">
          <label>제품명<input name="name" placeholder="예: 오리 육포" required /></label>
          <div className="field-grid">
            <label>구매 중량(g)<input name="totalWeight" type="number" min="1" required /></label>
            <label>열량(kcal/100g)<input name="kcalPer100" type="number" step="0.1" required /></label>
          </div>
          <div className="field-grid compact">
            <label>단백질 %<input name="protein" type="number" step="0.1" /></label>
            <label>지방 %<input name="fat" type="number" step="0.1" /></label>
            <label>탄수화물 %<input name="carb" type="number" step="0.1" /></label>
          </div>
          <p className="form-note warning">
            간식은 하루 목표 열량의 10% 이내로 급여하는 걸 권장해요. 너무 자주 주면 자연식·사료의 영양 균형이 흐트러질 수 있어요.
          </p>
        </section>
        <button className="button primary full" type="submit"><Plus size={18} /> 간식 추가</button>
      </form>
      <section className="page-content previous-section">
        <SectionTitle title="등록된 간식" />
        <div className="stack-list">
          {db.snacks.map((snack) => (
            <div className="stack-row static" key={snack.id}>
              <Cookie size={19} />
              <span><strong>{snack.name}</strong><small>{fmt(snack.kcalPer100)}kcal/100g · 재고 {fmt(remaining(snack.totalWeight, snack.usedWeight))}g</small></span>
              <button className="danger-link" onClick={() => updateDb((current) => ({ ...current, snacks: current.snacks.filter((item) => item.id !== snack.id) }), "간식을 삭제했어요.")}>삭제</button>
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
  setToast,
  type,
  title,
}: SharedProps & { type: Medication["type"]; title: string }) {
  const rows = db.medications.filter((item) => item.type === type);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingMed = rows.find((item) => item.id === editingId) ?? null;

  // 캡슐/정 1개를 하루 여러 회로 나눠 먹이는 경우, "1회당 재고 차감량"을
  // 사람이 직접 분수로 계산해 넣기 번거롭다(예: 1개 ÷ 5회 = 0.2).
  // 그래서 "하루 총 사용량"과 "1일 횟수"만 입력하면 자동으로 나눠 계산해준다.
  // 값을 직접 수정하면 그 이후로는 자동 계산을 멈추고 입력값을 존중한다.
  const [perDay, setPerDay] = useState("1");
  const [dailyAmount, setDailyAmount] = useState("");
  const [stockPerDoseManual, setStockPerDoseManual] = useState<string | null>(null);

  const perDayNum = Math.max(1, toNumber(perDay, 1));
  const autoStockPerDose = dailyAmount.trim() ? toNumber(dailyAmount) / perDayNum : 0;
  const stockPerDoseIsAuto = stockPerDoseManual === null;
  const stockPerDoseValue = stockPerDoseIsAuto
    ? (autoStockPerDose > 0 ? String(Math.round(autoStockPerDose * 1000) / 1000) : "")
    : stockPerDoseManual;

  function resetFormState() {
    setPerDay("1");
    setDailyAmount("");
    setStockPerDoseManual(null);
  }

  function startEdit(med: Medication) {
    setEditingId(med.id);
    setPerDay(String(med.perDay));
    setDailyAmount(String(Math.round(med.perDay * med.stockPerDose * 1000) / 1000));
    setStockPerDoseManual(String(med.stockPerDose));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    resetFormState();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    // 재고·사용량은 음수·0·빈 값·NaN을 조용히 보정하지 않고, 이유를 알려주고
    // 저장 자체를 막는다. 특히 1회당 차감량은 0이면 재고가 전혀 줄지 않는데도
    // "급여 완료" 처리가 가능해지므로 반드시 0보다 커야 한다.
    if (dailyAmount.trim() && !(Number(dailyAmount) >= 0)) {
      setToast("하루 총 사용량은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    const stockRaw = form.get("stock");
    if (stockRaw !== null && String(stockRaw).trim() && !(Number(stockRaw) >= 0)) {
      setToast("재고는 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    const stockPerDoseRaw = form.get("stockPerDose");
    if (!isValidStockPerDose(stockPerDoseRaw)) {
      setToast("1회당 차감량은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    const base = {
      type,
      name,
      prescribedDate: String(form.get("prescribedDate") ?? ""),
      dose: String(form.get("dose") ?? ""),
      perDay: perDayNum,
      stock: toNumber(form.get("stock")),
      stockUnit: String(form.get("stockUnit") ?? "회분"),
      stockPerDose: Number(stockPerDoseRaw),
      memo: String(form.get("memo") ?? ""),
    };
    if (editingId) {
      updateDb(
        (current) => ({
          ...current,
          medications: current.medications.map((item) =>
            item.id === editingId ? { ...item, ...base } : item,
          ),
        }),
        `${name} 정보를 수정했어요.`,
      );
      setEditingId(null);
    } else {
      const medication: Medication = { id: uid(type === "med" ? "med" : "supp"), petId: db.pet.id, ...base };
      updateDb((current) => ({ ...current, medications: [...current.medications, medication] }), `${medication.name}을 등록했어요.`);
    }
    event.currentTarget.reset();
    resetFormState();
  }
  return (
    <>
      <PageHeader title={title} onBack={back} onHome={home} />
      <form className="page-content form-page" onSubmit={submit} noValidate key={editingId ?? "new"}>
        <SectionTitle title={editingId ? "정보를 수정하세요" : type === "med" ? "처방 내용을 정확히 기록하세요" : "제품과 분할 급여법을 기록하세요"} />
        <section className="form-section">
          <label>제품명<input name="name" defaultValue={editingMed?.name ?? ""} required /></label>
          <div className="field-grid">
            <label>{type === "med" ? "처방일" : "구매일"}<input name="prescribedDate" type="date" defaultValue={editingMed?.prescribedDate ?? ""} /></label>
            <label>1일 횟수<input name="perDay" type="number" min="1" value={perDay} onChange={(e) => setPerDay(e.target.value)} /></label>
          </div>
          <label>1회 급여 설명<input name="dose" defaultValue={editingMed?.dose ?? ""} placeholder={type === "supplement" ? "예: 하루 1캡슐 중 1/5회분" : "예: 1/2정"} /></label>
          <div className="field-grid">
            <label>현재 재고<input name="stock" type="number" step="0.1" min="0" defaultValue={editingMed ? roundTo(editingMed.stock, 2) : ""} /></label>
            <label>재고 단위<input name="stockUnit" defaultValue={editingMed?.stockUnit ?? ""} placeholder="정, 캡슐, 포" /></label>
          </div>
          <label>하루 총 사용량<input type="number" step="0.1" min="0" value={dailyAmount} onChange={(e) => setDailyAmount(e.target.value)} placeholder="예: 1 (캡슐 1개를 하루치로)" /></label>
          <label>
            1회당 재고 차감량
            <input
              name="stockPerDose"
              type="number"
              step="any"
              min="0.01"
              value={stockPerDoseValue}
              onChange={(e) => setStockPerDoseManual(e.target.value)}
            />
          </label>
          {stockPerDoseIsAuto && autoStockPerDose > 0 && (
            <p className="form-note">하루 총 사용량 ÷ 1일 횟수로 자동 계산된 값이에요. 직접 입력하면 그 값을 우선 사용해요.</p>
          )}
          <label>메모<textarea name="memo" defaultValue={editingMed?.memo ?? ""} placeholder="성분, 식사와 함께/별도, 보관법 등" /></label>
        </section>
        <div className="button-grid">
          <button className="button primary full" type="submit">
            {editingId ? <><Save size={18} /> 수정 완료</> : <><Plus size={18} /> 등록</>}
          </button>
          {editingId && (
            <button type="button" className="button secondary full" onClick={cancelEdit}>
              취소
            </button>
          )}
        </div>
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
                <div className="row-actions">
                  <IconButton label="수정" onClick={() => startEdit(med)}>
                    <Edit3 size={17} />
                  </IconButton>
                  <button className="danger-link" onClick={() => updateDb((current) => ({ ...current, medications: current.medications.filter((item) => item.id !== med.id) }), "항목을 삭제했어요.")}>삭제</button>
                </div>
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
  const snackTotal = db.snacks.reduce((sum, item) => sum + item.totalWeight, 0);
  const snackUsed = db.snacks.reduce((sum, item) => sum + item.usedWeight, 0);
  const meds = db.medications.filter((item) => item.type === "med");
  const supplements = db.medications.filter((item) => item.type === "supplement");
  // 약·영양제는 캡슐/정/포처럼 단위가 제품마다 달라서 재고를 하나의 %로
  // 합산하면 의미가 없다(그래서 "재고가 하나라도 있으면 무조건 100%"처럼
  // 왜곡돼 보였다). 대신 등록된 항목별 실제 수량을 그대로 보여준다.
  const summaryCards: { label: string; icon: ReactNode; percentValue?: number; detail: ReactNode }[] = [
    { label: "자연식", icon: <Beef />, percentValue: percent(naturalUsed, naturalTotal), detail: `${percent(naturalUsed, naturalTotal)}%` },
    { label: "시중사료", icon: <Bone />, percentValue: percent(dryUsed, dryTotal), detail: `${percent(dryUsed, dryTotal)}%` },
    { label: "간식", icon: <Cookie />, percentValue: percent(snackUsed, snackTotal), detail: `${percent(snackUsed, snackTotal)}%` },
    {
      label: "처방약",
      icon: <Pill />,
      detail: meds.length
        ? meds.map((item) => `${item.name} ${fmt(item.stock, 1)}${item.stockUnit}`).join(" · ")
        : "등록 없음",
    },
    {
      label: "영양제",
      icon: <Sparkles />,
      detail: supplements.length
        ? supplements.map((item) => `${item.name} ${fmt(item.stock, 1)}${item.stockUnit}`).join(" · ")
        : "등록 없음",
    },
  ];
  return (
    <>
      <PageHeader title="재고 관리" onBack={back} onHome={home} />
      <div className="page-content">
        <SectionTitle title="남은 양을 한눈에 확인하세요" />
        <div className="inventory-grid">
          {summaryCards.map((card) => (
            <div className="inventory-summary" key={card.label}>
              <span className="menu-icon">{card.icon}</span>
              <strong>{card.label}</strong>
              {card.percentValue !== undefined ? <b>{card.detail}</b> : <small className="inventory-summary-detail">{card.detail}</small>}
            </div>
          ))}
        </div>
        <SectionTitle title="자연식 재고" description="재고는 목표량을 기준으로 차감됩니다." />
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
        <SectionTitle title="시중사료 재고" description="재고는 목표량을 기준으로 차감됩니다." />
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
        <SectionTitle title="간식 재고" description="재고는 목표량을 기준으로 차감됩니다." />
        <div className="inventory-list">
          {db.snacks.map((snack) => {
            const value = percent(snack.usedWeight, snack.totalWeight);
            return (
              <div className="inventory-row" key={snack.id}>
                <div className="inventory-row-head"><div><strong>{snack.name}</strong><span>남은 {fmt(remaining(snack.totalWeight, snack.usedWeight))}g</span></div><b>{value}%</b></div>
                <div className="inventory-bar"><span style={{ width: `${value}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function HealthPage({ db, updateDb, back, home, setToast }: SharedProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bcsInfoOpen, setBcsInfoOpen] = useState(false);
  const editingRow = db.healthLog.find((item) => item.id === editingId) ?? null;

  function openNewForm() {
    setEditingId(null);
    setFormOpen((value) => !value);
  }

  function startEdit(row: HealthRecord) {
    setEditingId(row.id);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // 체중은 빈칸(미입력)은 허용하되, 값을 입력했다면 0보다 커야 한다.
    // 0 이하 값을 조용히 0으로 보정해서 저장하면 체중 추이 그래프가
    // 깨지므로, 저장 자체를 막고 이유를 알려준다.
    const weightRaw = form.get("weightKg");
    let weightKg: number | null = null;
    if (weightRaw && String(weightRaw).trim()) {
      const parsedWeight = Number(weightRaw);
      if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
        setToast("체중은 0보다 큰 값으로 입력해주세요.");
        return;
      }
      weightKg = parsedWeight;
    }
    const base = {
      datetime: `${String(form.get("date") || localDate())}T${String(form.get("time") || localTime())}`,
      weightKg,
      bcs: form.get("bcs") ? toNumber(form.get("bcs")) : null,
      appetite: String(form.get("appetite") || "normal") as HealthRecord["appetite"],
      vomitCount: toNumber(form.get("vomitCount")),
      stool: form.get("stool") ? toNumber(form.get("stool")) : null,
      vitality: String(form.get("vitality") || "normal") as HealthRecord["vitality"],
      pain: form.get("pain") === "on",
      note: String(form.get("note") || ""),
    };
    if (editingId) {
      updateDb(
        (current) => ({
          ...current,
          healthLog: current.healthLog.map((item) => (item.id === editingId ? { ...item, ...base } : item)),
        }),
        "건강 기록을 수정했어요.",
      );
    } else {
      const record: HealthRecord = { id: uid("health"), petId: db.pet.id, ...base };
      updateDb((current) => ({ ...current, healthLog: [...current.healthLog, record] }), "건강 기록을 저장했어요.");
    }
    closeForm();
  }
  const rows = db.healthLog
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.datetime.localeCompare(a.item.datetime) || b.index - a.index)
    .map(({ item }) => item);
  return (
    <>
      <PageHeader
        title="건강기록 관리"
        onBack={back}
        onHome={home}
        action={
          <IconButton label="건강 기록 추가" onClick={openNewForm}>
            {formOpen && !editingId ? <X size={20} /> : <Plus size={20} />}
          </IconButton>
        }
      />
      <div className="page-content">
        <SectionTitle title="작은 변화를 기록해보세요" />
        {formOpen && (
          <form className="form-section health-form" onSubmit={submit} noValidate key={editingId ?? "new"}>
            <div className="field-grid">
              <label>날짜<input name="date" type="date" defaultValue={editingRow ? editingRow.datetime.slice(0, 10) : localDate()} /></label>
              <label>시간<input name="time" type="time" defaultValue={editingRow ? editingRow.datetime.slice(11, 16) : localTime()} /></label>
            </div>
            <div className="field-grid">
              <label>체중(kg)<input name="weightKg" type="number" step="0.01" min="0.01" defaultValue={editingRow?.weightKg ?? ""} /></label>
              <label>
                <span className="label-with-info">
                  BCS(1–9)
                  <button type="button" className="info-dot" aria-label="BCS 설명 보기" onClick={() => setBcsInfoOpen(true)}>
                    ?
                  </button>
                </span>
                <input name="bcs" type="number" min="1" max="9" aria-label="BCS(1–9)" defaultValue={editingRow?.bcs ?? ""} />
              </label>
            </div>
            <div className="field-grid">
              <label>식욕<select name="appetite" defaultValue={editingRow?.appetite ?? "normal"}><option value="good">좋음</option><option value="normal">보통</option><option value="low">저하</option><option value="none">거부</option></select></label>
              <label>활력<select name="vitality" defaultValue={editingRow?.vitality ?? "normal"}><option value="good">좋음</option><option value="normal">보통</option><option value="low">저하</option></select></label>
            </div>
            <div className="field-grid">
              <label>구토 횟수<input name="vomitCount" type="number" min="0" defaultValue={editingRow?.vomitCount ?? 0} /></label>
              <label>변 상태(1–7)<input name="stool" type="number" min="1" max="7" defaultValue={editingRow?.stool ?? ""} /></label>
            </div>
            <label className="check-label"><input name="pain" type="checkbox" defaultChecked={editingRow?.pain ?? false} /> 통증·복통 의심</label>
            <label>특이사항<textarea name="note" defaultValue={editingRow?.note ?? ""} placeholder="예: 산책 중 묽은 변" /></label>
            <div className="button-grid">
              <button className="button primary full" type="submit">{editingId ? "수정 완료" : "기록 저장"}</button>
              {editingId && (
                <button type="button" className="button secondary full" onClick={closeForm}>
                  취소
                </button>
              )}
            </div>
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
                <div className="row-actions">
                  <IconButton label="건강 기록 수정" onClick={() => startEdit(row)}>
                    <Edit3 size={16} />
                  </IconButton>
                  <IconButton label="건강 기록 삭제" onClick={() => updateDb((current) => ({ ...current, healthLog: current.healthLog.filter((item) => item.id !== row.id) }), "건강 기록을 삭제했어요.")}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={<HeartPulse size={28} />} title="아직 건강 기록이 없어요" description="오른쪽 위 + 버튼으로 첫 기록을 남겨보세요." />
        )}
      </div>
      {bcsInfoOpen && (
        <div className="modal-backdrop" onClick={() => setBcsInfoOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>BCS(체형 점수)란?</h2>
              <IconButton label="닫기" onClick={() => setBcsInfoOpen(false)}>
                <X size={20} />
              </IconButton>
            </div>
            <p>
              갈비뼈·허리 라인을 보고 만져서 평가하는 1~9점 척도의 체형 점수예요. 4~5점이 이상적인 체형이고,
              숫자가 낮을수록 마른 편, 높을수록 비만에 가까워요. 병원에서 체크업 때 함께 알려주는 경우가 많아요.
            </p>
            <button className="button primary full" onClick={() => setBcsInfoOpen(false)}>
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// 하루치 kcal/목표를 계산하는 공용 함수. 주별/월별 집계가 이 값을 여러 날에
// 걸쳐 평균 내는 방식으로 재사용한다.
export function dayKcalAndTarget(db: PetView, key: string) {
  const feeds = dateRecords(db.feedLog, key);
  return {
    kcal: feeds.reduce((sum, item) => sum + item.calculatedKcal, 0),
    target: db.dailyPlans[key]?.targetKcal ?? 0,
  };
}

function StatsPage({ db, back, home }: SharedProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const buckets = useMemo(() => {
    const today = new Date();
    if (period === "daily") {
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - index));
        const key = localDate(date);
        const { kcal, target } = dayKcalAndTarget(db, key);
        return { key, label: `${date.getMonth() + 1}/${date.getDate()}`, kcal, target };
      });
    }
    if (period === "weekly") {
      // 최근 8주. 각 구간은 7일치 하루 평균 섭취/목표 kcal을 보여준다
      // (합계를 그대로 쓰면 목표선과 스케일이 안 맞아 비교가 어려워진다).
      return Array.from({ length: 8 }, (_, index) => {
        const weeksAgo = 7 - index;
        const end = new Date(today);
        end.setDate(end.getDate() - weeksAgo * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        let kcalSum = 0;
        let targetSum = 0;
        let dayCount = 0;
        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
          const { kcal, target } = dayKcalAndTarget(db, localDate(cursor));
          kcalSum += kcal;
          targetSum += target;
          dayCount += 1;
        }
        return {
          key: localDate(start),
          label: `${start.getMonth() + 1}/${start.getDate()}~`,
          kcal: dayCount ? kcalSum / dayCount : 0,
          target: dayCount ? targetSum / dayCount : 0,
        };
      });
    }
    // 월별: 최근 6개월. 이번 달처럼 아직 다 지나지 않은 달은 "지금까지 지난
    // 날짜 수"로만 평균을 내서, 하루이틀치 기록만으로 평균이 왜곡되지 않게 한다.
    return Array.from({ length: 6 }, (_, index) => {
      const monthsAgo = 5 - index;
      const base = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
      const year = base.getFullYear();
      const month = base.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
      const elapsedDays = isCurrentMonth ? today.getDate() : daysInMonth;
      let kcalSum = 0;
      let targetSum = 0;
      for (let day = 1; day <= elapsedDays; day += 1) {
        const { kcal, target } = dayKcalAndTarget(db, localDate(new Date(year, month, day)));
        kcalSum += kcal;
        targetSum += target;
      }
      return {
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        label: `${month + 1}월`,
        kcal: elapsedDays ? kcalSum / elapsedDays : 0,
        target: elapsedDays ? targetSum / elapsedDays : 0,
      };
    });
  }, [db, period]);

  const max = Math.max(1, ...buckets.map((item) => Math.max(item.kcal, item.target)));
  const weightRows = [...db.healthLog]
    .filter((item) => item.weightKg)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(-8);
  const lastWeight = weightRows.at(-1)?.weightKg ?? db.pet.weightKg;
  const weightValues = weightRows.map((row) => row.weightKg ?? lastWeight);
  const weightMin = weightValues.length ? Math.min(...weightValues) : 0;
  const weightMax = weightValues.length ? Math.max(...weightValues) : 0;
  const weightSpan = weightMax - weightMin || 1;
  const weightChartWidth = 300;
  const weightChartHeight = 96;
  const weightPadY = 12;
  const weightPoints = weightRows.map((row, index) => {
    const value = row.weightKg ?? lastWeight;
    const x = weightRows.length > 1 ? (index / (weightRows.length - 1)) * weightChartWidth : weightChartWidth / 2;
    const y = weightPadY + (weightChartHeight - weightPadY * 2) * (1 - (value - weightMin) / weightSpan);
    return { x, y, row };
  });
  const weightPolyline = weightPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const todayFeeds = dateRecords(db.feedLog, localDate());
  const protein = todayFeeds.reduce((sum, item) => sum + item.protein, 0);
  const fat = todayFeeds.reduce((sum, item) => sum + item.fat, 0);
  const periodLabel = period === "daily" ? "최근 7일" : period === "weekly" ? "최근 8주 · 하루 평균" : "최근 6개월 · 하루 평균";
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
            <div><span>{periodLabel}</span><h2>급여 열량</h2></div>
            <span className="metric-chip">목표 스냅샷 기준</span>
          </div>
          <div className="bar-chart" style={{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }}>
            {buckets.map((item) => (
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
            <div className="weight-chart">
              <svg
                viewBox={`0 0 ${weightChartWidth} ${weightChartHeight}`}
                preserveAspectRatio="none"
                className="weight-svg"
              >
                <polyline points={weightPolyline} fill="none" stroke="var(--success)" strokeWidth="2" />
                {weightPoints.map((p) => (
                  <circle key={p.row.id} cx={p.x} cy={p.y} r="3.5" fill="var(--surface)" stroke="var(--terracotta)" strokeWidth="2" />
                ))}
              </svg>
              <div className="weight-chart-labels">
                {weightRows.map((row) => (
                  <span key={row.id}>{row.datetime.slice(5, 10)}</span>
                ))}
              </div>
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
                  <div className="record-symbol">{record.source === "snack" ? <Cookie size={18} /> : <UtensilsCrossed size={18} />}</div>
                  <div>
                    <span className="row-title">
                      <strong>{record.datetime.slice(11, 16)} · {record.label}</strong>
                      {feedStatus(record) !== "eaten" && (
                        <span className={`status-pill status-${feedStatus(record)}`}>
                          {feedStatusLabel(feedStatus(record))}
                        </span>
                      )}
                    </span>
                    <span>목표량 {fmt(record.offeredG)}g · 급여량 {fmt(record.eatenG)}g · {fmt(record.calculatedKcal)}kcal</span>
                    {feedBreakdownText(record) && <span className="breakdown">{feedBreakdownText(record)}</span>}
                    {record.note && <small>{record.note}</small>}
                  </div>
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

function FeedingPlanPage({
  db,
  updateDb,
  back,
  home,
  today,
  plan,
  applyTodayPlan,
}: SharedProps & {
  plan?: DailyPlan;
  applyTodayPlan: (petOverride?: Pet) => void;
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
  // 부모(PetDietApp)가 넘겨주는 planIsCurrent는 "저장된" db.pet 기준이라,
  // 이 화면에서 아직 저장 전인 입력값(draft)을 바꿔도 갱신되지 않는다.
  // 그래서 버튼 문구는 화면에 보이는 값 기준으로 별도 계산한다.
  const draftPlanIsCurrent =
    !!plan && plan.settingsHash === planSettingsHash({ ...db, pet: { ...pet, naturalRatio: ratio } });

  function saveSettings() {
    updateDb(
      (current) => withPet(current, pet.id, () => ({ ...pet, naturalRatio: ratio })),
      "급여 설정을 저장했어요.",
    );
  }
  return (
    <>
      <PageHeader title="급여 계획" onBack={back} onHome={home} />
      <div className="page-content form-page">
        <SectionTitle title="하루 목표와 급여원을 정하세요" />
        <section className="form-section">
          <h2>열량과 횟수</h2>
          <div className="field-grid">
            <label>보호자 목표 kcal<input type="number" min="0" value={pet.dailyTargetKcal} onChange={(e) => setPet({ ...pet, dailyTargetKcal: nonNegative(Number(e.target.value)) })} /></label>
            <label>수의사 지정 kcal<input type="number" min="0" value={pet.vetTargetKcal ?? ""} onChange={(e) => setPet({ ...pet, vetTargetKcal: e.target.value ? nonNegative(Number(e.target.value)) : null })} placeholder="있으면 우선 적용" /></label>
          </div>
          <label>하루 급여 횟수<input type="number" min="1" max="12" value={pet.feedingsPerDay} onChange={(e) => setPet({ ...pet, feedingsPerDay: Math.max(1, nonNegative(Number(e.target.value))) })} /></label>
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
            <div>
              <span>하루 총량</span>
              <strong>
                {[
                  batch ? `자연식 ${fmt(naturalG, 1)}g` : null,
                  dry ? `사료 ${fmt(dryG, 1)}g` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "급여원을 선택해주세요"}
              </strong>
            </div>
            <div>
              <span>1회분</span>
              <strong>
                {[
                  batch ? `자연식 ${fmt(naturalG / pet.feedingsPerDay, 1)}g` : null,
                  dry ? `사료 ${fmt(dryG / pet.feedingsPerDay, 1)}g` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "급여원을 선택해주세요"}
              </strong>
            </div>
          </div>
          <button className="button primary full" onClick={saveSettings}><Save size={18} /> 설정 저장</button>
          <button className={`button full ${draftPlanIsCurrent ? "success" : "ink"}`} onClick={() => applyTodayPlan(pet)}>
            {draftPlanIsCurrent ? <Check size={18} /> : <CalendarDays size={18} />}
            {!plan ? "저장하고 오늘 계획에 적용" : draftPlanIsCurrent ? "오늘 계획 적용 완료" : "변경된 설정으로 오늘 계획 업데이트"}
          </button>
          <p className="form-note">이 버튼은 화면에 입력한 값을 먼저 저장한 뒤 오늘 계획에 적용해요. 위 &quot;설정 저장&quot;만 눌렀다면 아직 오늘 계획에는 반영되지 않아요.</p>
          {plan && <p className="form-note">{today} · 목표 {fmt(plan.targetKcal)}kcal · {plan.feedings}회 스냅샷</p>}
        </section>
      </div>
    </>
  );
}

function SettingsPage({
  updateDb,
  back,
  home,
  exportData,
  importRef,
  importData,
  authState,
  household,
  familyBusy,
  createHousehold,
  leaveHousehold,
  refreshHousehold,
  logout,
  onAccountDeleted,
}: SharedProps & {
  exportData: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
  importData: (file: File) => void;
  authState: AuthState;
  household: HouseholdInfo | null;
  familyBusy: boolean;
  createHousehold: (name: string) => void;
  leaveHousehold: () => void;
  refreshHousehold: () => void;
  logout: () => void;
  onAccountDeleted: () => void;
}) {
  // 계정 정보(이메일 인증 상태, 비밀번호 보유 여부, Google 연결 여부,
  // 이메일 발송 가능 여부)는 여기서 한 번만 불러와 "내 계정", "가족 공유"
  // (나 태그, 비밀번호 유무), "위험 영역"(탈퇴 로직)이 함께 사용한다.
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  const loadAccountInfo = useCallback(() => {
    if (authState !== "signed-in") {
      setAccountInfo(null);
      return;
    }
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: AccountInfo | null) => {
        if (payload) setAccountInfo(payload);
      })
      .catch(() => {});
  }, [authState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccountInfo();
  }, [loadAccountInfo]);

  return (
    <>
      <PageHeader title="설정" onBack={back} onHome={home} />
      <div className="page-content form-page">
        <SectionTitle title="계정과 가족, 백업을 관리하세요" description="급여 목표와 배분 설정은 메뉴의 '급여 계획'에서 관리합니다." />

        {authState === "checking" && <p className="form-note">로그인 상태를 확인하는 중…</p>}
        {authState === "signed-out" && (
          <section className="form-section">
            <h2>로그인</h2>
            <AuthForm onAuthChange={refreshHousehold} />
          </section>
        )}
        {authState === "signed-in" && accountInfo && (
          <MyAccountSection info={accountInfo} onInfoChange={loadAccountInfo} onLogout={logout} />
        )}

        <FamilySharingSection
          authState={authState}
          household={household}
          busy={familyBusy}
          currentUserId={accountInfo?.user.id ?? null}
          hasPassword={accountInfo?.hasPassword ?? null}
          onCreate={createHousehold}
          onHouseholdChange={refreshHousehold}
        />

        <section className="form-section">
          <h2>데이터 관리</h2>
          <p className="form-note">기록은 이 브라우저에 저장됩니다. 기기를 바꾸기 전 JSON 백업을 내려받으세요.</p>
          <div className="button-grid">
            <button className="button secondary" onClick={exportData}><Download size={18} /> 백업 내보내기</button>
            <button className="button secondary" onClick={() => importRef.current?.click()}><Upload size={18} /> 백업 가져오기</button>
          </div>
          <input ref={importRef} className="hidden-input" type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </section>

        <InstallAppSection />

        {authState === "signed-in" && (
          <DangerZoneSection
            household={household}
            accountInfo={accountInfo}
            busy={familyBusy}
            onLeave={leaveHousehold}
            onHouseholdChange={refreshHousehold}
            onAccountDeleted={onAccountDeleted}
            updateDb={updateDb}
          />
        )}
      </div>
    </>
  );
}

// beforeinstallprompt는 표준 타입 정의에 아직 없어 최소한으로 직접 선언한다.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_GUIDE_DISMISSED_KEY = "petDietManager_installGuideDismissed";

// 설정 화면의 "홈 화면에 앱 설치" 항목.
// - 이미 standalone(설치됨)으로 실행 중이면 섹션 전체를 숨긴다.
// - Android/Chromium: beforeinstallprompt를 잡아뒀다가 버튼 클릭 시에만
//   시스템 설치 다이얼로그를 띄운다. 브라우저의 자체 설치 배너 동작에는 관여하지 않는다.
// - iPhone/iPad(Safari): 자동 설치 다이얼로그가 없으므로 안내 문구를 보여주고,
//   한 번 닫으면 localStorage에 기록해 다시 뜨지 않게 한다.
function InstallAppSection() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosGuideDismissed, setIosGuideDismissed] = useState(true);
  const [installBusy, setInstallBusy] = useState(false);
  const [installNotice, setInstallNotice] = useState("");

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standalone));
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    try {
      setIosGuideDismissed(window.localStorage.getItem(INSTALL_GUIDE_DISMISSED_KEY) === "1");
    } catch {
      setIosGuideDismissed(false);
    }

    function handleBeforeInstallPrompt(event: Event) {
      // 브라우저의 기본 설치 미니인포바를 막고, 우리 설정 화면의 버튼 클릭에
      // 맞춰 나중에 직접 띄운다(spec: 반복적으로 강제 노출하지 않기).
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setDeferredPrompt(null);
      setIsStandalone(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstallBusy(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setInstallNotice(choice.outcome === "accepted" ? "설치를 시작했어요." : "설치를 나중에 하기로 했어요.");
      setDeferredPrompt(null);
    } finally {
      setInstallBusy(false);
    }
  }

  function dismissIosGuide() {
    setIosGuideDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_GUIDE_DISMISSED_KEY, "1");
    } catch {
      // localStorage를 쓸 수 없어도 이번 화면에서는 닫힌 상태를 유지한다.
    }
  }

  if (isStandalone) return null;
  const showIosGuide = isIOS && !deferredPrompt && !iosGuideDismissed;
  if (!deferredPrompt && !showIosGuide) return null;

  return (
    <section className="form-section">
      <h2>앱 설치</h2>
      <div className="settings-list">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>홈 화면에 앱 설치</strong>
            <small>
              {deferredPrompt
                ? "홈 화면에 추가하면 앱처럼 바로 열 수 있어요."
                : "Safari의 공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택하고 '웹 앱으로 열기'를 켜주세요."}
            </small>
          </div>
          <div className="settings-row-actions">
            {deferredPrompt ? (
              <button className="button secondary small" disabled={installBusy} onClick={handleInstallClick}>
                <Smartphone size={16} /> 설치
              </button>
            ) : (
              <IconButton label="설치 안내 닫기" onClick={dismissIosGuide}>
                <X size={18} />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      {installNotice && <p className="form-note">{installNotice}</p>}
    </section>
  );
}

type AccountInfo = {
  user: { id: string; email: string; displayName: string | null };
  emailVerified: boolean;
  hasPassword: boolean;
  providers: string[];
  consent: { upToDate: boolean };
  emailServiceAvailable: boolean;
};

// 위험한 작업 확인용 공용 모달. 기존에 BCS 안내 팝업에 쓰던 modal-backdrop/
// modal-card 패턴을 그대로 재사용한다(새 UI 라이브러리를 추가하지 않기 위함).
// 실제 확인 버튼/입력 필드는 children으로 넘겨받은 폼이 담당한다.
function ConfirmDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // 바깥 영역 클릭(위의 onClick={onClose})뿐 아니라 Esc 키로도 안전하게
  // 닫을 수 있어야 한다(반려동물 삭제 확인 팝업 등).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="닫기" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

// "내 계정" 카드: 이메일/인증상태, 비밀번호 로그인, Google 연결을 Google
// Account류 설정 화면처럼 한 줄(row)씩 보여준다. 계정 탈퇴는 이제 여기 없다
// — 되돌릴 수 없는 작업이라 위험 영역(DangerZoneSection)으로 옮겼다.
function MyAccountSection({
  info,
  onInfoChange,
  onLogout,
}: {
  info: AccountInfo;
  onInfoChange: () => void;
  onLogout: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showReauth, setShowReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");

  async function resendVerification() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const payload = (await res.json()) as { error?: string; alreadyVerified?: boolean; code?: string };
      if (!res.ok) {
        setError(payload.error ?? "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setNotice(
        payload.alreadyVerified
          ? "이미 인증된 이메일이에요."
          : "인증 메일을 보냈어요. 받은편지함과 스팸함을 확인해 주세요.",
      );
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "변경하지 못했어요.");
        return;
      }
      setNotice("비밀번호를 저장했어요.");
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordForm(false);
      onInfoChange();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReauthAndLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: reauthPassword }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "확인하지 못했어요.");
        setBusy(false);
        return;
      }
      window.location.href = "/api/auth/google/start?mode=link&next=%2F";
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setBusy(false);
    }
  }

  async function disconnectGoogle() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "연결 해제에 실패했어요.");
        return;
      }
      setNotice("Google 연결을 해제했어요.");
      onInfoChange();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function reconfirmConsent() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/consent", { method: "POST" });
      if (!res.ok) {
        setError("처리하지 못했어요. 다시 시도해주세요.");
        return;
      }
      setNotice("다시 동의했어요.");
      onInfoChange();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  const googleLinked = info.providers.includes("google");

  return (
    <section className="form-section">
      <h3>내 계정</h3>
      {!info.consent.upToDate && (
        <div className="inline-alert">
          <ShieldAlert size={18} /> 이용약관 또는 개인정보처리방침이 업데이트됐어요.
          <button className="button secondary" type="button" disabled={busy} onClick={reconfirmConsent}>
            확인했어요(재동의)
          </button>
        </div>
      )}
      <div className="settings-list">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>이메일</strong>
            <small>{info.user.email}</small>
          </div>
          <div className="settings-row-actions">
            <span className={`status-badge ${info.emailVerified ? "positive" : "warning"}`}>
              {info.emailVerified ? "인증됨" : "인증 필요"}
            </span>
            {!info.emailVerified && info.emailServiceAvailable && (
              <button className="button outline small" disabled={busy} onClick={resendVerification}>
                인증 메일 보내기
              </button>
            )}
          </div>
        </div>
        {!info.emailVerified && !info.emailServiceAvailable && (
          <p className="form-note warning">
            현재 인증 메일을 보낼 수 없습니다. 관리자 설정이 필요합니다.
          </p>
        )}

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>비밀번호 로그인</strong>
            <small>{info.hasPassword ? "설정됨" : "설정 안 됨"}</small>
          </div>
          <div className="settings-row-actions">
            <button
              className="button outline small"
              disabled={busy}
              onClick={() => setShowPasswordForm((value) => !value)}
            >
              {info.hasPassword ? "변경" : "설정"}
            </button>
          </div>
        </div>
        {showPasswordForm && (
          <form onSubmit={submitPasswordChange} className="field-grid compact">
            {info.hasPassword && (
              <label>
                현재 비밀번호
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
            )}
            <label>
              새 비밀번호
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                placeholder="8자 이상"
                required
              />
            </label>
            <button className="button primary full" type="submit" disabled={busy}>
              저장
            </button>
          </form>
        )}

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Google 로그인</strong>
            <small>{googleLinked ? "연결됨" : "연결 안 됨"}</small>
          </div>
          <div className="settings-row-actions">
            {googleLinked ? (
              <button className="button outline small" disabled={busy} onClick={disconnectGoogle}>
                연결 해제
              </button>
            ) : info.hasPassword ? (
              !showReauth && (
                <button className="button outline small" disabled={busy} onClick={() => setShowReauth(true)}>
                  연결하기
                </button>
              )
            ) : null}
          </div>
        </div>
        {!googleLinked && !info.hasPassword && (
          <p className="form-note">비밀번호를 먼저 설정하면 Google 계정을 연결할 수 있어요.</p>
        )}
        {!googleLinked && info.hasPassword && showReauth && (
          <form onSubmit={submitReauthAndLink} className="field-grid compact">
            <label>
              비밀번호 확인
              <input
                type="password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                required
              />
            </label>
            <button className="button primary full" type="submit" disabled={busy}>
              확인하고 Google 연결하기
            </button>
          </form>
        )}
      </div>
      {notice && <p className="form-note">{notice}</p>}
      {error && (
        <div className="inline-alert">
          <ShieldAlert size={18} /> {error}
        </div>
      )}
      <button className="button ghost small" disabled={busy} onClick={onLogout}>
        로그아웃
      </button>
    </section>
  );
}

// "가족 공유" 카드. 개인 계정 정보(MyAccountSection의 몫)는 여기 섞지
// 않는다 — 가족 이름/역할/구성원 수/구성원 목록/초대만 다룬다.
function FamilySharingSection({
  authState,
  household,
  busy,
  currentUserId,
  hasPassword,
  onCreate,
  onHouseholdChange,
}: {
  authState: AuthState;
  household: HouseholdInfo | null;
  busy: boolean;
  currentUserId: string | null;
  hasPassword: boolean | null;
  onCreate: (name: string) => void;
  onHouseholdChange: () => void;
}) {
  const [name, setName] = useState("우리 가족");

  if (authState !== "signed-in") return null;

  return (
    <section className="form-section">
      <h2><Users size={18} /> 가족 공유</h2>
      {!household && (
        <>
          <p className="form-note">
            아직 공유 중인 가족이 없어요. 새로 만들면 지금 이 기기의 기록이 공유 데이터의 시작점이
            돼요. 다른 가족에 합류하려면, 그 가족의 관리자가 이메일로 보내주는 초대 링크를 눌러주세요.
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
        </>
      )}
      {household && (
        <>
          <div className="plan-preview">
            <div>
              <span>가족 이름</span>
              <strong>{household.name}</strong>
            </div>
            <div>
              <span>내 역할</span>
              <strong>{household.role === "owner" ? "관리자" : "구성원"}</strong>
            </div>
            <div>
              <span>구성원 수</span>
              <strong>{household.members.length}명</strong>
            </div>
          </div>
          <HouseholdMembersPanel
            household={household}
            busy={busy}
            currentUserId={currentUserId}
            hasPassword={hasPassword}
            onHouseholdChange={onHouseholdChange}
          />
          <p className="form-note">
            다른 가족 구성원이 기록을 바꾸면 몇 초 안에 이 화면에도 자동으로 반영돼요.
          </p>
        </>
      )}
    </section>
  );
}

// 초대 발송/취소/재발송(owner 전용) + 구성원 목록 + 구성원 제거/소유권
// 이전을 한 곳에 모은 패널. household가 바뀌면(합류/탈퇴 등) 초대 목록을
// 다시 불러온다.
function HouseholdMembersPanel({
  household,
  busy,
  currentUserId,
  hasPassword,
  onHouseholdChange,
}: {
  household: HouseholdInfo;
  busy: boolean;
  currentUserId: string | null;
  hasPassword: boolean | null;
  onHouseholdChange: () => void;
}) {
  const isOwner = household.role === "owner";
  const [invitations, setInvitations] = useState<HouseholdInvitation[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNotice, setInviteNotice] = useState("");
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferPassword, setTransferPassword] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");

  const invitationStatusLabel: Record<HouseholdInvitation["status"], string> = {
    pending: "발송 준비 중",
    sent_pending: "응답 대기 중",
    expired: "만료됨",
    cancelled: "취소됨",
    accepted: "수락됨",
  };

  async function loadInvitations() {
    if (!isOwner) return;
    try {
      const res = await fetch("/api/household/invitations");
      if (!res.ok) return;
      const payload = (await res.json()) as { invitations: HouseholdInvitation[] };
      setInvitations(payload.invitations);
    } catch {
      // 초대 목록을 못 불러와도 나머지 화면은 정상 동작해야 한다.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvitations(null);
    if (isOwner) loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id, isOwner]);

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteNotice("");
    try {
      const res = await fetch("/api/household/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setInviteNotice(payload.error ?? "초대를 보내지 못했어요.");
        return;
      }
      setInviteEmail("");
      setInviteNotice("초대 이메일을 보냈어요.");
      await loadInvitations();
    } catch {
      setInviteNotice("네트워크 오류로 초대를 보내지 못했어요.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function cancelInvite(id: string) {
    setInviteBusy(true);
    try {
      await fetch("/api/household/invitations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: id }),
      });
      await loadInvitations();
    } finally {
      setInviteBusy(false);
    }
  }

  async function resendInvite(id: string) {
    setInviteBusy(true);
    setInviteNotice("");
    try {
      const res = await fetch("/api/household/invitations/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: id }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setInviteNotice(payload.error ?? "재발송하지 못했어요.");
        return;
      }
      setInviteNotice("초대를 다시 보냈어요. 이전 링크는 더 이상 쓸 수 없어요.");
      await loadInvitations();
    } catch {
      setInviteNotice("네트워크 오류로 재발송하지 못했어요.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm("이 구성원을 가족에서 제거할까요? 제거되면 곧바로 공유 데이터에 접근할 수 없게 돼요.")) return;
    setMemberBusyId(userId);
    try {
      const res = await fetch("/api/household/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (res.ok) onHouseholdChange();
    } finally {
      setMemberBusyId(null);
    }
  }

  function startGoogleReauthForTransfer() {
    window.location.href =
      "/api/auth/google/start?mode=reauth&next=" + encodeURIComponent("/?reauthDone=ownership-transfer");
  }

  async function submitTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferTarget) {
      setTransferError("이전할 구성원을 선택해주세요.");
      return;
    }
    setTransferBusy(true);
    setTransferError("");
    try {
      const res = await fetch("/api/household/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: transferTarget, password: transferPassword }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTransferError(payload.error ?? "소유권을 이전하지 못했어요.");
        return;
      }
      setShowTransfer(false);
      setTransferPassword("");
      setTransferTarget("");
      onHouseholdChange();
    } catch {
      setTransferError("네트워크 오류가 발생했어요.");
    } finally {
      setTransferBusy(false);
    }
  }

  const otherMembers = household.members.filter((m) => m.role !== "owner");

  return (
    <div className="menu-group">
      {isOwner && (
        <>
          <h3>구성원 초대</h3>
          <form onSubmit={sendInvite} className="field-grid compact">
            <label>
              초대할 이메일
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="family@example.com"
                required
              />
            </label>
            <button className="button outline small" type="submit" disabled={inviteBusy}>
              <Mail size={18} /> 초대 이메일 보내기
            </button>
          </form>
          {inviteNotice && <p className="form-note">{inviteNotice}</p>}
        </>
      )}

      {household.members.map((member) => {
        const isMe = Boolean(currentUserId && member.userId === currentUserId);
        return (
          <div className="menu-row with-actions" key={member.userId ?? member.email}>
            <span className="menu-icon"><Users size={18} /></span>
            <span>
              <strong>
                {member.displayName ?? member.email} {isMe && <span className="status-badge">나</span>}
              </strong>
              <small>{member.email}</small>
              <small>{member.role === "owner" ? "관리자" : "구성원"}</small>
            </span>
            <span className="menu-row-actions">
              {isOwner && member.role === "member" && member.userId && (
                <button
                  className="button outline small"
                  disabled={busy || memberBusyId === member.userId}
                  onClick={() => removeMember(member.userId!)}
                >
                  제거
                </button>
              )}
            </span>
          </div>
        );
      })}

      {isOwner && invitations && invitations.length > 0 && (
        <>
          <h3>초대 현황</h3>
          <div className="menu-group">
            {invitations.map((inv) => (
              <div className="menu-row with-actions" key={inv.id}>
                <span className="menu-icon"><Mail size={18} /></span>
                <span>
                  <strong>{inv.email}</strong>
                  <small>{invitationStatusLabel[inv.status]}</small>
                </span>
                <span className="menu-row-actions">
                  {(inv.status === "sent_pending" || inv.status === "pending" || inv.status === "expired") && (
                    <>
                      <button className="button outline small" disabled={inviteBusy} onClick={() => resendInvite(inv.id)}>
                        재발송
                      </button>
                      <button className="button outline small" disabled={inviteBusy} onClick={() => cancelInvite(inv.id)}>
                        취소
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {isOwner && otherMembers.length > 0 && (
        <>
          <h3>소유권 이전</h3>
          <button className="button outline small" onClick={() => setShowTransfer(true)}>
            <ShieldAlert size={18} /> 다른 구성원에게 소유권 이전하기
          </button>
          {showTransfer && (
            <ConfirmDialog title="소유권 이전" onClose={() => setShowTransfer(false)}>
              <form onSubmit={submitTransfer} className="field-grid compact">
                <label>
                  새 관리자
                  <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} required>
                    <option value="">선택해주세요</option>
                    {otherMembers.map((m) => (
                      <option key={m.userId ?? m.email} value={m.userId ?? ""}>
                        {m.displayName ?? m.email}
                      </option>
                    ))}
                  </select>
                </label>
                {hasPassword ? (
                  <label>
                    본인 비밀번호 확인
                    <input
                      type="password"
                      value={transferPassword}
                      onChange={(e) => setTransferPassword(e.target.value)}
                      required
                    />
                  </label>
                ) : (
                  <>
                    <p className="form-note">
                      비밀번호가 없는 계정이라, 연결된 Google 계정으로 다시 로그인해서 본인임을
                      확인해야 해요.
                    </p>
                    <button className="button secondary full" type="button" onClick={startGoogleReauthForTransfer}>
                      Google로 본인 확인하기
                    </button>
                  </>
                )}
                {transferError && (
                  <div className="inline-alert">
                    <ShieldAlert size={18} /> {transferError}
                  </div>
                )}
                <button className="button primary full" type="submit" disabled={transferBusy}>
                  이전 확정
                </button>
              </form>
            </ConfirmDialog>
          )}
        </>
      )}
    </div>
  );
}

// 위험 영역: 가족 나가기(또는 혼자 남은 owner의 가족 공간 삭제), 계정
// 탈퇴, 이 기기 데이터 초기화를 한 카드에 모은다. 각 작업은 작은
// destructive outline 버튼으로만 노출하고, 실제 확정은 ConfirmDialog
// 안에서만 이뤄진다. 서버 쪽 권한 검사(소유권 이전 전 탈퇴 차단, 유일한
// 로그인 수단 보호 등)는 그대로 유지되며 이 컴포넌트는 그 결과를 안내만
// 한다 — UI를 숨기는 것으로 권한을 대신하지 않는다.
function DangerZoneSection({
  household,
  accountInfo,
  busy,
  onLeave,
  onHouseholdChange,
  onAccountDeleted,
  updateDb,
}: {
  household: HouseholdInfo | null;
  accountInfo: AccountInfo | null;
  busy: boolean;
  onLeave: () => void;
  onHouseholdChange: () => void;
  onAccountDeleted: () => void;
  updateDb: (updater: (current: Database) => Database, message?: string) => void;
}) {
  const [openDialog, setOpenDialog] = useState<null | "delete-household" | "delete-account" | "reset-local">(null);
  const [password, setPassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");

  const hasPassword = accountInfo?.hasPassword ?? null;
  const isOwner = household?.role === "owner";
  const isSoleOwner = isOwner && household.members.length <= 1;
  const isOwnerBlocked = isOwner && household.members.length > 1;

  function closeDialog() {
    setOpenDialog(null);
    setPassword("");
    setError("");
  }

  function startGoogleReauth(next: string) {
    window.location.href = "/api/auth/google/start?mode=reauth&next=" + encodeURIComponent(next);
  }

  async function submitDeleteHousehold(event: FormEvent) {
    event.preventDefault();
    setDeleteBusy(true);
    setError("");
    try {
      const res = await fetch("/api/household/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "가족 공간을 삭제하지 못했어요.");
        return;
      }
      closeDialog();
      onHouseholdChange();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitDeleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasPassword ? { password } : {}),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "탈퇴하지 못했어요.");
        return;
      }
      closeDialog();
      onAccountDeleted();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function submitResetLocal() {
    updateDb(() => emptyDatabase(), "모든 데이터를 초기화했어요.");
    closeDialog();
  }

  return (
    <section className="form-section danger-zone">
      <h2>위험 영역</h2>

      {household && (
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>가족 나가기</strong>
            <small>
              {isOwnerBlocked
                ? "먼저 다른 구성원에게 소유권을 이전해야 나갈 수 있어요"
                : isSoleOwner
                  ? "혼자 남은 관리자예요. 나가려면 가족 공간 자체를 삭제해야 해요"
                  : "가족 공유 기록은 그대로 남고, 이 계정만 가족에서 빠져요"}
            </small>
          </div>
          <div className="settings-row-actions">
            {isOwnerBlocked ? null : isSoleOwner ? (
              <button className="button danger-outline small" disabled={busy} onClick={() => setOpenDialog("delete-household")}>
                가족 공간 삭제
              </button>
            ) : (
              <button className="button danger-outline small" disabled={busy} onClick={onLeave}>
                가족 나가기
              </button>
            )}
          </div>
        </div>
      )}

      <div className="settings-row">
        <div className="settings-row-label">
          <strong>계정 탈퇴</strong>
          <small>
            {isOwnerBlocked
              ? "먼저 다른 구성원에게 소유권을 이전해야 탈퇴할 수 있어요"
              : isSoleOwner
                ? "이 가족의 이름·공유 기록·초대 내역도 함께 영구히 삭제돼요"
                : household
                  ? "가족의 공유 기록은 남고, 이 계정의 로그인 정보만 사라져요"
                  : "로그인할 수 없게 되고, 되돌릴 수 없어요"}
          </small>
        </div>
        <div className="settings-row-actions">
          {!isOwnerBlocked && (
            <button className="button danger-outline small" disabled={busy} onClick={() => setOpenDialog("delete-account")}>
              계정 탈퇴
            </button>
          )}
        </div>
      </div>
      {isOwnerBlocked && (
        <p className="form-note warning">
          지금은 이 가족의 관리자예요. 다른 구성원이 있는 동안에는 나가거나 탈퇴할 수 없어요. 먼저
          위쪽 가족 공유 화면에서 다른 구성원에게 소유권을 이전해주세요.
        </p>
      )}

      <div className="settings-row">
        <div className="settings-row-label">
          <strong>이 기기 데이터 초기화</strong>
          <small>반려동물 프로필을 포함해 이 브라우저의 모든 기록이 지워져요</small>
        </div>
        <div className="settings-row-actions">
          <button className="button danger-outline small" onClick={() => setOpenDialog("reset-local")}>
            초기화
          </button>
        </div>
      </div>

      {openDialog === "delete-household" && (
        <ConfirmDialog title="가족 공간 삭제" onClose={closeDialog}>
          <form onSubmit={submitDeleteHousehold} className="field-grid compact">
            <p className="form-note warning">
              가족 공간을 삭제하면 가족 이름·공유 기록·초대 내역이 모두 영구히 사라져요. 이 기기에
              저장된 데이터는 지워지지 않으니, 필요하면 데이터 관리의 내보내기로 먼저 백업해두세요.
            </p>
            {hasPassword ? (
              <label>
                본인 비밀번호 확인
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
            ) : (
              <>
                <p className="form-note">
                  비밀번호가 없는 계정이라, 연결된 Google 계정으로 다시 로그인해서 본인임을 확인해야
                  해요.
                </p>
                <button
                  className="button secondary full"
                  type="button"
                  onClick={() => startGoogleReauth("/?reauthDone=household-delete")}
                >
                  Google로 본인 확인하기
                </button>
              </>
            )}
            {error && (
              <div className="inline-alert">
                <ShieldAlert size={18} /> {error}
              </div>
            )}
            <button className="button danger full" type="submit" disabled={deleteBusy}>
              가족 공간 삭제 확정
            </button>
          </form>
        </ConfirmDialog>
      )}

      {openDialog === "delete-account" && (
        <ConfirmDialog title="계정 탈퇴" onClose={closeDialog}>
          <form onSubmit={submitDeleteAccount} className="field-grid compact">
            <p className="form-note warning">
              {isSoleOwner
                ? "탈퇴하면 로그인 정보와 함께 이 가족의 이름·공유 기록·초대 내역까지 모두 영구히 삭제돼요. 되돌릴 수 없어요."
                : household
                  ? "탈퇴하면 로그인 정보가 즉시 사라져요. 가족 공유 기록은 그대로 남아 다른 구성원이 계속 사용해요."
                  : "탈퇴하면 로그인 정보가 즉시 사라지고 되돌릴 수 없어요."}
              {" "}이 기기에 저장된 급여·기록 데이터는 지워지지 않으니, 필요하면 데이터 관리의
              내보내기로 먼저 백업해두세요.
            </p>
            {hasPassword ? (
              <label>
                비밀번호 확인
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
            ) : (
              <>
                <p className="form-note">
                  비밀번호가 없는 계정이라, 이메일 재입력 대신 연결된 Google 계정으로 다시 로그인해서
                  본인임을 확인해야 해요.
                </p>
                <button
                  className="button secondary full"
                  type="button"
                  onClick={() => startGoogleReauth("/?reauthDone=account-delete")}
                >
                  Google로 본인 확인하기
                </button>
              </>
            )}
            {error && (
              <div className="inline-alert">
                <ShieldAlert size={18} /> {error}
              </div>
            )}
            <button className="button danger full" type="submit" disabled={deleteBusy}>
              탈퇴 확정
            </button>
          </form>
        </ConfirmDialog>
      )}

      {openDialog === "reset-local" && (
        <ConfirmDialog title="이 기기 데이터 초기화" onClose={closeDialog}>
          <p className="form-note warning">
            모든 기록을 초기화할까요? 반려동물 프로필을 포함해 완전히 빈 상태가 되며, 되돌릴 수
            없습니다.
          </p>
          <button className="button danger full" onClick={submitResetLocal}>
            <Trash2 size={18} /> 초기화 확정
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}

function AuthForm({ onAuthChange }: { onAuthChange: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [agreed, setAgreed] = useState(false);

  function switchMode(next: "login" | "signup" | "forgot") {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const payload = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          setError(payload.error ?? "처리하지 못했어요. 다시 시도해주세요.");
          return;
        }
        setNotice(payload.message ?? "해당 이메일로 가입된 계정이 있다면, 재설정 링크를 보냈어요.");
        return;
      }
      if (mode === "signup" && !agreed) {
        setError("이용약관과 개인정보처리방침에 동의해주세요.");
        return;
      }
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, password, displayName, agreed },
        ),
      });
      const payload = (await res.json()) as { error?: string; emailVerificationSent?: boolean };
      if (!res.ok) {
        setError(payload.error ?? "처리하지 못했어요. 다시 시도해주세요.");
        return;
      }
      if (mode === "signup") {
        setNotice(
          payload.emailVerificationSent
            ? "가입됐어요. 이메일함에서 인증 링크를 확인해주세요."
            : "가입됐어요. 인증 메일은 아직 보내지 못했어요 — 나중에 계정 설정에서 다시 보낼 수 있어요.",
        );
      }
      onAuthChange();
    } catch {
      setError("네트워크 오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithGoogle() {
    // 회원가입 탭에서는 체크박스에 동의해야만 진행할 수 있다(신규 계정
    // 생성 시 서버가 이 값을 다시 확인한다). 로그인 탭에서는 이미 있는
    // 계정으로 로그인하는 것이므로 동의 여부와 무관하게 진행한다.
    if (mode === "signup" && !agreed) {
      setError("이용약관과 개인정보처리방침에 동의해주세요.");
      return;
    }
    const agreedParam = mode === "signup" && agreed ? "1" : "0";
    window.location.href = `/api/auth/google/start?next=%2F&agreed=${agreedParam}`;
  }

  return (
    <form onSubmit={submit}>
      <p className="form-note">
        가족과 기록을 함께 보려면 먼저 로그인해주세요. 계정이 없다면 회원가입으로 새로 만들 수
        있어요.
      </p>
      {mode !== "forgot" && (
        <div className="tab-toggle">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
            로그인
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>
            회원가입
          </button>
        </div>
      )}
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
      {mode !== "forgot" && (
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
      )}
      {mode === "signup" && (
        <label className="check-label">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
          <span>
            <a href="/terms" target="_blank" rel="noreferrer">
              이용약관
            </a>
            {" 및 "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              개인정보처리방침
            </a>
            에 동의합니다 (필수)
          </span>
        </label>
      )}
      {notice && <p className="form-note">{notice}</p>}
      {error && (
        <div className="inline-alert">
          <ShieldAlert size={18} /> {error}
        </div>
      )}
      <button className="button primary full" type="submit" disabled={busy}>
        {mode === "login" ? "로그인" : mode === "signup" ? "회원가입" : "재설정 링크 보내기"}
      </button>
      {mode === "login" && (
        <button type="button" className="button secondary full" onClick={() => switchMode("forgot")}>
          비밀번호를 잊으셨나요?
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="button secondary full" onClick={() => switchMode("login")}>
          로그인으로 돌아가기
        </button>
      )}
      {mode !== "forgot" && (
        <button type="button" className="button secondary full" onClick={continueWithGoogle}>
          Google로 계속하기
        </button>
      )}
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
    const rounded = Math.round(nonNegative(value));
    setNaturalOfferedG(rounded);
    if (!naturalEatenTouched) setNaturalEatenG(rounded);
  }
  function changeNaturalEaten(value: number) {
    setNaturalEatenTouched(true);
    setNaturalEatenG(Math.round(nonNegative(value)));
  }
  function changeDryOffered(value: number) {
    const rounded = Math.round(nonNegative(value));
    setDryOfferedG(rounded);
    if (!dryEatenTouched) setDryEatenG(rounded);
  }
  function changeDryEaten(value: number) {
    setDryEatenTouched(true);
    setDryEatenG(Math.round(nonNegative(value)));
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="급여량 수정">
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><div><span className="eyebrow">이번 끼니</span><h2>목표량과 급여량</h2></div><IconButton label="닫기" onClick={onClose}><X size={20} /></IconButton></div>
        <p className="form-note">재고는 목표량을 기준으로 차감됩니다. 섭취 열량은 실제 급여량을 기준으로 계산됩니다.</p>
        {plan.batchId && <div className="sheet-source"><strong>자연식</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={naturalOfferedG} onChange={(e) => changeNaturalOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={naturalEatenG} onChange={(e) => changeNaturalEaten(Number(e.target.value))} /></label></div></div>}
        {plan.dryFoodId && <div className="sheet-source"><strong>시중사료</strong><div className="field-grid"><label>목표량(g)<input type="number" step="1" value={dryOfferedG} onChange={(e) => changeDryOffered(Number(e.target.value))} /></label><label>급여량(g)<input type="number" step="1" value={dryEatenG} onChange={(e) => changeDryEaten(Number(e.target.value))} /></label></div></div>}
        <label>메모<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="남긴 이유, 식욕 등" /></label>
        <button className="button primary full" onClick={() => onSave({ naturalOfferedG, naturalEatenG, dryOfferedG, dryEatenG, note, time: localTime() })}>급여 기록 저장</button>
      </div>
    </div>
  );
}

function SnackSheet({
  snacks,
  onClose,
  onSave,
  openSnackPage,
}: {
  snacks: Snack[];
  onClose: () => void;
  onSave: (snackId: string, grams: number) => void;
  openSnackPage: () => void;
}) {
  const [snackId, setSnackId] = useState(snacks[0]?.id ?? "");
  const [grams, setGrams] = useState("");
  const snack = snacks.find((item) => item.id === snackId) ?? null;
  const kcal = snack ? (Number(grams || 0) * snack.kcalPer100) / 100 : 0;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="간식 급여">
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><div><span className="eyebrow">간식</span><h2>간식 급여 기록</h2></div><IconButton label="닫기" onClick={onClose}><X size={20} /></IconButton></div>
        {snacks.length === 0 ? (
          <EmptyState
            icon={<Cookie size={26} />}
            title="등록된 간식이 없어요"
            description="먼저 간식을 등록해주세요."
            action={<button className="button primary" onClick={openSnackPage}>간식 등록하러 가기</button>}
          />
        ) : (
          <>
            <label>
              간식 선택
              <select value={snackId} onChange={(e) => setSnackId(e.target.value)}>
                {snacks.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} ({fmt(item.kcalPer100)}kcal/100g)</option>
                ))}
              </select>
            </label>
            <label>급여량(g)<input type="number" min="0" step="1" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="0" /></label>
            <div className="result-strip">
              <span>예상 열량</span>
              <strong>{fmt(kcal)} kcal</strong>
            </div>
            <button
              className="button primary full"
              disabled={!snack || !(Number(grams) > 0)}
              onClick={() => snack && onSave(snack.id, Number(grams))}
            >
              간식 급여 기록
            </button>
          </>
        )}
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
    const rounded = Math.round(nonNegative(value));
    setOfferedG(rounded);
    if (!eatenTouched) setEatenG(rounded);
  }
  function changeEaten(value: number) {
    setEatenTouched(true);
    setEatenG(Math.round(nonNegative(value)));
  }

  const [naturalOfferedG, setNaturalOfferedG] = useState(Math.round(record.naturalOfferedG ?? 0));
  const [naturalEatenG, setNaturalEatenG] = useState(Math.round(record.naturalEatenG ?? 0));
  const [naturalEatenTouched, setNaturalEatenTouched] = useState(
    (record.naturalOfferedG ?? 0) !== (record.naturalEatenG ?? 0),
  );
  function changeNaturalOffered(value: number) {
    const rounded = Math.round(nonNegative(value));
    setNaturalOfferedG(rounded);
    if (!naturalEatenTouched) setNaturalEatenG(rounded);
  }
  function changeNaturalEaten(value: number) {
    setNaturalEatenTouched(true);
    setNaturalEatenG(Math.round(nonNegative(value)));
  }

  const [dryOfferedG, setDryOfferedG] = useState(Math.round(record.dryOfferedG ?? 0));
  const [dryEatenG, setDryEatenG] = useState(Math.round(record.dryEatenG ?? 0));
  const [dryEatenTouched, setDryEatenTouched] = useState(
    (record.dryOfferedG ?? 0) !== (record.dryEatenG ?? 0),
  );
  function changeDryOffered(value: number) {
    const rounded = Math.round(nonNegative(value));
    setDryOfferedG(rounded);
    if (!dryEatenTouched) setDryEatenG(rounded);
  }
  function changeDryEaten(value: number) {
    setDryEatenTouched(true);
    setDryEatenG(Math.round(nonNegative(value)));
  }

  function submit() {
    // 날짜·시간 입력을 비워둔 채 저장하면 안 되므로, 비었을 때는 원래
    // 기록의 시각으로 되돌린다.
    const safeDatetime = datetime.trim() || record.datetime;
    // 목표량(계획된 양)과 급여량(실제로 준 양)은 서로 다른 값일 수 있으므로
    // 급여량을 목표량으로 강제로 깎지 않는다.
    if (isMixed) {
      const totalOffered = naturalOfferedG + dryOfferedG;
      const totalEaten = naturalEatenG + dryEatenG;
      onSave({
        datetime: safeDatetime,
        note,
        offeredG: totalOffered,
        eatenG: totalEaten,
        naturalOfferedG,
        naturalEatenG,
        dryOfferedG,
        dryEatenG,
      });
    } else {
      onSave({ datetime: safeDatetime, note, offeredG, eatenG });
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="급여 기록 수정">
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><div><span className="eyebrow">기록 수정</span><h2>{record.label}</h2></div><IconButton label="닫기" onClick={onClose}><X size={20} /></IconButton></div>
        <p className="form-note">재고는 목표량을 기준으로 차감됩니다. 섭취 열량은 실제 급여량을 기준으로 계산됩니다.</p>
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
