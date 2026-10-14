// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJourney, monthWeeks, dayDiff, addDays } from "../lib/growth-journey.ts";

const project = (over = {}) => ({
  id: "p1", title: "完成论文", status: "pending", category: "study", task_date: "2026-10-13",
  plan_start_date: "2026-10-13", target_finish_date: "2026-11-03", deadline_date: null, completed_at: null, ...over,
});
const base = (over = {}) => ({ project: project(), steps: [], plans: [], focusDays: [], restDays: [], today: "2026-10-16", hour: 10, ...over });

test("road runs to the final deadline; target stays a marker", () => {
  const m = buildJourney(base({ project: project({ deadline_date: "2026-11-10" }) }));
  assert.equal(m.start, "2026-10-13");
  assert.equal(m.end, "2026-11-10");
  assert.equal(m.target, "2026-11-03");
  assert.equal(m.totalDays, 29);
  assert.equal(m.elapsedDays, 4);
});

test("steps drive progress; dated steps become milestones; completed steps plant flowers", () => {
  const steps = [
    { id: "a", title: "开题答辩", completed: true, completed_day: "2026-10-15" },
    { id: "b", title: "初稿", completed: false, completed_day: null },
    { id: "c", title: "文献", completed: true, completed_day: "2026-10-14" },
    { id: "d", title: "定稿", completed: false, completed_day: null },
  ];
  const plans = [{ day: "2026-10-15", subtask_id: "a" }, { day: "2026-10-21", subtask_id: "b" }, { day: "2026-10-16", subtask_id: null }];
  const m = buildJourney(base({ steps, plans }));
  assert.equal(m.progress, 0.5);
  assert.deepEqual(m.milestones.map((x) => [x.day, x.done]), [["2026-10-15", true], ["2026-10-21", false]]);
  assert.deepEqual(m.flowerDays, ["2026-10-14", "2026-10-15"]);
  assert.equal(m.pace, "ahead");
  assert.equal(m.pose, "walk"); // planned today, nothing done yet
});

test("pose priority", () => {
  assert.equal(buildJourney(base({ project: project({ status: "completed" }) })).pose, "love");
  assert.equal(buildJourney(base({ project: project({ status: "running" }) })).pose, "read");
  assert.equal(buildJourney(base({ project: project({ status: "running", category: "work" }) })).pose, "laptop");
  assert.equal(buildJourney(base({ restDays: ["2026-10-16"] })).pose, "nap");
  const stepToday = [{ id: "a", title: "x", completed: true, completed_day: "2026-10-16" }];
  assert.equal(buildJourney(base({ steps: stepToday })).pose, "cheer");
  assert.equal(buildJourney(base({ steps: stepToday, plans: [{ day: "2026-10-16", subtask_id: "a" }] })).pose, "flag");
  assert.equal(buildJourney(base({ focusDays: ["2026-10-16"] })).pose, "run");
  assert.equal(buildJourney(base({ hour: 23, plans: [{ day: "2026-10-16", subtask_id: null }] })).pose, "sleep");
  assert.equal(buildJourney(base({ plans: [{ day: "2026-10-15", subtask_id: null }, { day: "2026-10-16", subtask_id: null }] })).pose, "umbrella");
  assert.ok(["butterfly", "garden", "drink"].includes(buildJourney(base()).pose));
});

test("no steps: progress from active days; persistence counts focus and step days once", () => {
  const m = buildJourney(base({ focusDays: ["2026-10-13", "2026-10-14", "2026-10-14", "2026-09-01"] }));
  assert.equal(m.activeDays, 2);
  assert.equal(m.progress, 2 / 22);
});

test("month weeks are Monday-first and cover the month", () => {
  const weeks = monthWeeks("2026-10");
  assert.equal(weeks[0][0], "2026-09-28");
  assert.equal(weeks.at(-1)[6], "2026-11-01");
  assert.equal(weeks.length, 5);
  assert.equal(dayDiff("2026-10-13", addDays("2026-10-13", 21)), 21);
});
