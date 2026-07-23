import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull(),
    userEmail: text("user_email").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("member"), // "owner" | "member"
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("household_members_household_email_idx").on(
      table.householdId,
      table.userEmail,
    ),
  ],
);
