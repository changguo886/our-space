// Run: npm test   (node --test with built-in TypeScript type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conflictsWith, describeSelectors, formatDay, groupTemplates, isDuplicateKeyError, isEditable,
  remainingQuota, splitByToday, timesOverlap,
} from "../lib/schedule-utils.ts";

const item = (id, day, mode, start = "", end = "", minutes = 45) => ({ id, day, mode, start, end, minutes });
const tpl = (over) => ({
  id: crypto.randomUUID(), starts_on: "2026-10-14", ends_on: null, execution_mode: "fixed",
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

test("conflict rule (B09): fixed overlaps only, window/flexible only identical, modes independent", () => {
  const existing = [item("a", "2026-10-14", "fixed", "19:00", "20:00", 60), item("b", "2026-10-14", "flexible", "", "", 30)];
  assert.equal(conflictsWith(item("x", "2026-10-14", "fixed", "19:30", "20:30"), existing), true);
  assert.equal(conflictsWith(item("x", "2026-10-14", "fixed", "07:00", "08:00"), existing), false, "second fixed slot on the same day is allowed (A08)");
  assert.equal(conflictsWith(item("x", "2026-10-14", "flexible", "", "", 30), existing), true);
  assert.equal(conflictsWith(item("x", "2026-10-14", "flexible", "", "", 45), existing), false);
  assert.equal(conflictsWith(item("x", "2026-10-14", "window", "18:00", "22:00"), existing), false);
  assert.equal(conflictsWith(item("x", "2026-10-15", "fixed", "19:00", "20:00"), existing), false);
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

test("series grouping (D06): one batch becomes one row", () => {
  const groups = groupTemplates([
    tpl({ selector_value: 5 }), tpl({ selector_value: 1 }), tpl({ selector_value: 3 }),
    tpl({ selector_value: 6, start_time: "08:00:00", end_time: "09:00:00" }),
  ]);
  assert.equal(groups.length, 2);
  const evening = groups.find((g) => g.start === "19:00");
  assert.deepEqual(evening.templates.map((t) => t.selector_value), [1, 3, 5]);
  assert.equal(describeSelectors(evening.templates, true), "每周一、三、五");
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
