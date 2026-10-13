// Run: npm test   (node --test with built-in TypeScript type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixedOverlap, sameNonFixed, describeSelectors, formatDay, groupTemplates, isDuplicateKeyError, isEditable,
  remainingQuota, splitByToday, timesOverlap,
} from "../lib/schedule-utils.ts";

const item = (id, day, mode, start = "", end = "", minutes = 45) => ({ id, day, mode, start, end, minutes });
const tpl = (over) => ({
  id: crypto.randomUUID(), slot_key: crypto.randomUUID(), starts_on: "2026-10-14", ends_on: null, execution_mode: "fixed",
  selector_kind: "weekday", selector_value: 1, start_time: "19:00:00", end_time: "20:00:00",
  window_start: null, window_end: null, planned_minutes: null, ...over,
});

test("formatDay shows month, day and weekday", () => {
  assert.equal(formatDay("2026-10-14", true), "10月14日 周三");
  assert.equal(formatDay("2026-10-14", false), "Wed, Oct 14");
  assert.equal(formatDay("2026-02-28", true), "2月28日 周六");
});

test("timesOverlap treats touching slots as free", () => {
  assert.equal(timesOverlap("09:00", "10:00", "10:00", "11:00"), false);
  assert.equal(timesOverlap("09:00", "10:30", "10:00", "11:00"), true);
});

test("fixed slots of one task may not overlap; touching is fine", () => {
  const existing = [item("a", "2026-10-14", "fixed", "19:00", "20:00", 60)];
  assert.equal(fixedOverlap(item("x", "2026-10-14", "fixed", "19:30", "20:30"), existing), true);
  assert.equal(fixedOverlap(item("x", "2026-10-14", "fixed", "20:00", "21:00"), existing), false);
  assert.equal(fixedOverlap(item("x", "2026-10-14", "fixed", "07:00", "08:00"), existing), false, "a second slot that day is allowed");
  assert.equal(fixedOverlap(item("x", "2026-10-15", "fixed", "19:00", "20:00"), existing), false);
});

test("window and flexible never block; identical ones only trigger a warning", () => {
  const existing = [item("a", "2026-10-14", "fixed", "09:00", "12:00", 180), item("b", "2026-10-14", "window", "09:00", "12:00", 90), item("c", "2026-10-14", "flexible", "", "", 30)];
  assert.equal(fixedOverlap(item("x", "2026-10-14", "window", "10:00", "12:00", 45), existing), false, "overlapping windows are allowed");
  assert.equal(sameNonFixed(item("x", "2026-10-14", "window", "10:00", "12:00", 45), existing), false);
  assert.equal(sameNonFixed(item("x", "2026-10-14", "window", "09:00", "12:00", 90), existing), true, "identical window: warn");
  assert.equal(sameNonFixed(item("x", "2026-10-14", "flexible", "", "", 30), existing), true, "identical flexible: warn");
  assert.equal(sameNonFixed(item("x", "2026-10-14", "flexible", "", "", 45), existing), false);
  assert.equal(sameNonFixed(item("x", "2026-10-14", "fixed", "09:00", "12:00", 180), existing), false, "fixed is never a soft duplicate");
});

test("list order (D07): upcoming ascending by day then time, past newest first", () => {
  const rows = [
    item("3", "2026-10-20", "fixed", "09:00", "10:00"),
    item("1", "2026-10-14", "fixed", "19:00", "20:00"),
    item("2", "2026-10-14", "fixed", "07:00", "08:00"),
    item("p1", "2026-10-01", "flexible"),
    item("p2", "2026-10-10", "flexible"),
  ];
  const { upcoming, past } = splitByToday(rows, "2026-10-13");
  assert.deepEqual(upcoming.map((r) => r.id), ["2", "1", "3"]);
  assert.deepEqual(past.map((r) => r.id), ["p2", "p1"]);
});

test("history protection (C06): only today or later is editable", () => {
  assert.equal(isEditable("2026-10-12", "2026-10-13"), false);
  assert.equal(isEditable("2026-10-13", "2026-10-13"), true);
});

