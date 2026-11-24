import React from "react";
import { isBookingBlockEvent, weekEventGeometry } from "../scheduleCalendar";

// Lanes retain their existing events and hit targets; this is presentation only.
export function groupClosureLanes(lanes) {
  const groups = new Map();
  lanes.forEach((lane, index) => {
    for (const event of lane.events) {
      if (!isBookingBlockEvent(event) || event.blockId == null) continue;
      const key = JSON.stringify([event.blockId, event.date, event.startTime, event.endTime]);
      if (!groups.has(key)) groups.set(key, { key, event, indices: [] });
      const indices = groups.get(key).indices;
      if (!indices.includes(index)) indices.push(index);
    }
  });
  const laidOut = [];
  return [...groups.values()].map((group) => {
    const runs = [];
    for (const index of group.indices) {
      const last = runs[runs.length - 1];
      if (last && index === last.end + 1) last.end = index;
      else runs.push({ start: index, end: index });
    }
    const occupied = new Set(laidOut.filter((other) => other.indices[0] === group.indices[0]
      && other.event.startMin < group.event.endMin && group.event.startMin < other.event.endMin)
      .map((other) => other.indicatorSlot));
    let indicatorSlot = 0;
    while (occupied.has(indicatorSlot)) indicatorSlot += 1;
    const result = { ...group, runs, indicatorSlot };
    laidOut.push(result);
    return result;
  });
}

export function ClosureOverlay({ group, hourPx, startHour, endHour, gap, isAdmin, onOpen }) {
  const geometry = weekEventGeometry(group.event.startMin, group.event.endMin, hourPx, startHour, endHour);
  if (!geometry) return null;
  const first = group.indices[0];
  return <div data-closure-overlay={group.key} style={{ position: "absolute", left: 0, top: geometry.top, width: "100%", height: geometry.height, zIndex: 3, pointerEvents: "none" }}>
    {group.runs.map(({ start, end }) => {
      const offset = start - first;
      const count = end - start + 1;
      return <div key={start} data-closure-run={`${start}-${end}`} style={{ position: "absolute", left: `calc(${offset * 100}% + ${offset * gap}px)`, width: `calc(${count * 100}% + ${(count - 1) * gap}px)`, height: "100%", background: "rgba(100,116,139,.16)", borderLeft: "3px solid #64748b", boxSizing: "border-box" }} />;
    })}
    <button type="button" aria-label="Закритий час" onClick={() => onOpen(group.event)} style={{ position: "absolute", left: 1 + group.indicatorSlot * 20, top: 0, width: 20, height: "100%", border: 0, background: "transparent", overflow: "hidden", padding: 1, cursor: isAdmin ? "pointer" : "default", pointerEvents: isAdmin ? "auto" : "none" }}>🔒</button>
  </div>;
}

// Month and compact overview have no room columns, so show each rule once.
export function deduplicateClosureEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!isBookingBlockEvent(event) || event.blockId == null) return true;
    const key = JSON.stringify([event.blockId, event.date, event.startTime, event.endTime]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
