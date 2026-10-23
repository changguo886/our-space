// Run: npm test
// normalizeDraft must always produce something the database constraints accept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraft, validDate } from "../lib/ai/task-draft.ts";

const TODAY = "2026-10-23";
const base = (over) => ({
  task_type: "one_time", title: "买牛奶", description: "", category: null, task_date: null,
  plan_start_date: null, target_finish_date: null, deadline_date: null,
  routine_period: null, routine_arrangement: null, routine_target_count: null, routine_weekdays: [],
  steps: [], notes: [], ...over,
});

test("rejects a draft without a title", () => {
  assert.throws(() => normalizeDraft(base({ title: "   " }), TODAY, true));
  assert.throws(() => normalizeDraft(null, TODAY, true));
});

test("validDate rejects impossible dates", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-10-30"), true);
});

test("unknown type and category fall back safely", () => {
  const d = normalizeDraft(base({ task_type: "habit", category: "fun" }), TODAY, true);
  assert.equal(d.task_type, "one_time");
  assert.equal(d.category, null);
});

test("project: start defaults to today; inverted dates are cleared with a note", () => {
  const d = normalizeDraft(base({ task_type: "project", target_finish_date: "2026-10-01", deadline_date: "2026-11-01" }), TODAY, true);
  assert.equal(d.plan_start_date, TODAY);
  assert.equal(d.target_finish_date, null);
  assert.ok(d.notes.length >= 1);
  const ok = normalizeDraft(base({ task_type: "project", target_finish_date: "2026-10-30", deadline_date: "2026-10-28" }), TODAY, true);
  assert.equal(ok.target_finish_date, "2026-10-30");
  assert.equal(ok.deadline_date, null); // todos/save_task_v4: deadline cannot precede target finish
});

test("routine: day period is always flexible (habit_patterns_v3_consistent)", () => {
  const d = normalizeDraft(base({ task_type: "routine", routine_period: "day", routine_arrangement: "fixed", routine_weekdays: [1, 2], routine_target_count: 0 }), TODAY, true);
  assert.equal(d.routine_arrangement, "flexible");
  assert.deepEqual(d.routine_weekdays, []);
  assert.equal(d.routine_target_count, 1);
});

test("routine: fixed week target equals weekday count, deduped and in range", () => {
  const d = normalizeDraft(base({ task_type: "routine", routine_period: "week", routine_arrangement: "fixed", routine_weekdays: [5, 1, 1, 9, 3], routine_target_count: 7 }), TODAY, true);
  assert.deepEqual(d.routine_weekdays, [1, 3, 5]);
  assert.equal(d.routine_target_count, 3);
});

test("routine: fixed month is downgraded to flexible and has no steps", () => {
  const d = normalizeDraft(base({ task_type: "routine", routine_period: "month", routine_arrangement: "fixed", routine_target_count: 2, steps: [{ title: "x", estimated_minutes: 10 }] }), TODAY, true);
  assert.equal(d.routine_arrangement, "flexible");
  assert.equal(d.routine_target_count, 2);
  assert.deepEqual(d.steps, []);
});

test("steps: blanks, duplicates and the title itself are dropped; minutes bounded", () => {
  const d = normalizeDraft(base({ task_type: "project", target_finish_date: "2026-10-30", title: "写报告", steps: [
    { title: " 整理数据 ", estimated_minutes: 90 },
    { title: "整理数据", estimated_minutes: 30 },
    { title: "", estimated_minutes: 10 },
    { title: "写报告", estimated_minutes: 10 },
    { title: "修改", estimated_minutes: -5 },
    { title: "通读", estimated_minutes: 5000 },
  ] }), TODAY, true);
  assert.deepEqual(d.steps, [
    { title: "整理数据", estimated_minutes: 90 },
    { title: "修改", estimated_minutes: null },
    { title: "通读", estimated_minutes: 600 },
  ]);
});