test("grouping uses explicit identity only: identical independent series stay separate", () => {
  const before = groupTemplates([
    tpl({ slot_key: "s1", selector_value: 1 }), tpl({ slot_key: "s2", selector_value: 1 }),
  ], "2026-10-13");
  assert.equal(before.length, 2, "same weekday and time, no batch_id: two rows");
  const batched = groupTemplates([
    tpl({ slot_key: "a5", batch_id: "A", selector_value: 5, start_time: "20:00:00", end_time: "21:00:00" }),
    tpl({ slot_key: "a1", batch_id: "A", selector_value: 1 }), tpl({ slot_key: "a3", batch_id: "A", selector_value: 3 }),
    tpl({ slot_key: "b1", batch_id: "B", selector_value: 1 }),
  ], "2026-10-13");
  assert.equal(batched.length, 2);
  const a = batched.find((g) => g.key === "A");
  assert.deepEqual(a.slots.map((x) => x.slot_key), ["a1", "a3", "a5"]);
  assert.equal(a.uniformTiming, false, "Friday has its own time");
  assert.equal(describeSelectors(a.templates, true), "每周一、三、五");
});

test("slot versions: the current one is shown, later revisions listed, ended ones hidden", () => {
  const groups = groupTemplates([
    tpl({ id: "old", slot_key: "s", starts_on: "2026-09-01", ends_on: "2026-09-30" }),
    tpl({ id: "now", slot_key: "s", starts_on: "2026-10-01", ends_on: "2026-10-31" }),
    tpl({ id: "next", slot_key: "s", starts_on: "2026-11-01", ends_on: null, start_time: "07:00:00", end_time: "08:00:00" }),
  ], "2026-10-13");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slots[0].current.id, "now");
  assert.deepEqual(groups[0].slots[0].later.map((v) => v.id), ["next"]);
});

test("describeSelectors covers weekdays, month days and month end", () => {
  assert.equal(describeSelectors([1, 2, 3, 4, 5].map((v) => tpl({ selector_value: v })), true), "每个工作日");
  assert.equal(describeSelectors([
    tpl({ selector_kind: "month_day", selector_value: 15 }), tpl({ selector_kind: "month_day", selector_value: 1 }),
    tpl({ selector_kind: "month_end", selector_value: null }),
  ], true), "每月 1、15 日、月末");
  assert.equal(describeSelectors([tpl({ selector_kind: "all", selector_value: null })], true), "每天");
});

test("flexible quota (A09): never negative", () => {
  assert.equal(remainingQuota(3, 1), 2);
  assert.equal(remainingQuota(3, 5), 0);
});

test("idempotent retry (B10): unique violation counts as already saved", () => {
  assert.equal(isDuplicateKeyError({ code: "23505" }), true);
  assert.equal(isDuplicateKeyError({ code: "42501" }), false);
  assert.equal(isDuplicateKeyError(null), false);
});

import { periodRange, periodTarget } from "../lib/schedule-utils.ts";

test("completion periods: day, Monday-start week, calendar month", () => {
  assert.deepEqual(periodRange("2026-10-14", "day"), { start: "2026-10-14", end: "2026-10-14" });
  assert.deepEqual(periodRange("2026-10-18", "week"), { start: "2026-10-12", end: "2026-10-18" }, "Sunday belongs to the week that began Monday");
  assert.deepEqual(periodRange("2028-02-10", "month"), { start: "2028-02-01", end: "2028-02-29" });
});

test("period targets: count goals, fixed weekdays, fixed month dates that exist", () => {
  const base = { weekdays: [], month_days: [], include_month_end: false };
  assert.equal(periodTarget({ ...base, period: "day", arrangement: "flexible", target_count: 8 }, "2026-10-14"), 8, "drink water 8 times a day");
  assert.equal(periodTarget({ ...base, period: "week", arrangement: "fixed", target_count: 3, weekdays: [1, 3, 5] }, "2026-10-14"), 3);
  const monthly = { ...base, period: "month", arrangement: "fixed", target_count: 3, month_days: [1, 15, 31] };
  assert.equal(periodTarget(monthly, "2026-10-14"), 3);
  assert.equal(periodTarget(monthly, "2026-11-14"), 2, "no 31st in November");
  assert.equal(periodTarget({ ...monthly, month_days: [1, 30], include_month_end: true }, "2026-11-02"), 2, "30th is month end: counted once");
});
