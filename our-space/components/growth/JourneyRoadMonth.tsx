"use client";

import type { ReactNode } from "react";
import { addDays, dayDiff, monthWeeks, pick, type JourneyModel } from "@/lib/growth-journey";

/* eslint-disable @next/next/no-img-element */

const ROW_VB = 100; // SVG viewBox height for one week row
const ROAD_Y = 70; // road baseline inside a row (0–100)
const WAVE = 7;

type Season = { far: string; near: string; tint: string };
function season(month: number): Season {
  if (month >= 3 && month <= 5) return { far: "#E6EFDB", near: "#D8E7CA", tint: "#F8FAF3" };
  if (month >= 6 && month <= 8) return { far: "#DDEBD1", near: "#CFE3C0", tint: "#F5FAF2" };
  if (month >= 9 && month <= 11) return { far: "#EAEDD5", near: "#DFE5C4", tint: "#FBF9F1" };
  return { far: "#E9EFF1", near: "#DCE6E9", tint: "#F7FAFB" };
}

const SCENERY = ["tree-pine", "tree-round", "bush", "grass", "tree-round", "flowers", null, null] as const;

function x(i: number) { return (i + 0.5) * 100; }
function y(day: string, start: string) { return ROAD_Y + (dayDiff(start, day) % 2 === 0 ? -WAVE : WAVE); }

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Road points for the days of one week that satisfy `keep`, continuing to the row edges. */
function rowPoints(week: string[], start: string, keep: (d: string) => boolean): [number, number][] {
  const idx = week.map((d, i) => (keep(d) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  const pts: [number, number][] = idx.map((i) => [x(i), y(week[i], start)]);
  const first = idx[0], last = idx[idx.length - 1];
  if (first === 0 && keep(addDays(week[0], -1))) pts.unshift([0, (y(week[0], start) + y(addDays(week[0], -1), start)) / 2]);
  if (last === 6 && keep(addDays(week[6], 1))) pts.push([700, (y(week[6], start) + y(addDays(week[6], 1), start)) / 2]);
  if (pts.length === 1) pts.push([pts[0][0] + 1, pts[0][1]]);
  return pts;
}

const short = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;

export default function JourneyRoadMonth({
  model,
  month,
  today,
  catSrc,
  catAnimation,
  projectId,
}: {
  model: JourneyModel;
  month: string; // YYYY-MM
  today: string;
  catSrc: string;
  catAnimation: string;
  projectId: string;
}) {
  const weeks = monthWeeks(month);
  const tone = season(Number(month.slice(5, 7)));
  const inRange = (d: string) => d >= model.start && d <= model.end;
  const catDay = today < model.start ? model.start : today > model.end ? model.end : today;
  const milestoneByDay = new Map(model.milestones.map((m) => [m.day, m]));
  const flowers = new Set(model.flowerDays);
  const planned = new Set(model.plannedDays);
  const fill = model.fillDay;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs text-ink-soft">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((w, i) => (
          <div key={w} className={`py-2 ${i >= 5 ? "bg-blush-50/60" : ""}`}>{w}</div>
        ))}
      </div>

      {weeks.map((week) => {
        const base = rowPoints(week, model.start, inRange);
        const done = fill ? rowPoints(week, model.start, (d) => inRange(d) && d <= fill) : [];
        const hasRoad = base.length > 0;
        return (
          <div key={week[0]} className="relative h-[92px] border-b border-line last:border-b-0 sm:h-[124px]" style={{ background: hasRoad ? tone.tint : undefined }}>
            {/* day cells */}
            <div className="absolute inset-0 grid grid-cols-7">
              {week.map((day, i) => {
                const other = day.slice(0, 7) !== month;
                const isToday = day === today;
                return (
                  <div key={day} className={`relative border-r border-line/70 last:border-r-0 ${i >= 5 ? "bg-blush-50/25" : ""}`}>
                    <span className={`absolute left-1.5 top-1 text-[11px] sm:left-2.5 sm:top-1.5 sm:text-sm ${other ? "text-ink-faint/60" : i >= 5 ? "text-[#C48479]" : "text-ink"} ${isToday ? "font-semibold" : ""}`}>
                      {other ? short(day) : Number(day.slice(8, 10))}
                    </span>
                    {isToday && (
                      <span className="absolute right-1 top-1 rounded-full bg-mist-500 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:right-2 sm:top-1.5 sm:px-2.5 sm:text-xs">今天</span>
                    )}
                  </div>
                );
              })}
            </div>

            {hasRoad && (
              <>
                {/* meadow */}
                <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] w-full" viewBox="0 0 700 60" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 22 C120 8 220 30 350 18 C480 6 580 26 700 14 L700 60 L0 60 Z" fill={tone.far} />
                  <path d="M0 40 C140 28 260 46 400 36 C540 26 620 42 700 34 L700 60 L0 60 Z" fill={tone.near} />
                </svg>

                {/* scenery above the road, only on journey days */}
                {week.map((day, i) => {
                  if (!inRange(day) || day === catDay || milestoneByDay.has(day) || day === model.start || day === model.end) return null;
                  const item = pick(day + projectId, SCENERY);
                  if (!item) return null;
                  const tall = item.startsWith("tree");
                  return (
                    <img key={"s" + day} src={`/journey/${item}.svg`} alt="" aria-hidden
                      className={`pointer-events-none absolute ${tall ? "h-[44%]" : "h-[18%]"} w-auto`}
                      style={{ left: `calc(${(i + 0.62) / 7 * 100}% )`, bottom: tall ? "36%" : "40%" }} />
                  );
                })}

                {/* road */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 700 ${ROW_VB}`} preserveAspectRatio="none" aria-hidden>
                  <path d={smooth(base)} fill="none" stroke="#F4E7C3" strokeWidth={18} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={smooth(base)} fill="none" stroke="#E2C27E" strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {done.length > 0 && (
                    <path d={smooth(done)} fill="none" stroke="#E2BE6E" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>

                {/* markers */}
                {week.map((day, i) => {
                  if (!inRange(day)) return null;
                  const left = `${(i + 0.5) / 7 * 100}%`;
                  const top = `${y(day, model.start)}%`;
                  const milestone = milestoneByDay.get(day);
                  const nodes: ReactNode[] = [];
                  if (flowers.has(day)) {
                    nodes.push(<img key="f" src="/journey/flowers.svg" alt="" title="这天完成了步骤" className="absolute bottom-[4%] h-[20%] w-auto -translate-x-1/2" style={{ left }} />);
                  }
                  if (day === model.start) {
                    nodes.push(
                      <div key="start" className="absolute -translate-x-[22%] -translate-y-[88%]" style={{ left, top }}>
                        <img src="/journey/flag-start.svg" alt="起点" className="h-12 w-auto sm:h-16" />
                        <span className="absolute left-[60%] top-0 hidden whitespace-nowrap rounded-xl bg-sage-50 px-2 py-1 text-[11px] font-semibold leading-tight text-sage-700 shadow-sm sm:block">起点<br /><span className="font-normal">{short(day)}</span></span>
                      </div>
                    );
                  } else if (day === model.end) {
                    nodes.push(
                      <div key="end" className="absolute -translate-x-[22%] -translate-y-[88%]" style={{ left, top }}>
                        <img src="/journey/flag-goal.svg" alt="终点" className="h-12 w-auto sm:h-16" />
                        <span className="absolute right-[70%] top-0 hidden whitespace-nowrap rounded-xl bg-blush-50 px-2 py-1 text-[11px] font-semibold leading-tight text-[#B5675D] shadow-sm sm:block">{model.target && model.target !== model.end ? "截止" : "目标"}<br /><span className="font-normal">{short(day)}</span></span>
                      </div>
                    );
                  } else if (milestone) {
                    nodes.push(
                      <div key="m" className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
                        <img src={milestone.done ? "/journey/milestone-star.svg" : "/journey/milestone-star-pending.svg"} alt={milestone.done ? "已达成的阶段目标" : "阶段目标"} className="h-6 w-6 sm:h-8 sm:w-8" />
                        <span className="absolute bottom-full left-1/2 mb-1 hidden max-w-[120px] -translate-x-1/2 truncate whitespace-nowrap rounded-xl bg-[#FBF3DE] px-2 py-1 text-[11px] font-semibold text-[#7A6236] shadow-sm sm:block" title={milestone.title}>
                          {milestone.title}<span className="block text-[10px] font-normal">（阶段目标）</span>
                        </span>
                      </div>
                    );
                  } else if (model.target && day === model.target) {
                    nodes.push(
                      <div key="t" className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
                        <img src="/journey/milestone-star-pending.svg" alt="目标完成日" className="h-6 w-6 sm:h-8 sm:w-8" />
                        <span className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-blush-50 px-2 py-1 text-[11px] font-semibold text-[#B5675D] shadow-sm sm:block">目标 {short(day)}</span>
                      </div>
                    );
                  } else if (planned.has(day) && day !== catDay) {
                    nodes.push(<img key="w" src="/journey/waypoint.svg" alt="" title="这天有执行安排" className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 sm:h-5 sm:w-5" style={{ left, top }} />);
                  }
                  if (day === catDay) {
                    nodes.push(
                      <img key="cat" src={catSrc} alt="旅程小猫" className={`absolute h-[78%] w-auto -translate-x-1/2 -translate-y-[78%] ${catAnimation}`} style={{ left, top }} />
                    );
                  }
                  return <div key={"m" + day}>{nodes}</div>;
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
