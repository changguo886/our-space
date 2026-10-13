import { test } from "node:test";
import assert from "node:assert/strict";
import { habitEligible, templateEligible, upcomingEligible, wallClockISO, lastDayISO } from "../lib/recurring-execution.ts";

const monthly = (days, monthEnd = false) => ({ todo_id: "t", period: "month", arrangement: "fixed", target_count: days.length, weekdays: [], month_days: days, include_month_end: monthEnd });

test("monthly 31st is skipped in short months, never shifted (B06)", () => {
  const p = monthly([31]);
  assert.equal(habitEligible("2026-11-30", p, "2026-01-01"), false);
  assert.equal(habitEligible("2026-12-31", p, "2026-01-01"), true);
  assert.deepEqual(upcomingEligible(p, "2026-01-01", "2026-02-01", 120, 3), ["2026-03-31", "2026-05-31"]);
});

test("month end resolves per month and is not doubled with an explicit 30th (B06)", () => {
  const p = monthly([30], true);
  assert.deepEqual(upcomingEligible(p, "2026-01-01", "2026-02-01", 70, 5), ["2026-02-28", "2026-03-30", "2026-03-31"]);
  assert.equal(lastDayISO("2028-02-10"), 29, "leap year");
  assert.deepEqual(upcomingEligible(p, "2026-01-01", "2026-04-01", 30, 5), ["2026-04-30"], "30th is month end in April: one occurrence");
});

test("templates respect effective range and start date", () => {
  const t = { id: "x", todo_id: "t", slot_key: "s", starts_on: "2026-10-14", ends_on: "2026-10-31", execution_mode: "fixed", selector_kind: "weekday", selector_value: 3, start_time: "19:00", end_time: "20:00", timezone: "UTC", planned_minutes: null, window_start: null, window_end: null };
  assert.equal(templateEligible("2026-10-14", t), true);
  assert.equal(templateEligible("2026-10-07", t), false, "before starts_on");
  assert.equal(templateEligible("2026-11-04", t), false, "after ends_on");
  assert.equal(templateEligible("2026-10-15", t), false, "wrong weekday");
});

test("wall clock time survives daylight-saving changes (B07)", () => {
  assert.equal(wallClockISO("2026-11-02", "19:00", "America/New_York"), "2026-11-03T00:00:00.000Z", "after fall back, EST = UTC-5");
  assert.equal(wallClockISO("2026-10-30", "19:00", "America/New_York"), "2026-10-30T23:00:00.000Z", "before fall back, EDT = UTC-4");
  assert.equal(wallClockISO("2026-03-08", "02:30", "America/New_York"), null, "nonexistent spring-forward time is rejected, not shifted");
});
