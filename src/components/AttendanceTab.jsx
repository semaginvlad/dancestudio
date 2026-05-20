// test preview deploy
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as db from "../db";
import {
  today,
  uid,
  getDisplayName,
  useStickyState,
  getEffectiveEndDate,
  isSubExhausted,
  getActiveSubOnDateForCoverage,
} from "../shared/utils";
import { theme } from "../shared/constants";

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

const WEEKDAYS_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const isVisibleAttendanceStudent = (student) => {
  if (!student) return false;
  if (student.deleted_at || student.deletedAt || student.isDeleted === true) return false;
  if (student.archived_at || student.archivedAt || student.isArchived === true) return false;
  if (student.is_active === false || student.active === false) return false;
  const status = String(student.status || "").toLowerCase();
  if (["archived", "archive", "deleted", "removed"].includes(status)) return false;
  return true;
};

const makeStyles = () => {
  const isDark = theme.bg === "#0F131A";
  const CELL_SIZE = 40;
  const matrixBase = isDark ? "#131b26" : theme.card;
  const matrixMuted = isDark ? "#101722" : theme.input;
  const matrixCancelled = isDark ? "#2a1b23" : "#ffe9e9";

  return ({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "15px 16px",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.25)" : theme.border}`,
    borderRadius: 18,
    background: isDark ? "linear-gradient(180deg, rgba(26,36,50,0.96) 0%, rgba(18,26,38,0.96) 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    boxShadow: theme.bg === "#0F131A" ? "0 12px 30px rgba(0,0,0,0.33)" : "0 10px 26px rgba(15, 23, 42, 0.08)",
    backdropFilter: "blur(6px)",
  },
  toolbarLeft: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  groupPickerWrap: {
    position: "relative",
    minWidth: 240,
  },
  groupPickerBtn: (open) => ({
    ...{
      height: 36,
      borderRadius: 12,
      border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : theme.border}`,
      padding: "0 12px",
      background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.95)",
      fontSize: 14,
      color: theme.textMain,
      boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(15,23,42,0.04)",
    },
    width: "100%",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    borderColor: open ? theme.primary : (isDark ? "rgba(148,163,184,0.28)" : theme.border),
  }),
  groupPickerPanel: {
    position: "fixed",
    zIndex: 2000,
    width: 320,
    maxHeight: 300,
    overflowY: "auto",
    borderRadius: 14,
    border: `1px solid ${isDark ? "rgba(148,163,184,0.3)" : theme.border}`,
    background: isDark ? "rgba(16,23,34,0.98)" : "rgba(255,255,255,0.98)",
    boxShadow: isDark ? "0 16px 32px rgba(0,0,0,0.45)" : "0 14px 30px rgba(15,23,42,0.16)",
    backdropFilter: "blur(8px)",
    padding: 7,
  },
  groupSectionTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    color: theme.textLight,
    padding: "8px 10px 6px",
    fontWeight: 700,
  },
  groupOption: (selected) => ({
    width: "100%",
    border: "none",
    textAlign: "left",
    borderRadius: 10,
    padding: "8px 10px",
    marginBottom: 4,
    cursor: "pointer",
    fontSize: 13,
    color: selected ? "#fff" : theme.textMain,
    background: selected ? theme.primary : (isDark ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.09)"),
    boxShadow: selected ? (isDark ? "0 4px 12px rgba(37,99,235,0.45)" : "0 4px 10px rgba(37,99,235,0.24)") : "none",
  }),
  control: {
    height: 36,
    borderRadius: 12,
    border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : theme.border}`,
    padding: "0 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.95)",
    fontSize: 14,
    color: theme.textMain,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(15,23,42,0.04)",
  },
  legend: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    color: theme.textMuted,
  },
  hint: {
    fontSize: 12,
    color: theme.textLight,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dot: (bg) => ({
    width: 12,
    height: 12,
    borderRadius: 4,
    background: bg,
    border: "1px solid rgba(0,0,0,0.08)",
  }),
  tableWrap: {
    overflowX: "auto",
    overflowY: "visible",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : theme.border}`,
    borderRadius: 18,
    background: isDark ? "linear-gradient(180deg, rgba(21,30,43,0.98), rgba(16,23,34,0.98))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
    position: "relative",
    boxShadow: theme.bg === "#0F131A" ? "0 18px 38px rgba(0,0,0,0.4)" : "0 14px 34px rgba(15, 23, 42, 0.1)",
    backdropFilter: "blur(7px)",
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: "0 4px",
    minWidth: "100%",
  },
  thSticky: {
    position: "sticky",
    left: 0,
    zIndex: 4,
    background: theme.card,
    minWidth: 240,
    maxWidth: 240,
    width: 240,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.24)"}`,
    boxShadow: `1px 0 0 ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.24)"}`,
  },
  headTop: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: matrixMuted,
  },
  monthHead: (isCurrent) => ({
    textAlign: "center",
    fontWeight: 700,
    fontSize: isCurrent ? 14 : 13,
    color: isCurrent ? theme.textMain : theme.textMuted,
    borderBottom: isCurrent ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.24)"}`,
    padding: "12px 7px 11px",
    background: isCurrent ? (isDark ? "#162742" : `${theme.primary}1A`) : matrixMuted,
    whiteSpace: "nowrap",
    letterSpacing: 0.2,
  }),
  studentHead: {
    padding: "11px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 14,
    color: theme.textMain,
    borderBottom: `1px solid ${theme.border}`,
    background: matrixMuted,
  },
  dayHead: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    minWidth: CELL_SIZE,
    maxWidth: CELL_SIZE,
    width: CELL_SIZE,
    textAlign: "center",
    verticalAlign: "top",
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    padding: "8px 3px",
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
  }),
  dayNum: (isCurrentMonth, isMutedMonth) => ({
    fontSize: isCurrentMonth ? 16 : 14,
    fontWeight: 700,
    color: isCurrentMonth ? theme.textMain : (isMutedMonth ? theme.textLight : theme.textMuted),
    lineHeight: 1.1,
  }),
  dayName: (isCurrentMonth, isMutedMonth) => ({
    fontSize: 10,
    color: isCurrentMonth ? theme.textMuted : (isMutedMonth ? theme.textLight : theme.textMuted),
    marginTop: 2,
  }),
  cancelBtn: (isCancelled) => ({
    marginTop: 6,
    width: 21,
    height: 21,
    borderRadius: 999,
    border: "1px solid",
    borderColor: isCancelled ? "#10b981" : "#fca5a5",
    background: isCancelled ? (isDark ? "#123126" : "#ecfdf5") : matrixBase,
    color: isCancelled ? "#047857" : "#b91c1c",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: "20px",
    padding: 0,
  }),
  rowHead: {
    position: "sticky",
    left: 0,
    zIndex: 3,
    background: matrixBase,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}`,
    borderBottom: "none",
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
    padding: "4px 8px",
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.95)",
  },
  profileCard: {
    borderRadius: 14,
    padding: "4px 8px",
    background: isDark ? "linear-gradient(180deg, rgba(148,163,184,0.14), rgba(148,163,184,0.06))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95))",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.25)"}`,
    boxShadow: isDark ? "0 6px 14px rgba(0,0,0,0.24)" : "0 4px 10px rgba(15,23,42,0.08)",
  },
  guestGroupCard: {
    background: isDark ? "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.06))" : "linear-gradient(180deg, rgba(238,242,255,0.95), rgba(224,231,255,0.75))",
    border: `1px solid ${isDark ? "rgba(129,140,248,0.28)" : "rgba(129,140,248,0.3)"}`,
  },
  guestGroupBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "transparent",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    color: theme.textMain,
  },
  guestGroupArrow: (open) => ({
    fontSize: 12,
    color: theme.textMuted,
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform 0.15s ease",
  }),
  guestChildRowHead: {
    paddingLeft: 18,
  },
  guestChildCard: {
    opacity: 0.96,
  },
  studentName: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.1,
    color: theme.textMain,
  },
  studentNameRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderBtns: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  orderBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: `1px solid ${theme.border}`,
    background: matrixBase,
    color: theme.textMuted,
    cursor: "pointer",
    padding: 0,
    lineHeight: "16px",
    fontSize: 11,
  },
  menuWrap: {
    position: "relative",
  },
  menuBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    border: `1px solid ${theme.border}`,
    background: isDark ? "linear-gradient(180deg, rgba(148,163,184,0.16), rgba(148,163,184,0.07))" : "linear-gradient(180deg, rgba(148,163,184,0.2), rgba(148,163,184,0.08))",
    color: isDark ? "#d9e2ee" : "#334155",
    cursor: "pointer",
    padding: 0,
    lineHeight: "24px",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 14px rgba(0,0,0,0.28)" : "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px rgba(15,23,42,0.12)",
  },
  menu: {
    position: "fixed",
    minWidth: 198,
    background: isDark ? "linear-gradient(180deg, rgba(22,31,45,0.98), rgba(14,21,32,0.98))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.35)"}`,
    borderRadius: 16,
    boxShadow: isDark ? "0 26px 52px rgba(0,0,0,0.56)" : "0 20px 42px rgba(15,23,42,0.22)",
    backdropFilter: "blur(9px)",
    zIndex: 20,
    padding: 7,
  },
  totalsHead: {
    minWidth: 150,
    maxWidth: 150,
    width: 150,
    fontWeight: 700,
    color: theme.textMuted,
    whiteSpace: "nowrap",
    fontSize: 12,
    padding: "8px 10px",
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    padding: "8px 10px",
    borderRadius: 11,
    fontSize: 12,
    fontWeight: 600,
    color: theme.textMain,
    cursor: "pointer",
    transition: "background 120ms ease, transform 120ms ease",
  },
  menuItemDisabled: {
    color: theme.textLight,
    cursor: "not-allowed",
    opacity: 0.85,
  },
  menuSection: {
    display: "grid",
    gap: 4,
    padding: 3,
    borderRadius: 12,
    background: isDark ? "rgba(148,163,184,0.06)" : "rgba(148,163,184,0.08)",
    marginBottom: 6,
  },
  menuDivider: {
    margin: "2px 1px 6px",
    borderTop: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : "rgba(148,163,184,0.3)"}`,
  },
  notifyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    fontSize: 12,
    color: theme.textMain,
    fontWeight: 600,
    userSelect: "none",
    borderRadius: 10,
    background: isDark ? "rgba(99,102,241,0.13)" : "rgba(99,102,241,0.1)",
  },
  notifyCheck: {
    width: 16,
    height: 16,
    cursor: "pointer",
    accentColor: theme.primary,
  },
  studentMeta: {
    fontSize: 10,
    fontWeight: 500,
    color: theme.textMuted,
    marginTop: 2,
    lineHeight: 1.15,
  },
  menuDanger: {
    background: isDark ? "rgba(185,28,28,0.2)" : "rgba(254,226,226,0.95)",
    color: isDark ? "#fecaca" : "#b91c1c",
    border: `1px solid ${isDark ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.5)"}`,
  },
  cell: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    width: CELL_SIZE,
    minWidth: CELL_SIZE,
    maxWidth: CELL_SIZE,
    height: CELL_SIZE,
    minHeight: CELL_SIZE,
    maxHeight: CELL_SIZE,
    padding: 0,
    textAlign: "center",
    verticalAlign: "middle",
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.18)"}`,
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.85)",
  }),
  cellShell: {
    width: CELL_SIZE - 5,
    height: CELL_SIZE - 5,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    padding: 2,
    boxSizing: "border-box",
    background: isDark ? "rgba(148,163,184,0.09)" : "rgba(255,255,255,0.76)",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : "rgba(148,163,184,0.28)"}`,
  },
  cellBtn: (bg, disabled, saving) => ({
    width: "100%",
    height: "100%",
    borderRadius: 8,
    border: bg === theme.card
      ? `1px solid ${isDark ? "rgba(148,163,184,0.5)" : "rgba(148,163,184,0.42)"}`
      : "1px solid rgba(0,0,0,0.1)",
    background: bg === theme.card ? (isDark ? "rgba(51,65,85,0.78)" : "rgba(248,250,252,0.98)") : bg,
    cursor: disabled || saving ? "not-allowed" : "pointer",
    opacity: disabled || saving ? 0.55 : 1,
    fontSize: 16,
    fontWeight: 700,
    color: bg === theme.card ? theme.textLight : "#fff",
    boxShadow: bg === theme.card
      ? `inset 0 1px 0 ${isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.92)"}, inset 0 -1px 0 ${isDark ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.24)"}, 0 1px 4px rgba(15,23,42,0.08)`
      : "inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 10px rgba(15,23,42,0.2)",
    transform: saving ? "scale(0.97)" : "scale(1)",
  }),
  subPeriodCell: (tone, border, isStart, isEnd, isCancelled) => ({
    background: isCancelled ? (isDark ? "#311d23" : "#fef2f2") : tone,
    boxShadow: [
      `inset 0 1px 0 ${isDark ? "rgba(191,219,254,0.18)" : "rgba(37,99,235,0.12)"}`,
      `inset 0 -1px 0 ${isDark ? "rgba(191,219,254,0.14)" : "rgba(37,99,235,0.1)"}`,
      isStart ? `inset 5px 0 0 ${border}` : "",
      isEnd ? `inset -5px 0 0 ${border}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  }),
  monthDivider: {
    borderRight: `2px solid ${theme.textLight}`,
  },
  totalsRow: {
    background: isDark ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.09)",
    boxShadow: `inset 0 1px 0 ${theme.border}`,
  },
  emptyState: {
    padding: 18,
    border: `1px dashed ${theme.border}`,
    borderRadius: 12,
    background: matrixBase,
    color: theme.textMuted,
  },
  historyOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    background: isDark ? "rgba(2,6,23,0.72)" : "rgba(15,23,42,0.28)",
    display: "flex",
    justifyContent: "flex-end",
    padding: 16,
    boxSizing: "border-box",
  },
  historyPanel: {
    width: "min(560px, 100%)",
    height: "100%",
    overflow: "hidden",
    borderRadius: 18,
    border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : theme.border}`,
    background: isDark ? "#111827" : "#ffffff",
    boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.55)" : "0 24px 60px rgba(15,23,42,0.22)",
    display: "flex",
    flexDirection: "column",
  },
  historyHeader: {
    padding: "16px 18px",
    borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.22)" : theme.border}`,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  historyTitle: {
    margin: 0,
    fontSize: 18,
    color: theme.textMain,
  },
  historySubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.textMuted,
  },
  historyTabs: {
    padding: "12px 16px 0",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6,
  },
  historyTab: (active) => ({
    border: `1px solid ${active ? theme.primary : (isDark ? "rgba(148,163,184,0.24)" : theme.border)}`,
    borderRadius: 999,
    padding: "8px 10px",
    background: active ? (isDark ? "rgba(37,99,235,0.22)" : "rgba(37,99,235,0.1)") : (isDark ? "rgba(148,163,184,0.07)" : "rgba(248,250,252,0.92)"),
    color: active ? theme.textMain : theme.textMuted,
    fontSize: 12,
    fontWeight: active ? 800 : 700,
    cursor: "pointer",
  }),
  historyBody: {
    padding: 16,
    overflowY: "auto",
    display: "grid",
    gap: 12,
  },
  historyRow: {
    border: `1px solid ${isDark ? "rgba(148,163,184,0.22)" : theme.border}`,
    borderRadius: 16,
    padding: 14,
    background: isDark ? "linear-gradient(180deg, rgba(30,41,59,0.82), rgba(15,23,42,0.74))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "0 8px 20px rgba(15,23,42,0.06)",
  },
  historyRowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    fontSize: 12,
    color: theme.textLight,
  },
  historyActorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    minWidth: 0,
  },
  historyActorName: {
    color: theme.textMain,
    fontSize: 13,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyFocusRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
    color: theme.textMain,
    fontSize: 14,
    fontWeight: 800,
  },
  historyArrow: {
    color: theme.textLight,
    fontSize: 16,
    lineHeight: 1,
  },
  historyTarget: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyMeta: {
    marginTop: 12,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  historyChip: (tone = "neutral") => {
    const palette = {
      neutral: { bg: isDark ? "rgba(148,163,184,0.12)" : "rgba(226,232,240,0.75)", border: isDark ? "rgba(148,163,184,0.22)" : "rgba(203,213,225,0.9)", color: theme.textMuted },
      quiet: { bg: isDark ? "rgba(148,163,184,0.07)" : "rgba(241,245,249,0.78)", border: isDark ? "rgba(148,163,184,0.14)" : "rgba(226,232,240,0.9)", color: theme.textLight },
      admin: { bg: isDark ? "rgba(59,130,246,0.16)" : "rgba(219,234,254,0.88)", border: isDark ? "rgba(96,165,250,0.26)" : "rgba(147,197,253,0.9)", color: isDark ? "#bfdbfe" : "#1d4ed8" },
      trainer: { bg: isDark ? "rgba(16,185,129,0.14)" : "rgba(209,250,229,0.86)", border: isDark ? "rgba(52,211,153,0.24)" : "rgba(110,231,183,0.86)", color: isDark ? "#a7f3d0" : "#047857" },
      added: { bg: isDark ? "rgba(34,197,94,0.15)" : "rgba(220,252,231,0.9)", border: isDark ? "rgba(74,222,128,0.28)" : "rgba(134,239,172,0.92)", color: isDark ? "#bbf7d0" : "#15803d" },
      removed: { bg: isDark ? "rgba(248,113,113,0.14)" : "rgba(254,226,226,0.9)", border: isDark ? "rgba(248,113,113,0.26)" : "rgba(252,165,165,0.86)", color: isDark ? "#fecaca" : "#b91c1c" },
      changed: { bg: isDark ? "rgba(251,191,36,0.13)" : "rgba(254,243,199,0.88)", border: isDark ? "rgba(251,191,36,0.24)" : "rgba(252,211,77,0.8)", color: isDark ? "#fde68a" : "#92400e" },
      info: { bg: isDark ? "rgba(14,165,233,0.14)" : "rgba(224,242,254,0.88)", border: isDark ? "rgba(56,189,248,0.24)" : "rgba(125,211,252,0.86)", color: isDark ? "#bae6fd" : "#0369a1" },
      accent: { bg: isDark ? "rgba(168,85,247,0.14)" : "rgba(243,232,255,0.88)", border: isDark ? "rgba(192,132,252,0.24)" : "rgba(216,180,254,0.86)", color: isDark ? "#e9d5ff" : "#7e22ce" },
      warning: { bg: isDark ? "rgba(245,158,11,0.14)" : "rgba(254,243,199,0.9)", border: isDark ? "rgba(251,191,36,0.24)" : "rgba(252,211,77,0.82)", color: isDark ? "#fde68a" : "#92400e" },
    };
    const picked = palette[tone] || palette.neutral;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      maxWidth: "100%",
      border: `1px solid ${picked.border}`,
      borderRadius: 999,
      padding: "4px 8px",
      background: picked.bg,
      color: picked.color,
      fontSize: 11,
      fontWeight: 800,
      lineHeight: 1.15,
      whiteSpace: "nowrap",
    };
  },
});
};

const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const parseSchedule = (schedule) => {
  if (Array.isArray(schedule)) return schedule;
  if (typeof schedule === "string") {
    try {
      const parsed = JSON.parse(schedule);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const ymd = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const monthStart = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

const shiftMonth = (monthStr, delta) => {
  const dt = monthStart(monthStr);
  dt.setMonth(dt.getMonth() + delta);
  return ymd(new Date(dt.getFullYear(), dt.getMonth(), 1)).slice(0, 7);
};

const monthLabel = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

const buildThreeMonths = (centerMonth) => {
  return [
    shiftMonth(centerMonth, -1),
    centerMonth,
    shiftMonth(centerMonth, 1),
  ];
};

const getMonthDays = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  const out = [];
  for (let i = 1; i <= total; i++) {
    out.push(`${monthStr}-${String(i).padStart(2, "0")}`);
  }
  return out;
};

const getDayOfWeek = (dateStr) => new Date(`${dateStr}T12:00:00`).getDay();
const toDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return ymd(value);
  return String(value).slice(0, 10);
};

const FUTURE_ATTENDANCE_MESSAGE = "Майбутні тренування не можна відмічати.";
const isFutureAttendanceDate = (dateStr) => toDateKey(dateStr) > today();
const ANON_GUEST_PREFIX = "__anon_guest__:";
const isAnonymousGuestLabel = (value) => String(value || "").startsWith(ANON_GUEST_PREFIX);
const makeAnonymousGuestLabel = ({ groupId, dateStr }) =>
  `${ANON_GUEST_PREFIX}${String(groupId || "group")}:${String(dateStr || today())}:${uid().slice(0, 8)}`;
const fmtUaShortDate = (dateStr) => {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}`;
};

const getActiveSubOnDate = (subs, studentId, groupId, dateStr) =>
  getActiveSubOnDateForCoverage(subs, studentId, groupId, dateStr);
const PACK_PLAN_TYPES = new Set(["4pack", "8pack", "12pack"]);
const isPackSubscription = (sub) => PACK_PLAN_TYPES.has(String(sub?.planType || "").trim().toLowerCase());

const getStudentStatusText = (subs, studentId, groupId) => {
  const groupSubs = subs
    .filter((s) => String(s.studentId) === String(studentId) && String(s.groupId) === String(groupId))
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (!groupSubs.length) return { text: "Без абонемента", tone: "neutral" };

  const todayStr = today();
  const tomorrow = new Date(`${todayStr}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymd(tomorrow);

  const activeNow = getActiveSubOnDate(groupSubs, studentId, groupId, todayStr);
  const latestAvailable = [...groupSubs]
    .filter((s) => (s.usedTrainings || 0) < (s.totalTrainings || 0) && !isSubExhausted(s))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  const latest = [...groupSubs].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  const sub = activeNow || latestAvailable || latest;
  if (!sub) return { text: "Абонементів немає", tone: "neutral" };

  const total = sub.totalTrainings || 0;
  const used = sub.usedTrainings || 0;
  const left = Math.max(0, total - used);
  const start = sub.activationDate || sub.startDate || "";
  const end = getEffectiveEndDate(sub) || sub.endDate || "";
  const isDanger = left <= 0 || (end && end < todayStr);
  const isWarning = !isDanger && (left <= 1 || end === todayStr || end === tomorrowStr);

  return {
    tone: isDanger ? "danger" : (isWarning ? "warning" : "neutral"),
    text: `${left}/${total}  •  ${fmtUaShortDate(start)}–${fmtUaShortDate(end)}`,
  };
};

const formatAuditDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getAuditActorRoleLabel = (row) => {
  if (row.actorType === "admin") return "Адмін";
  if (row.actorType === "trainer") return "Тренер";
  if (row.actorType === "system") return "Система";
  return "Невідомо";
};

const getAuditActorTone = (row) => {
  if (row.actorType === "admin") return "admin";
  if (row.actorType === "trainer") return "trainer";
  if (row.actorType === "system") return "quiet";
  return "neutral";
};

const getAuditActorName = (row) => row.actorName || row.actorEmail || (row.actorType === "system" ? "Системна зміна" : "Імʼя не визначено");

const getAuditTargetLabel = (row) => {
  if (row.studentName) return row.studentName;
  if (row.guestName) return `Гість: ${row.guestName}`;
  return "Учениця/гість не вказані";
};

const getAuditEntryLabel = (entryType) => {
  const type = String(entryType || "").toLowerCase();
  if (type === "subscription") return "абонемент";
  if (type === "trial") return "пробне";
  if (type === "single") return "разове";
  if (type === "debt") return "борг";
  if (type === "unpaid") return "неоплачено";
  return entryType || "";
};

const getAuditActionLabel = (row) => {
  const action = row.actionType;
  const change = row.changeType;
  const qty = Number(row.quantity || 1);

  if (action === "create" && change === "guest_added") return "додано гостя";
  if (action === "delete" && change === "guest_removed") return "видалено гостя";
  if (action === "create" && change === "mark_added") return qty >= 2 ? "додано 2" : "додано ✓";
  if (action === "delete" && change === "mark_removed") return qty >= 2 ? "видалено 2" : "видалено ✓";
  if (action === "update" && change === "quantity_changed") return "зміна";
  if (action === "update" && change === "guest_relinked") return "зміна";

  return "зміна";
};

const getAuditActionTone = (row) => {
  if (row.actionType === "create") return "added";
  if (row.actionType === "delete") return "removed";
  return "changed";
};


const getSubscriptionTypeLabel = (subscriptionType) => {
  const type = String(subscriptionType || "").toLowerCase();
  if (type === "trial") return "пробне";
  if (type === "single") return "разове";
  if (type === "subscription") return "абонемент";
  return subscriptionType || "абонемент";
};

const formatMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isFinite(num)) return `${num.toLocaleString("uk-UA")} грн`;
  return `${value} грн`;
};

const formatPaidValue = (value) => {
  if (value === true) return "оплачено";
  if (value === false) return "не оплачено";
  return "оплата не вказана";
};

const getValueByKeys = (value, keys) => {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  return undefined;
};

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const formatSubscriptionActionLabel = (row) => {
  const action = row.actionType;
  const change = row.changeType;
  const type = String(row.subscriptionType || "").toLowerCase();

  if (action === "create" && change === "subscription_created") return "створено абонемент";
  if (action === "delete" && change === "subscription_deleted") return "видалено абонемент";
  if (action === "create" && change === "one_off_created") {
    if (type === "trial") return "створено пробне";
    if (type === "single") return "створено разове";
    return "створено разове/пробне";
  }
  if (action === "delete" && change === "one_off_removed") {
    if (type === "trial") return "видалено пробне";
    if (type === "single") return "видалено разове";
    return "видалено разове/пробне";
  }
  if (action === "update" && change === "usage_changed") return "оновлено використання";
  if (action === "update" && change === "payment_changed") return "змінено оплату";
  if (action === "update" && change === "financial_changed") return "змінено суму";
  if (action === "update" && change === "date_changed") return "змінено дати";
  if (action === "update" && change === "activation_changed") return "змінено активацію";
  if (action === "update" && change === "plan_changed") return "змінено тариф";
  if (action === "update" && change === "student_or_group_changed") return "змінено ученицю/групу";
  if (action === "update" && change === "notification_changed") return "змінено сповіщення";
  return "зміна абонемента";
};

const getSubscriptionActionTone = (row) => {
  const action = row.actionType;
  const change = row.changeType;
  if (action === "create" && change === "subscription_created") return "added";
  if (action === "delete" && change === "subscription_deleted") return "removed";
  if (change === "one_off_created") return "accent";
  if (change === "one_off_removed") return "removed";
  if (change === "usage_changed") return "info";
  if (change === "payment_changed" || change === "financial_changed") return "warning";
  if (["date_changed", "activation_changed", "plan_changed"].includes(change)) return "info";
  return "neutral";
};

const getSubscriptionTargetLabel = (row) => row.studentName || row.studentId || "Учениця не вказана";

const formatSubscriptionChangeSummary = (row) => {
  const prev = row.previousValue;
  const next = row.newValue;

  if (row.changeType === "usage_changed") {
    const before = getValueByKeys(prev, ["used_trainings", "usedTrainings", "used"]);
    const after = getValueByKeys(next, ["used_trainings", "usedTrainings", "used"]);
    if (hasValue(before) || hasValue(after)) return `використано: ${hasValue(before) ? before : "—"} → ${hasValue(after) ? after : "—"}`;
  }

  if (row.changeType === "financial_changed") {
    const before = getValueByKeys(prev, ["amount", "base_price", "basePrice"]);
    const after = getValueByKeys(next, ["amount", "base_price", "basePrice"]);
    if (hasValue(before) || hasValue(after)) return `сума: ${formatMoneyValue(before)} → ${formatMoneyValue(after)}`;
  }

  if (row.changeType === "payment_changed") {
    const paidBefore = getValueByKeys(prev, ["paid"]);
    const paidAfter = getValueByKeys(next, ["paid"]);
    if (hasValue(paidBefore) || hasValue(paidAfter)) return `оплата: ${formatPaidValue(paidBefore)} → ${formatPaidValue(paidAfter)}`;

    const methodBefore = getValueByKeys(prev, ["pay_method", "payMethod"]);
    const methodAfter = getValueByKeys(next, ["pay_method", "payMethod"]);
    if (hasValue(methodBefore) || hasValue(methodAfter)) return `метод: ${methodBefore || "—"} → ${methodAfter || "—"}`;
  }

  if (row.changeType === "plan_changed") {
    const before = getValueByKeys(prev, ["total_trainings", "totalTrainings"]);
    const after = getValueByKeys(next, ["total_trainings", "totalTrainings"]);
    if (hasValue(before) || hasValue(after)) return `занять: ${hasValue(before) ? before : "—"} → ${hasValue(after) ? after : "—"}`;
  }

  if (row.changeType === "date_changed") return "дати змінено";
  return "";
};

export default function AttendanceTab({
  groups,
  rawSubs = [],
  subs,
  setSubs,
  isAdmin = false,
  fetchSubscriptions = isAdmin
    ? () => db.fetchSubs({ includeFinancial: true })
    : db.fetchMyAttendanceSubscriptions,
  attn,
  setAttn,
  students,
  setStudents,
  studentMap,
  studentGrps,
  setStudentGrps,
  cancelled,
  setCancelled,
  customOrders,
  onActionAddSub,
  onActionEditSub,
  onActionEditStudent,
  onActionMessageStudent,
  warnedStudents,
  setWarnedStudents,
  trialBookings = [],
  setTrialBookings,
}) {
  const styles = useMemo(
    () => makeStyles(),
    [theme.bg, theme.card, theme.input, theme.border, theme.textMain, theme.textMuted, theme.textLight, theme.primary]
  );
  const [gid, setGid] = useStickyState("", "ds_attn_gid_v2");
  const [centerMonth, setCenterMonth] = useState(today().slice(0, 7));
  const [entryMode, setEntryMode] = useState("auto");
  const [busyCell, setBusyCell] = useState("");
  const [busyCancelDate, setBusyCancelDate] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [addMode, setAddMode] = useState("student");
  const [restoreStudentId, setRestoreStudentId] = useState("");
  const [restoringStudent, setRestoringStudent] = useState(false);
  const [rpcRestoreCandidates, setRpcRestoreCandidates] = useState([]);
  const [loadingRestoreCandidates, setLoadingRestoreCandidates] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestEntryType, setGuestEntryType] = useState("trial");
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [guestRosterByGroup, setGuestRosterByGroup] = useStickyState({}, "ds_attn_guest_roster_v1");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [addingExistingStudentId, setAddingExistingStudentId] = useState("");
  const [guestGroupExpandedByGroup, setGuestGroupExpandedByGroup] = useState({});
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupPickerPos, setGroupPickerPos] = useState({ top: 0, left: 0, width: 320 });
  const [trialPopoverState, setTrialPopoverState] = useState(null);
  const [markingTrialId, setMarkingTrialId] = useState("");
  const [localOrders, setLocalOrders] = useStickyState({}, "ds_attn_local_order_v1");
  const [openMenuState, setOpenMenuState] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [subscriptionHistoryRows, setSubscriptionHistoryRows] = useState([]);
  const [subscriptionHistoryLoading, setSubscriptionHistoryLoading] = useState(false);
  const [subscriptionHistoryError, setSubscriptionHistoryError] = useState("");
  const [historyTab, setHistoryTab] = useState("attendance");
  const menuPopupRef = useRef(null);
  const groupPickerRef = useRef(null);

  useEffect(() => {
    if (!openMenuState) return;
    const onDocClick = (e) => {
      if (menuPopupRef.current?.contains(e.target)) return;
      if (e.target?.closest?.("[data-attn-menu-btn='1']")) return;
      setOpenMenuState(null);
    };
    const onViewportChange = () => setOpenMenuState(null);
    document.addEventListener("click", onDocClick);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [openMenuState]);

  useEffect(() => {
    if (!groupPickerOpen) return;
    const syncPos = () => {
      const btn = groupPickerRef.current?.querySelector("button");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const margin = 8;
      const viewportWidth = window.innerWidth || 320;
      const maxPanelWidth = Math.max(160, viewportWidth - margin * 2);
      const width = Math.min(Math.max(300, rect.width), maxPanelWidth);
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - margin - width));
      setGroupPickerPos({ top: rect.bottom + 6, left, width });
    };
    syncPos();
    const onDocClick = (e) => {
      if (groupPickerRef.current?.contains(e.target)) return;
      setGroupPickerOpen(false);
    };
    const onViewportChange = () => syncPos();
    document.addEventListener("click", onDocClick);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [groupPickerOpen]);

  useEffect(() => {
    if (!groups?.length) return;
    if (!gid || !groups.some((g) => String(g.id) === String(gid))) {
      setGid(groups[0].id);
    }
  }, [groups, gid, setGid]);

  const currentGroup = useMemo(
    () => groups.find((g) => String(g.id) === String(gid)) || null,
    [groups, gid]
  );

  useEffect(() => {
    setTrialPopoverState(null);
  }, [gid, centerMonth]);


  const groupedByDirection = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((g) => {
      const key = String(g.directionId || "other");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
    });
    return Array.from(map.entries()).map(([directionId, rows]) => ({
      directionId,
      label: rows[0]?.directionName || rows[0]?.directionTitle || (directionId === "other" ? "Без напрямку" : `Напрямок ${directionId}`),
      groups: rows,
    }));
  }, [groups]);
  const subsForAttendanceSemantics = useMemo(
    () => subs.filter((s) => isPackSubscription(s)),
    [subs]
  );

  const currentDirectionId = currentGroup?.directionId || null;
  const schedule = useMemo(
    () => parseSchedule(currentGroup?.schedule),
    [currentGroup]
  );

  const scheduleDays = useMemo(
    () => schedule.map((s) => s.day).filter((d) => typeof d === "number"),
    [schedule]
  );

  const months = useMemo(() => buildThreeMonths(centerMonth), [centerMonth]);

  const visibleDays = useMemo(() => {
    const all = months.flatMap(getMonthDays);
    if (!scheduleDays.length) return all;
    return all.filter((d) => scheduleDays.includes(getDayOfWeek(d)));
  }, [months, scheduleDays]);

  const confirmedTrialBookingsByDate = useMemo(() => {
    const filtered = (trialBookings || []).filter((booking) =>
      String(booking?.groupId || "") === String(gid || "")
      && visibleDays.includes(String(booking?.trialDate || ""))
      && String(booking?.status || "").toLowerCase() === "confirmed"
    );

    return filtered.reduce((acc, booking) => {
      const dateKey = String(booking?.trialDate || "");
      if (!dateKey) return acc;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(booking);
      return acc;
    }, {});
  }, [trialBookings, gid, visibleDays]);

  const monthSpans = useMemo(() => {
    return months.map((month) => ({
      month,
      label: monthLabel(month),
      span: visibleDays.filter((d) => d.startsWith(month)).length,
    }));
  }, [months, visibleDays]);

  const visibleDayIndex = useMemo(() => {
    const map = {};
    visibleDays.forEach((d, idx) => {
      map[d] = idx;
});
    return map;
  }, [visibleDays]);

  const activeStudentMap = useMemo(() => {
    const map = {};
    (students || []).forEach((student) => {
      if (!isVisibleAttendanceStudent(student)) return;
      map[String(student.id)] = student;
    });
    return map;
  }, [students]);

  const studentIdsInGroup = useMemo(() => {
    return [...new Set((studentGrps || [])
      .filter((sg) => String(sg.groupId) === String(gid))
      .map((sg) => String(sg.studentId)))]
      .filter((studentId) => activeStudentMap[studentId]);
  }, [studentGrps, gid, activeStudentMap]);

  const orderedStudents = useMemo(() => {
    const list = studentIdsInGroup
      .map((id) => activeStudentMap[id])
      .filter(Boolean);

    const savedOrder = localOrders?.[gid] || customOrders?.[gid] || [];
    const orderIndex = new Map(savedOrder.map((id, idx) => [String(id), idx]));

    return [...list].sort((a, b) => {
      const aId = String(a.id);
      const bId = String(b.id);
      const aIdx = orderIndex.has(aId) ? orderIndex.get(aId) : Number.MAX_SAFE_INTEGER;
      const bIdx = orderIndex.has(bId) ? orderIndex.get(bId) : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return getDisplayName(a).localeCompare(getDisplayName(b), "uk");
    });
  }, [studentIdsInGroup, activeStudentMap, customOrders, localOrders, gid]);

  useEffect(() => {
    if (!gid) {
      setRpcRestoreCandidates([]);
      return;
    }

    let alive = true;
    setRestoreStudentId("");
    setRpcRestoreCandidates([]);
    setLoadingRestoreCandidates(true);
    db.fetchRestoreCandidatesForGroup(gid)
      .then((rows) => {
        if (alive) setRpcRestoreCandidates(rows || []);
      })
      .catch((err) => {
        console.warn("restore candidates:", err?.message || err);
        if (alive) setRpcRestoreCandidates([]);
      })
      .finally(() => {
        if (alive) setLoadingRestoreCandidates(false);
      });

    return () => {
      alive = false;
    };
  }, [gid]);

  const currentGroupStudentState = useMemo(() => {
    if (!gid) return { linkedStudentIds: new Set(), historyStudentIds: new Set() };

    const currentGroupId = String(gid);
    const getGroupId = (row) => row?.groupId ?? row?.group_id ?? "";
    const getStudentId = (row) => row?.studentId ?? row?.student_id ?? "";
    const getSubId = (row) => row?.subId ?? row?.sub_id ?? "";
    const rawSubsById = new Map(
      (rawSubs || [])
        .filter((sub) => sub?.id)
        .map((sub) => [String(sub.id), sub])
    );

    const linkedStudentIds = new Set(
      (studentGrps || [])
        .filter((sg) => String(getGroupId(sg)) === currentGroupId)
        .map((sg) => String(getStudentId(sg)))
        .filter(Boolean)
    );
    const historyStudentIds = new Set();

    (rawSubs || []).forEach((sub) => {
      const studentId = getStudentId(sub);
      if (String(getGroupId(sub)) === currentGroupId && studentId) historyStudentIds.add(String(studentId));
    });

    (attn || []).forEach((row) => {
      if (String(getGroupId(row)) !== currentGroupId) return;
      const linkedSub = rawSubsById.get(String(getSubId(row)));
      const studentId = getStudentId(row) || getStudentId(linkedSub);
      if (studentId) historyStudentIds.add(String(studentId));
    });

    return { linkedStudentIds, historyStudentIds };
  }, [attn, gid, rawSubs, studentGrps]);

  const restoreCandidates = useMemo(() => {
    if (!gid) return [];

    const { linkedStudentIds, historyStudentIds } = currentGroupStudentState;
    const byStudentId = new Map();

    (students || []).forEach((student) => {
      if (!student?.id) return;
      const studentId = String(student.id);
      if (linkedStudentIds.has(studentId) || !historyStudentIds.has(studentId)) return;
      byStudentId.set(studentId, {
        student,
        hasHistory: true,
      });
    });

    (rpcRestoreCandidates || []).forEach(({ student }) => {
      if (!student?.id) return;
      const studentId = String(student.id);
      if (linkedStudentIds.has(studentId)) return;
      const current = byStudentId.get(studentId);
      byStudentId.set(studentId, {
        student: current?.student || student,
        hasHistory: true,
      });
    });

    return [...byStudentId.values()].sort((a, b) => {
      if (a.hasHistory !== b.hasHistory) return a.hasHistory ? -1 : 1;
      return getDisplayName(a.student).localeCompare(getDisplayName(b.student), "uk");
    });
  }, [currentGroupStudentState, gid, rpcRestoreCandidates, students]);

  const restoreCandidateIds = useMemo(
    () => new Set(restoreCandidates.map(({ student }) => String(student.id))),
    [restoreCandidates]
  );

  const existingStudentMatches = useMemo(() => {
    const query = normalizeName(newStudentName);
    if (query.length < 2) return [];

    return (students || [])
      .map((student) => {
        if (!student?.id) return null;
        const displayName = getDisplayName(student);
        const normalizedDisplayName = normalizeName(displayName);
        if (!normalizedDisplayName) return null;

        let score = null;
        if (normalizedDisplayName === query) score = 0;
        else if (normalizedDisplayName.startsWith(query)) score = 1;
        else if (normalizedDisplayName.includes(query)) score = 2;
        else if (query.split(" ").every((part) => normalizedDisplayName.includes(part))) score = 3;
        if (score === null) return null;

        const studentId = String(student.id);
        const isLinkedToCurrentGroup = currentGroupStudentState.linkedStudentIds.has(studentId);
        const canRestoreToCurrentGroup = !isLinkedToCurrentGroup && (
          currentGroupStudentState.historyStudentIds.has(studentId) || restoreCandidateIds.has(studentId)
        );
        return {
          student,
          studentId,
          displayName,
          score,
          isLinkedToCurrentGroup,
          canRestoreToCurrentGroup,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.displayName.localeCompare(b.displayName, "uk");
      })
      .slice(0, 8);
  }, [currentGroupStudentState, newStudentName, restoreCandidateIds, students]);

  const addStudentIdToLocalOrder = (studentId) => {
    setLocalOrders((prev) => {
      const arr = prev?.[gid] || customOrders?.[gid] || [];
      if (arr.some((id) => String(id) === String(studentId))) return prev;
      return { ...(prev || {}), [gid]: [...arr, studentId] };
    });
  };

  const handleAddExistingStudentToGroup = async (student) => {
    if (!gid || !student?.id) return;
    const studentId = String(student.id);
    const alreadyLinked = (studentGrps || []).some(
      (sg) => String(sg.studentId) === studentId && String(sg.groupId) === String(gid)
    );
    if (alreadyLinked) {
      alert("Така учениця вже є в цій групі.");
      return;
    }

    setAddingExistingStudentId(studentId);
    try {
      const link = await db.addStudentGroup(student.id, gid);
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => {
          const list = prev || [];
          if (list.some((sg) => String(sg.studentId) === studentId && String(sg.groupId) === String(gid))) return list;
          return [...list, link || { id: `sg_${uid()}`, studentId: student.id, groupId: gid }];
        });
      }
      addStudentIdToLocalOrder(student.id);
      setNewStudentName("");
    } catch (err) {
      alert(err?.message || "Не вдалося додати ученицю в цю групу");
    } finally {
      setAddingExistingStudentId("");
    }
  };

  const handleCreateStudentInGroup = async () => {
    const name = (newStudentName || "").trim();
    if (!gid) return;
    if (!name) {
      alert("Введи ім'я учениці.");
      return;
    }

    const normalizedName = normalizeName(name);
    const duplicateInGroup = orderedStudents.some(
      (s) => normalizeName(getDisplayName(s)) === normalizedName
    );
    if (duplicateInGroup) {
      alert("Така учениця вже є в цій групі.");
      return;
    }

    const exactExistingStudent = (students || []).find((student) => normalizeName(getDisplayName(student)) === normalizedName);
    if (exactExistingStudent) {
      const exactStudentId = String(exactExistingStudent.id);
      if (currentGroupStudentState.linkedStudentIds.has(exactStudentId)) {
        alert("Така учениця вже є в цій групі.");
      } else {
        alert("Така учениця вже є в базі. Додай її в групу зі списку підказок.");
      }
      return;
    }

    setCreatingStudent(true);
    try {
      const createdStudent = await db.createStudentForGroup(gid, { name });
      const link = { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid };

      if (typeof setStudents === "function") {
        setStudents((prev) => [...(prev || []), createdStudent]);
      }
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => {
          const list = prev || [];
          if (list.some((sg) => String(sg.studentId) === String(createdStudent.id) && String(sg.groupId) === String(gid))) return list;
          return [...list, link || { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid }];
        });
      }
      addStudentIdToLocalOrder(createdStudent.id);
      setNewStudentName("");
    } catch (err) {
      alert(`Не вдалося створити ученицю через CRM RPC. ${err?.message || "Перевір, що функція crm_create_student_for_group застосована в Supabase."}`);
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleRestoreStudentToGroup = async (studentIdOverride = "") => {
    const overrideStudentId = typeof studentIdOverride === "string" ? studentIdOverride : "";
    const targetStudentId = overrideStudentId || restoreStudentId;
    if (!gid || !targetStudentId) return;

    const alreadyLinked = (studentGrps || []).some(
      (sg) => String(sg.studentId) === String(targetStudentId) && String(sg.groupId) === String(gid)
    );
    if (alreadyLinked) {
      alert("Учениця вже є в цій групі.");
      setRestoreStudentId("");
      return;
    }

    setRestoringStudent(true);
    try {
      const link = await db.restoreStudentToGroup(gid, targetStudentId);
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => {
          const list = prev || [];
          if (list.some((sg) => String(sg.studentId) === String(targetStudentId) && String(sg.groupId) === String(gid))) return list;
          return [...list, link || { id: `sg_${uid()}`, studentId: targetStudentId, groupId: gid }];
        });
      }
      addStudentIdToLocalOrder(targetStudentId);
      setRestoreStudentId("");
      if (overrideStudentId) setNewStudentName("");
    } catch (err) {
      alert(err?.message || "Не вдалося відновити ученицю в групі");
    } finally {
      setRestoringStudent(false);
    }
  };

  const moveStudent = (studentId, direction) => {
    setLocalOrders((prev) => {
      const idsInGroup = orderedStudents.map((s) => String(s.id));
      const base = ((prev?.[gid] || customOrders?.[gid] || [])).map(String).filter((id) => idsInGroup.includes(id));
      const full = [...base, ...idsInGroup.filter((id) => !base.includes(id))];
      const idx = full.indexOf(String(studentId));
      if (idx < 0) return prev;
      const nextIdx = direction === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= full.length) return prev;
      const next = [...full];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return { ...(prev || {}), [gid]: next };
    });
  };

  const buildGuestAutoLabel = () => {
    const dateLabel = today();
    const sameDayCount = attn.filter((a) =>
      String(a.groupId) === String(gid) &&
      !a.studentId &&
      toDateKey(a.date) === dateLabel
    ).length;
    return `Гість ${dateLabel} #${sameDayCount + 1}`;
  };

  const handleCreateGuestAttendance = async () => {
    if (!gid) return;
    if (!guestEntryType || (guestEntryType !== "trial" && guestEntryType !== "single")) return;
    const trimmedName = (guestNameInput || "").trim();
    const guestLabel = trimmedName || makeAnonymousGuestLabel({ groupId: gid, dateStr: "pending" });
    setCreatingGuest(true);
    try {
      const row = { id: `g_${uid()}`, isGuest: true, guestName: guestLabel, attendanceIds: [], anonymous: isAnonymousGuestLabel(guestLabel), guestEntryType };
      setGuestRosterByGroup((prev) => ({ ...(prev || {}), [gid]: [...(prev?.[gid] || []), row] }));
      setGuestNameInput("");
    } finally {
      setCreatingGuest(false);
    }
  };

  const handleRemoveFromGroup = async (student) => {
    if (!gid || !student?.id) return;
    const targetGroupId = String(gid);
    const targetStudentId = String(student.id);
    const hasStudentGroupLink = (studentGrps || []).some(
      (sg) => String(sg.studentId) === targetStudentId && String(sg.groupId) === targetGroupId
    );
    if (!hasStudentGroupLink) {
      alert("Учениця показується через абонемент або історію відвідувань цієї групи. Абонементи та історію не видаляємо з цієї дії.");
      return;
    }

    const ok = window.confirm(`Прибрати ${getDisplayName(student)} з групи "${currentGroup?.name || gid}"?`);
    if (!ok) return;
    try {
      await db.removeStudentGroup(targetStudentId, targetGroupId);
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => (prev || []).filter((sg) => !(
          String(sg.studentId) === targetStudentId && String(sg.groupId) === targetGroupId
        )));
      }
      setLocalOrders((prev) => {
        const arr = prev?.[targetGroupId] || [];
        if (!arr.some((id) => String(id) === targetStudentId)) return prev;
        return { ...(prev || {}), [targetGroupId]: arr.filter((id) => String(id) !== targetStudentId) };
      });
    } catch (err) {
      alert(err?.message || "Не вдалося прибрати ученицю з групи");
    }
  };

  const handleAddSub = (student) => {
    if (typeof onActionAddSub === "function") {
      onActionAddSub(student.id, gid);
    }
    setOpenMenuState(null);
  };

  const handleEditStudent = (student) => {
    if (typeof onActionEditStudent === "function") {
      onActionEditStudent(student);
    } else {
      alert("Редагування учениці недоступне в цьому екрані");
    }
    setOpenMenuState(null);
  };

  const handleEditSub = (student) => {
    const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, today());
    const lastSub = [...subsForAttendanceSemantics]
      .filter((s) => String(s.studentId) === String(student.id) && String(s.groupId) === String(gid))
      .sort((a, b) => {
        const aKey = a.activationDate || a.startDate || a.created_at || "";
        const bKey = b.activationDate || b.startDate || b.created_at || "";
        if (aKey !== bKey) return bKey.localeCompare(aKey);
        return (b.created_at || "").localeCompare(a.created_at || "");
      })[0];
    const targetSub = activeSub || lastSub;

    if (!targetSub) {
      alert("Абонемент не знайдено.");
      setOpenMenuState(null);
      return;
    }
    if (typeof onActionEditSub === "function") {
      onActionEditSub(targetSub);
    } else {
      alert("Редагування абонемента недоступне в цьому екрані");
    }
    setOpenMenuState(null);
  };

  const handleMessageStudent = (student) => {
    if (typeof onActionMessageStudent === "function") {
      onActionMessageStudent(student);
    }
    setOpenMenuState(null);
  };

  const handleConvertGuestToStudent = async (guestRow) => {
    if (!guestRow?.guestName || !gid) return;
    const defaultName = isAnonymousGuestLabel(guestRow.guestName) ? "Гість" : guestRow.guestName;
    const enteredName = window.prompt("Ім'я нової учениці", defaultName);
    if (enteredName == null) return;
    const name = enteredName.trim();
    if (!name) {
      alert("Вкажи ім'я учениці.");
      return;
    }
    try {
      const safeRowIds = Array.isArray(guestRow.attendanceIds) ? guestRow.attendanceIds.filter(Boolean) : [];
      if (!safeRowIds.length) {
        alert("Не знайдено записів гостя в поточному видимому періоді.");
        return;
      }
      const ok = window.confirm(`Перетворити гостя на ученицю і переприв'язати ${safeRowIds.length} запис(ів) тільки з поточного видимого періоду?`);
      if (!ok) return;
      const createdStudent = await db.createStudentForGroup(gid, { name });
      const link = { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid };
      await db.relinkGuestAttendanceToStudent({ groupId: gid, studentId: createdStudent.id, attendanceIds: safeRowIds });
      setGuestRosterByGroup((prev) => ({
        ...(prev || {}),
        [gid]: (prev?.[gid] || []).filter((r) => r.id !== guestRow.id && normalizeName(r.guestName) !== normalizeName(guestRow.guestName)),
      }));
      if (typeof setStudents === "function") {
        setStudents((prev) => [...(prev || []), createdStudent]);
      }
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => [...(prev || []), link || { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid }]);
      }
      await reloadFromDb();
      setOpenMenuState(null);
    } catch (err) {
      alert(`Не вдалося перетворити гостя на ученицю через CRM RPC. ${err?.message || "Перевір, що функція crm_create_student_for_group застосована в Supabase."}`);
    }
  };
  const handleRemoveGuestRosterRow = (guestRow) => {
    const hasAttendance = attn.some((a) => String(a.groupId) === String(gid) && !a.studentId && normalizeName(a.guestName) === normalizeName(guestRow.guestName));
    if (hasAttendance) {
      alert("Спочатку приберіть відмітки відвідувань цього гостя в таблиці.");
      return;
    }
    setGuestRosterByGroup((prev) => ({ ...(prev || {}), [gid]: (prev?.[gid] || []).filter((r) => r.id !== guestRow.id) }));
    setOpenMenuState(null);
  };

  const warnedKey = (studentId) => `${gid || "group"}:${studentId}`;

  const isWarned = (studentId) => !!warnedStudents?.[warnedKey(studentId)];

  const toggleWarned = async (studentId, checked) => {
    if (typeof setWarnedStudents !== "function") return;
    const key = warnedKey(studentId);
    setWarnedStudents((prev) => ({ ...(prev || {}), [key]: !!checked }));
    try {
      await db.upsertWarnedStudent(gid, studentId, checked);
    } catch (err) {
      setWarnedStudents((prev) => ({ ...(prev || {}), [key]: !checked }));
      alert(err?.message || "Не вдалося зберегти статус сповіщення");
    }
  };

  const openStudentMenu = (student, btnEl) => {
    const rect = btnEl.getBoundingClientRect();
    const menuWidth = 170;
    const menuHeight = 196;
    const margin = 8;

    let left = rect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }

    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - margin) {
      top = rect.top - menuHeight - 6;
    }
    if (top < margin) top = margin;

    setOpenMenuState({ studentId: student.id, top, left });
  };

  const subsById = useMemo(() => {
    const map = {};
    subs.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [subs]);

  const lastAttendanceBySub = useMemo(() => {
    const map = {};
    attn.forEach((a) => {
      if (!a.subId) return;
      if (!map[a.subId] || map[a.subId] < a.date) {
        map[a.subId] = a.date;
      }
    });
    return map;
  }, [attn]);

  const subPeriodsByStudent = useMemo(() => {
    const map = {};

    subsForAttendanceSemantics
      .filter((s) => String(s.groupId) === String(gid))
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
      .forEach((s) => {
        const start = s.activationDate || s.startDate || "0000-00-00";
        const exhausted = (s.usedTrainings || 0) >= (s.totalTrainings || 0);
        const defaultEnd = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
        const end = exhausted
          ? (lastAttendanceBySub[s.id] || defaultEnd)
          : defaultEnd;
        const completed = exhausted || end < today();

        if (!map[s.studentId]) map[s.studentId] = [];
        map[s.studentId].push({
          subId: s.id,
          start,
          end: end >= start ? end : start,
          completed,
        });
      });

    return map;
  }, [subsForAttendanceSemantics, gid, lastAttendanceBySub]);

  const getSubPeriodForCell = (studentId, dateStr) => {
    const periods = subPeriodsByStudent[studentId] || [];
    return periods.find((p) => p.start <= dateStr && p.end >= dateStr) || null;
  };

  const sameStudentByRecord = (record, student) => {
    if (record.studentId) {
      return String(record.studentId) === String(student.id);
    }
    if (record.subId) {
      const linkedSub = subsById[record.subId];
      return String(linkedSub?.studentId) === String(student.id);
    }
    const recName = normalizeName(record.guestName);
    const stName1 = normalizeName(getDisplayName(student));
    const stName2 = normalizeName(student.name);
    return !!recName && (recName === stName1 || recName === stName2);
  };

  const recordMatchesCell = (record, student, dateStr, groupId = gid) => {
    return (
      String(record.groupId) === String(groupId) &&
      toDateKey(record.date) === toDateKey(dateStr) &&
      sameStudentByRecord(record, student)
    );
  };

  const getRecordsForCell = (student, dateStr) => {
    return attn.filter((a) => recordMatchesCell(a, student, dateStr));
  };

  const getRecordForCell = (student, dateStr) => {
    const all = getRecordsForCell(student, dateStr);
    return all[0] || null;
  };

  const isCancelledDate = (dateStr) =>
    cancelled.some((c) => c.groupId === gid && c.date === dateStr);

  const loadAttendanceHistory = async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const rows = await db.fetchAttendanceChangeLog({
        groupId: gid || undefined,
        limit: 100,
      });
      setHistoryRows(rows);
    } catch (err) {
      console.warn("fetch attendance change log failed:", err?.message || err);
      setHistoryError("Не вдалося завантажити історію змін.");
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSubscriptionHistory = async () => {
    if (!isAdmin) return;
    setSubscriptionHistoryLoading(true);
    setSubscriptionHistoryError("");
    try {
      const rows = await db.fetchSubscriptionChangeLog({
        groupId: gid || undefined,
        limit: 100,
      });
      setSubscriptionHistoryRows(rows);
    } catch (err) {
      console.warn("fetch subscription change log failed:", err?.message || err);
      setSubscriptionHistoryError("Не вдалося завантажити історію абонементів.");
      setSubscriptionHistoryRows([]);
    } finally {
      setSubscriptionHistoryLoading(false);
    }
  };

  const switchHistoryTab = (tabKey) => {
    setHistoryTab(tabKey);
    if (tabKey === "subscriptions" && !subscriptionHistoryRows.length) {
      loadSubscriptionHistory();
    }
  };

  const reloadActiveHistoryTab = () => {
    if (historyTab === "subscriptions") {
      loadSubscriptionHistory();
      return;
    }
    if (historyTab === "attendance") {
      loadAttendanceHistory();
    }
  };

  const openAttendanceHistory = () => {
    if (!isAdmin) return;
    setHistoryTab("attendance");
    setSubscriptionHistoryRows([]);
    setSubscriptionHistoryError("");
    setHistoryOpen(true);
    loadAttendanceHistory();
  };

  const hasAttendanceInDirection = (student) => {
    if (!currentDirectionId) return false;
    const directionGroupIds = new Set(
      groups
        .filter((g) => g.directionId === currentDirectionId)
        .map((g) => g.id)
    );

    return attn.some((a) => {
      if (!directionGroupIds.has(String(a.groupId))) return false;
      return sameStudentByRecord(a, student);
    });
  };

  const resolveNewEntry = (student, dateStr) => {
    if (entryMode === "subscription") {
      const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
      if (!activeSub) {
        throw new Error("На цю дату немає активного абонемента.");
      }
      return { entryType: "subscription", subId: activeSub.id };
    }

    if (entryMode === "single") {
      return { entryType: "single", subId: null };
    }

    if (entryMode === "trial") {
      if (hasAttendanceInDirection(student)) {
        throw new Error("Пробне заняття доступне тільки для нових учениць у цьому напрямку.");
      }
      return { entryType: "trial", subId: null };
    }

    if (entryMode === "debt") {
      const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
      if (activeSub) {
        throw new Error("У учениці є активний абонемент, борг ставити не можна.");
      }
      return { entryType: "debt", subId: null };
    }

    const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
    if (activeSub) {
      return { entryType: "subscription", subId: activeSub.id };
    }

    return { entryType: "debt", subId: null };
  };

  const DEBUG_ATTENDANCE_PAYLOAD = false;

  const reloadFromDb = async () => {
    const [freshAttn, freshSubs, freshCancelled] = await Promise.all([
      db.fetchAttendance(),
      fetchSubscriptions(),
      db.fetchCancelled(),
    ]);
    setAttn(freshAttn);
    setSubs(freshSubs);
    setCancelled(freshCancelled);
    return { freshAttn, freshSubs, freshCancelled };
  };

  const refreshSubscriptionsAfterAttendanceChange = async () => {
    try {
      const freshSubs = await fetchSubscriptions();
      setSubs(freshSubs);
      return freshSubs;
    } catch (err) {
      console.warn("refresh subscriptions after attendance change:", err?.message || err);
      return null;
    }
  };

  const makeTempAttendanceId = () => `temp_attendance_${Date.now()}_${uid()}`;

  const buildOptimisticAttendanceRecord = (payload) => ({
    id: makeTempAttendanceId(),
    subId: payload.subId || null,
    studentId: payload.studentId || null,
    date: payload.date,
    guestName: payload.guestName || null,
    guestType: payload.guestType || null,
    groupId: payload.groupId || null,
    quantity: payload.quantity || 1,
    entryType: payload.entryType || "subscription",
  });

  const applyAttendanceStateChange = ({ removeIds = [], addRows = [] } = {}) => {
    const removeSet = new Set(removeIds.filter(Boolean).map(String));
    const addIdSet = new Set(addRows.map((row) => String(row.id)));
    setAttn((prev) => [
      ...((prev || []).filter((row) => !removeSet.has(String(row.id)) && !addIdSet.has(String(row.id)))),
      ...addRows,
    ]);
  };

  const replaceOptimisticAttendanceRecord = (tempId, realRow) => {
    if (!tempId || !realRow?.id) return;
    setAttn((prev) => {
      let replaced = false;
      const withoutRealDuplicate = (prev || []).filter((row) => String(row.id) === String(tempId) || String(row.id) !== String(realRow.id));
      const next = withoutRealDuplicate.map((row) => {
        if (String(row.id) !== String(tempId)) return row;
        replaced = true;
        return realRow;
      });
      return replaced ? next : [...next, realRow];
    });
  };

  const rollbackAttendanceStateChange = ({ removeIds = [], restoreRows = [] } = {}) => {
    const removeSet = new Set(removeIds.filter(Boolean).map(String));
    setAttn((prev) => {
      const next = (prev || []).filter((row) => !removeSet.has(String(row.id)));
      const existingIds = new Set(next.map((row) => String(row.id)));
      restoreRows.forEach((row) => {
        if (row?.id && !existingIds.has(String(row.id))) {
          next.push(row);
          existingIds.add(String(row.id));
        }
      });
      return next;
    });
  };

  const handleToggleCell = async (student, dateStr) => {
    if (!gid) return;
    if (isCancelledDate(dateStr)) return;
    if (isFutureAttendanceDate(dateStr)) {
      alert(FUTURE_ATTENDANCE_MESSAGE);
      return;
    }

    const cellKey = `${student.id}_${dateStr}`;
    setBusyCell(cellKey);

    let rollbackOptimisticChange = null;
    let shouldReconcileDuplicate = false;
    let backendMutationStarted = false;

    try {
      const existing = getRecordsForCell(student, dateStr);

      if (existing.length) {
        if (existing.length === 1 && (existing[0].quantity || 1) === 1) {
          const rec = existing[0];
          const payload = {
            id: `tmp_${uid()}`,
            subId: rec.subId,
            studentId: student.id,
            date: dateStr,
            guestName: null,
            guestType: null,
            groupId: gid,
            quantity: 2,
            entryType: rec.subId
              ? "subscription"
              : (String(rec.entryType || "").toLowerCase() === "single"
                  ? "single"
                  : (String(rec.entryType || "").toLowerCase() === "unpaid" ? "unpaid" : "debt")),
          };
          const optimisticRecord = buildOptimisticAttendanceRecord(payload);
          applyAttendanceStateChange({ removeIds: [rec.id], addRows: [optimisticRecord] });
          rollbackOptimisticChange = () => rollbackAttendanceStateChange({ removeIds: [optimisticRecord.id], restoreRows: [rec] });

          backendMutationStarted = true;
          await db.deleteAttendance(rec.id);
          if (DEBUG_ATTENDANCE_PAYLOAD) console.log("[AttendanceTab] insert payload", payload);
          const savedRecord = await db.insertAttendance(payload);
          replaceOptimisticAttendanceRecord(optimisticRecord.id, savedRecord);
          rollbackOptimisticChange = null;
          if (rec.subId) {
            await db.syncSubUsedTrainings(rec.subId);
          }
          await refreshSubscriptionsAfterAttendanceChange();
          return;
        }

        const subIdsToSync = [...new Set(existing.map((rec) => rec.subId).filter(Boolean))];
        applyAttendanceStateChange({ removeIds: existing.map((rec) => rec.id) });
        rollbackOptimisticChange = () => rollbackAttendanceStateChange({ restoreRows: existing });

        backendMutationStarted = true;
        for (const rec of existing) {
          if (rec.id) {
            await db.deleteAttendance(rec.id);
          }
        }
        for (const subId of subIdsToSync) {
          await db.syncSubUsedTrainings(subId);
        }
        rollbackOptimisticChange = null;
        await refreshSubscriptionsAfterAttendanceChange();
        return;
      }

      const nextEntry = resolveNewEntry(student, dateStr);

      const payload = {
        id: `tmp_${uid()}`,
        subId: nextEntry.subId,
        studentId: student.id,
        date: dateStr,
        guestName: null,
        guestType: null,
        groupId: gid,
        quantity: 1,
        entryType: nextEntry.entryType,
        explicitEntryType: entryMode === "trial" || entryMode === "single",
      };
      const optimisticRecord = buildOptimisticAttendanceRecord(payload);
      applyAttendanceStateChange({ addRows: [optimisticRecord] });
      rollbackOptimisticChange = () => rollbackAttendanceStateChange({ removeIds: [optimisticRecord.id] });
      shouldReconcileDuplicate = true;

      if (DEBUG_ATTENDANCE_PAYLOAD) console.log("[AttendanceTab] insert payload", payload);
      backendMutationStarted = true;
      const savedRecord = await db.insertAttendance(payload);
      replaceOptimisticAttendanceRecord(optimisticRecord.id, savedRecord);
      rollbackOptimisticChange = null;
      shouldReconcileDuplicate = false;

      if (nextEntry.subId) {
        await db.syncSubUsedTrainings(nextEntry.subId);
      }
      await refreshSubscriptionsAfterAttendanceChange();
    } catch (err) {
      const msg = err?.message || "Невідома помилка";
      const isDuplicateError = msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");

      if (backendMutationStarted) {
        try {
          const { freshAttn } = await reloadFromDb();
          if (shouldReconcileDuplicate && isDuplicateError) {
            const existsAfterReload = freshAttn.some((a) => recordMatchesCell(a, student, dateStr));
            if (!existsAfterReload) {
              alert("Не вдалося додати відвідування. Спробуй ще раз.");
            }
          } else {
            alert(msg);
          }
        } catch (reloadErr) {
          console.warn("attendance reconciliation failed:", reloadErr?.message || reloadErr);
          if (shouldReconcileDuplicate && isDuplicateError) {
            alert("Запис уже є в базі.");
          } else {
            alert(msg);
          }
        }
      } else {
        if (typeof rollbackOptimisticChange === "function") {
          rollbackOptimisticChange();
        }
        alert(msg);
      }
    } finally {
      setBusyCell("");
    }
  };

  const handleToggleCancelled = async (dateStr) => {
    if (!gid || !currentGroup) return;

    setBusyCancelDate(dateStr);
    try {
      const existing = cancelled.find((c) => c.groupId === gid && c.date === dateStr);

      if (!existing) {
        const ok = window.confirm(`Скасувати тренування ${dateStr}?`);
        if (!ok) return;

        await db.cancelTrainingForGroup(gid, dateStr);
        await reloadFromDb();
        return;
      }

      const ok = window.confirm(`Відновити тренування ${dateStr}?`);
      if (!ok) return;

      await db.restoreCancelledTraining(existing.id);
      await reloadFromDb();
    } catch (err) {
      alert(err?.message || "Не вдалося змінити статус тренування");
    } finally {
      setBusyCancelDate("");
    }
  };

  const handleToggleGuestCell = async (guestRow, dateStr) => {
    if (!gid || isCancelledDate(dateStr)) return;
    if (isFutureAttendanceDate(dateStr)) {
      alert(FUTURE_ATTENDANCE_MESSAGE);
      return;
    }
    let guestIdentity = String(guestRow?.guestName || "").trim();
    if (isAnonymousGuestLabel(guestIdentity) && guestIdentity.includes(":pending:")) {
      guestIdentity = makeAnonymousGuestLabel({ groupId: gid, dateStr });
      if (guestRow?.id) {
        setGuestRosterByGroup((prev) => ({
          ...(prev || {}),
          [gid]: (prev?.[gid] || []).map((r) => (r.id === guestRow.id ? { ...r, guestName: guestIdentity } : r)),
        }));
      }
    }
    if (!guestIdentity) return;

    const guestCellKey = `guest_${guestRow?.id || normalizeName(guestIdentity)}_${dateStr}`;
    setBusyCell(guestCellKey);

    let rollbackOptimisticChange = null;
    let backendMutationStarted = false;

    try {
      const existingById = (guestRow.attendanceIds || [])
        .map((id) => attn.find((a) => a.id === id))
        .find((a) => a && toDateKey(a.date) === toDateKey(dateStr));
      const existingByName = attn.find((a) =>
        String(a.groupId) === String(gid) &&
        !a.studentId &&
        normalizeName(a.guestName) === normalizeName(guestIdentity) &&
        toDateKey(a.date) === toDateKey(dateStr)
      );
      const existing = existingById || existingByName || null;

      if (existing?.id) {
        applyAttendanceStateChange({ removeIds: [existing.id] });
        rollbackOptimisticChange = () => rollbackAttendanceStateChange({ restoreRows: [existing] });
        backendMutationStarted = true;
        await db.deleteAttendance(existing.id);
      } else {
        const entry = guestRow.guestEntryType || guestEntryType || "trial";
        if (entry === "trial") {
          const hadTrialBefore = attn.some((a) => {
            const type = String(a.entryType || a.guestType || "").toLowerCase();
            if (type !== "trial") return false;
            if (String(a.groupId) !== String(gid)) return false;
            if (a.studentId && guestRow.studentId) return String(a.studentId) === String(guestRow.studentId);
            return normalizeName(a.guestName) === normalizeName(guestIdentity);
          });
          if (hadTrialBefore) {
            alert("Для цього гостя/учениці пробне вже було. Використай разове (single).");
            return;
          }
        }
        const payload = { id: `tmp_${uid()}`, subId: null, studentId: null, date: dateStr, guestName: guestIdentity, guestType: entry, groupId: gid, quantity: 1, entryType: entry };
        const optimisticRecord = buildOptimisticAttendanceRecord(payload);
        applyAttendanceStateChange({ addRows: [optimisticRecord] });
        rollbackOptimisticChange = () => rollbackAttendanceStateChange({ removeIds: [optimisticRecord.id] });
        backendMutationStarted = true;
        const savedRecord = await db.insertAttendance(payload);
        replaceOptimisticAttendanceRecord(optimisticRecord.id, savedRecord);
      }

      rollbackOptimisticChange = null;
      await refreshSubscriptionsAfterAttendanceChange();
    } catch (err) {
      if (backendMutationStarted) {
        try {
          await reloadFromDb();
        } catch (reloadErr) {
          console.warn("guest attendance reconciliation failed:", reloadErr?.message || reloadErr);
        }
      } else if (typeof rollbackOptimisticChange === "function") {
        rollbackOptimisticChange();
      }
      alert(err?.message || "Не вдалося змінити відвідування гостя.");
    } finally {
      setBusyCell("");
    }
  };

  const getCellView = (student, dateStr) => {
    const rec = getRecordForCell(student, dateStr);
    const isDark = theme.bg === "#0F131A";
    if (!rec) return { bg: isDark ? "#182230" : theme.card, mark: "" };

    const type = String(rec.entryType || rec.guestType || "subscription").trim().toLowerCase();
    const mark = (rec.quantity || 1) >= 2 ? "2" : "✓";
    if (type === "debt") return { bg: isDark ? "#7f1d1d" : "#dc2626", mark: "!" };
    if (type === "single") return { bg: isDark ? "#7a4313" : "#f59e0b", mark };
    if (type === "trial") return { bg: isDark ? "#0f5a43" : "#10b981", mark };
    return { bg: isDark ? "#1f3e79" : "#2563eb", mark };
  };

  const guestRows = useMemo(() => {
    const tempRows = guestRosterByGroup?.[gid] || [];
    const persistedRows = attn.filter((a) =>
      String(a.groupId) === String(gid) &&
      !a.studentId &&
      visibleDays.includes(toDateKey(a.date))
    );
    const merged = new Map();

    tempRows.forEach((r) => {
      const key = normalizeName(r.guestName) || `guest_${r.id}`;
      merged.set(key, { ...r, attendanceIds: Array.isArray(r.attendanceIds) ? [...r.attendanceIds] : [] });
    });

    persistedRows.forEach((r) => {
      const key = normalizeName(r.guestName) || `guest_${toDateKey(r.date)}`;
      const baseName = (r.guestName || "").trim() || `Гість ${toDateKey(r.date)}`;
      const existing = merged.get(key) || {
        id: `guest:${key}`,
        isGuest: true,
        guestName: baseName,
        anonymous: isAnonymousGuestLabel(baseName),
        attendanceIds: [],
        guestEntryType: String(r.entryType || r.guestType || "trial").toLowerCase() === "single" ? "single" : "trial",
      };
      if (r.id && !existing.attendanceIds.includes(r.id)) existing.attendanceIds.push(r.id);
      merged.set(key, existing);
    });

    return Array.from(merged.values());
  }, [guestRosterByGroup, gid, attn, visibleDays]);

  const groupedGuestRows = useMemo(
    () => guestRows.filter((r) => r.isGuest),
    [guestRows]
  );
  const guestGroupExpanded = !!guestGroupExpandedByGroup[String(gid)];
  const displayRows = useMemo(() => {
    const students = orderedStudents.map((s) => ({ ...s, isGuest: false }));
    if (!groupedGuestRows.length) return [...students];
    const parent = {
      id: `guest-group:${gid}`,
      isGuestGroup: true,
      isGuest: false,
      guestCount: groupedGuestRows.length,
    };
    const guestChildren = guestGroupExpanded
      ? groupedGuestRows.map((g) => ({ ...g, isGuestChild: true }))
      : [];
    return [...students, parent, ...guestChildren];
  }, [orderedStudents, groupedGuestRows, guestGroupExpanded, gid]);

  const groupStudentIdSet = useMemo(
    () => new Set(studentIdsInGroup.map((id) => String(id))),
    [studentIdsInGroup]
  );

  if (!groups?.length) {
    return <div style={styles.emptyState}>Немає груп.</div>;
  }

  if (!currentGroup) {
    return <div style={styles.emptyState}>Вибери групу.</div>;
  }

  const totalsByDate = visibleDays.reduce((acc, dateStr) => {
    if (isCancelledDate(dateStr)) {
      acc[dateStr] = { total: 0, removed: 0 };
      return acc;
    }

    const records = attn.filter(
      (a) => a.groupId === gid && toDateKey(a.date) === toDateKey(dateStr)
    );

    const total = records.reduce((sum, a) => sum + (a.quantity || 1), 0);
    const removed = records.reduce((sum, a) => {
      const resolvedStudentId = a.studentId || subsById[a.subId]?.studentId || null;
      if (!resolvedStudentId) return sum;
      if (groupStudentIdSet.has(String(resolvedStudentId))) return sum;
      return sum + (a.quantity || 1);
    }, 0);

    acc[dateStr] = { total, removed };
    return acc;
  }, {});

  const findExistingStudentForTrial = (booking) => {
    const phone = String(booking?.phone || "").trim();
    const telegram = String(booking?.telegram || "").trim().toLowerCase();
    const instagram = String(booking?.instagram || "").trim().toLowerCase();

    const byPhone = phone && (students || []).find((s) => String(s.phone || "").trim() === phone);
    if (byPhone) return byPhone;
    const byTelegram = telegram && (students || []).find((s) => String(s.telegram || "").trim().toLowerCase() === telegram);
    if (byTelegram) return byTelegram;
    const byInstagramInNotes = instagram && (students || []).find((s) => String(s.notes || "").toLowerCase().includes(instagram));
    if (byInstagramInNotes) return byInstagramInNotes;
    return null;
  };

  const handleAddTrialBookingToGroup = async (booking) => {
    try {
      if (!booking?.id || !booking?.groupId || !booking?.trialDate) throw new Error("Некоректні дані запису на пробне");
      setMarkingTrialId(String(booking.id));

      let resolvedStudent = null;
      let resolvedStudentId = booking.studentId || booking.convertedStudentId || null;

      if (resolvedStudentId) {
        resolvedStudent = (students || []).find((s) => String(s.id) === String(resolvedStudentId)) || null;
      }

      if (!resolvedStudentId) {
        resolvedStudent = findExistingStudentForTrial(booking);
        if (resolvedStudent?.id) {
          resolvedStudentId = resolvedStudent.id;
        }
      }

      let createdInThisFlow = false;
      if (!resolvedStudentId) {
        const notes = [booking.note, booking.source ? `source: ${booking.source}` : "", booking.instagram ? `instagram: ${booking.instagram}` : "", booking.contact ? `contact: ${booking.contact}` : ""].filter(Boolean).join("\n");
        const created = await db.insertStudent({
          name: booking.name || "",
          first_name: "",
          last_name: "",
          phone: booking.phone || null,
          telegram: booking.telegram || null,
          notes: notes || null,
        });
        resolvedStudent = created;
        resolvedStudentId = created?.id;
        createdInThisFlow = true;
        if (!resolvedStudentId) throw new Error("Не вдалося створити профіль учениці");
        if (typeof setStudents === "function") setStudents((prev) => [...(prev || []), created]);
      }

      const alreadyLinked = (studentGrps || []).some((sg) => String(sg.studentId) === String(resolvedStudentId) && String(sg.groupId) === String(booking.groupId));
      if (!alreadyLinked) {
        let link = null;
        if (createdInThisFlow) {
          link = await db.addStudentGroup(resolvedStudentId, booking.groupId);
        } else {
          try {
            link = await db.restoreStudentToGroup(booking.groupId, resolvedStudentId);
          } catch (err) {
            const msg = String(err?.message || err || "").toLowerCase();
            if (msg.includes("no restore history")) {
              link = await db.addStudentGroup(resolvedStudentId, booking.groupId);
            } else {
              throw err;
            }
          }
        }

        if (typeof setStudentGrps === "function") {
          setStudentGrps((prev) => {
            const list = prev || [];
            if (list.some((sg) => String(sg.studentId) === String(resolvedStudentId) && String(sg.groupId) === String(booking.groupId))) return list;
            return [...list, link || { id: `sg_${uid()}`, studentId: resolvedStudentId, groupId: booking.groupId }];
          });
        }
      }

      const updatedBooking = await db.updateTrialBooking(booking.id, {
        status: "became_student",
        studentId: resolvedStudentId,
        convertedStudentId: resolvedStudentId,
      });
      if (typeof setTrialBookings === "function") {
        setTrialBookings((prev) => (prev || []).map((row) => (String(row.id) === String(booking.id) ? updatedBooking : row)));
      }
      if (trialPopoverState?.dateStr && String(trialPopoverState.dateStr) === String(booking.trialDate)) {
        const remaining = (confirmedTrialBookingsByDate[trialPopoverState.dateStr] || []).filter((row) => String(row.id) !== String(booking.id));
        if (!remaining.length) setTrialPopoverState(null);
      }
    } catch (e) {
      alert(`Не вдалося додати в групу: ${e?.message || e}`);
    } finally {
      setMarkingTrialId("");
    }
  };


  return (
    <div className="attendance-root" style={styles.wrap}>
      <style>{`
        .attendance-mobile-hint {
          display: none;
        }

        @media (max-width: 768px) {
          .attendance-root {
            gap: 12px !important;
          }

          .attendance-toolbar {
            align-items: stretch !important;
          }

          .attendance-toolbar-left {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            width: 100% !important;
          }

          .attendance-group-picker {
            min-width: 0 !important;
            width: 100% !important;
          }

          .attendance-group-picker button,
          .attendance-toolbar-left input,
          .attendance-toolbar-left select {
            min-height: 42px !important;
          }

          .attendance-group-panel {
            max-width: calc(100vw - 16px) !important;
          }

          .attendance-root .attendance-table th:first-child,
          .attendance-root .attendance-table td:first-child {
            width: 320px !important;
            min-width: 320px !important;
            max-width: 320px !important;
            padding: 4px 10px !important;
            font-size: 14px !important;
            vertical-align: middle !important;
            box-sizing: border-box !important;
          }

          .attendance-root .attendance-profile-card {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            min-height: 52px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            white-space: normal !important;
          }

          .attendance-root .attendance-student-name-row {
            width: 100% !important;
            min-width: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            box-sizing: border-box !important;
          }

          .attendance-root .attendance-student-name {
            min-width: 0 !important;
            flex: 1 1 auto !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .attendance-root .attendance-student-meta {
            width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            margin-top: 4px !important;
          }

          .attendance-root .attendance-student-menu-wrap {
            flex: 0 0 auto !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .attendance-root .attendance-guest-group-row {
            justify-content: flex-start !important;
          }

          .attendance-root .attendance-day-head,
          .attendance-root .attendance-day-cell {
            width: 60px !important;
            min-width: 60px !important;
            max-width: 60px !important;
          }

          .attendance-root .attendance-day-cell {
            height: 60px !important;
            min-height: 60px !important;
            max-height: 60px !important;
          }

          .attendance-root .attendance-cell-shell {
            width: 52px !important;
            height: 52px !important;
          }

          .attendance-root .attendance-cell-button {
            min-width: 48px !important;
            min-height: 48px !important;
            font-size: 20px !important;
          }

          .attendance-root .attendance-student-name {
            font-size: 18px !important;
            line-height: 1.2 !important;
          }

          .attendance-root .attendance-student-meta {
            font-size: 13px !important;
            line-height: 1.25 !important;
          }

          .attendance-mobile-hint {
            display: inline-flex;
            align-items: center;
            align-self: flex-start;
            gap: 6px;
            padding: 7px 10px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.1);
            color: ${theme.textMuted};
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
          }

          .attendance-day-cancel {
            width: 44px !important;
            height: 44px !important;
            line-height: 42px !important;
            font-size: 18px !important;
          }

          .attendance-menu-btn {
            width: 48px !important;
            height: 48px !important;
            line-height: 46px !important;
            font-size: 20px !important;
          }

          .attendance-add-mode-btn,
          .attendance-add-action {
            min-height: 38px !important;
            height: 38px !important;
            padding: 0 12px !important;
          }

          .attendance-add-controls,
          .attendance-add-controls form {
            flex-wrap: wrap !important;
          }

          .attendance-add-controls input,
          .attendance-add-controls select {
            min-height: 38px !important;
          }

          .attendance-menu-popup button,
          .attendance-menu-popup label {
            min-height: 38px !important;
          }
        }
      `}</style>
      <div className="attendance-toolbar" style={styles.toolbar}>
        <div className="attendance-toolbar-left" style={styles.toolbarLeft}>
          <div className="attendance-group-picker" style={styles.groupPickerWrap} ref={groupPickerRef}>
            <button type="button" style={styles.groupPickerBtn(groupPickerOpen)} onClick={() => setGroupPickerOpen((v) => !v)}>
              <span>{currentGroup?.name || "Вибери групу"}</span>
              <span style={{ color: theme.textMuted }}>{groupPickerOpen ? "▲" : "▼"}</span>
            </button>
          </div>

          <input
            type="month"
            value={centerMonth}
            onChange={(e) => setCenterMonth(e.target.value)}
            style={styles.control}
          />

          <select
            value={entryMode}
            onChange={(e) => setEntryMode(e.target.value)}
            style={styles.control}
          >
            <option value="auto">Авто</option>
            <option value="subscription">Абонемент</option>
            <option value="single">Разове</option>
            <option value="trial">Пробне</option>
            <option value="debt">Борг</option>
          </select>

          {isAdmin && (
            <button
              type="button"
              style={{ ...styles.control, cursor: "pointer", fontWeight: 700 }}
              onClick={openAttendanceHistory}
            >
              Історія змін
            </button>
          )}

        </div>

        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <span style={styles.dot("#2563eb")} />
            <span>Абонемент</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#f59e0b")} />
            <span>Разове</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#10b981")} />
            <span>Пробне</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#dc2626")} />
            <span>Борг</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#fee2e2")} />
            <span>Скасоване</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#eff6ff")} />
            <span>Період абонемента</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#f3f4f6")} />
            <span>Завершений абонемент</span>
          </div>
          <div style={styles.hint}>✓ = 1 заняття, 2 = 2 заняття за день</div>
        </div>
      </div>

            {groupPickerOpen && createPortal(
        <div className="attendance-group-panel" style={{ ...styles.groupPickerPanel, top: groupPickerPos.top, left: groupPickerPos.left, width: groupPickerPos.width }}>
          {groupedByDirection.map((section) => (
            <div key={section.directionId}>
              <div style={styles.groupSectionTitle}>{section.label}</div>
              {section.groups.map((g) => {
                const selected = String(g.id) === String(gid);
                return (
                  <button
                    key={g.id}
                    type="button"
                    style={styles.groupOption(selected)}
                    onClick={() => {
                      setGid(g.id);
                      setGroupPickerOpen(false);
                    }}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}

      {isAdmin && historyOpen && createPortal(
        <div style={styles.historyOverlay} onClick={() => setHistoryOpen(false)}>
          <div style={styles.historyPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.historyHeader}>
              <div>
                <h3 style={styles.historyTitle}>Історія змін відвідування</h3>
                <div style={styles.historySubtitle}>
                  {currentGroup?.name ? `Група: ${currentGroup.name}` : "Останні 100 записів"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={{ ...styles.control, height: 32, cursor: "pointer", fontSize: 12 }}
                  onClick={reloadActiveHistoryTab}
                  disabled={historyTab === "attendance" ? historyLoading : subscriptionHistoryLoading}
                >
                  Оновити
                </button>
                <button
                  type="button"
                  style={{ ...styles.control, height: 32, cursor: "pointer", fontSize: 12 }}
                  onClick={() => setHistoryOpen(false)}
                >
                  Закрити
                </button>
              </div>
            </div>

            <div style={styles.historyTabs} role="tablist" aria-label="Розділи історії змін">
              {[
                ["attendance", "Відмітки"],
                ["subscriptions", "Абонементи"],
              ].map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  role="tab"
                  aria-selected={historyTab === tabKey}
                  style={styles.historyTab(historyTab === tabKey)}
                  onClick={() => switchHistoryTab(tabKey)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={styles.historyBody}>
              {historyTab === "attendance" && (
                <>
                  {historyLoading && <div style={styles.emptyState}>Завантаження історії…</div>}
                  {!historyLoading && historyError && <div style={styles.emptyState}>{historyError}</div>}
                  {!historyLoading && !historyError && !historyRows.length && (
                    <div style={styles.emptyState}>Історія змін поки порожня.</div>
                  )}
                  {!historyLoading && !historyError && historyRows.map((row) => {
                    const entryLabel = getAuditEntryLabel(row.entryType || row.guestType) || "тип не вказано";
                    return (
                      <div key={row.id} style={styles.historyRow}>
                        <div style={styles.historyRowTop}>
                          <span>{formatAuditDateTime(row.createdAt)}</span>
                          <span style={styles.historyChip("quiet")}>{row.source || "unknown"}</span>
                        </div>
                        <div style={styles.historyActorRow}>
                          <span style={styles.historyChip(getAuditActorTone(row))}>{getAuditActorRoleLabel(row)}</span>
                          <span style={styles.historyActorName}>{getAuditActorName(row)}</span>
                        </div>
                        <div style={styles.historyFocusRow}>
                          <span style={styles.historyChip(getAuditActionTone(row))}>{getAuditActionLabel(row)}</span>
                          <span style={styles.historyArrow}>→</span>
                          <span style={styles.historyTarget}>{getAuditTargetLabel(row)}</span>
                        </div>
                        <div style={styles.historyMeta}>
                          <span style={styles.historyChip("neutral")}>Група: {row.groupName || row.groupId || "не вказана"}</span>
                          <span style={styles.historyChip("neutral")}>Тренування: {fmtUaShortDate(row.attendanceDate)}</span>
                          <span style={styles.historyChip("neutral")}>Тип: {entryLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {historyTab === "subscriptions" && (
                <>
                  {subscriptionHistoryLoading && <div style={styles.emptyState}>Завантаження історії абонементів…</div>}
                  {!subscriptionHistoryLoading && subscriptionHistoryError && <div style={styles.emptyState}>{subscriptionHistoryError}</div>}
                  {!subscriptionHistoryLoading && !subscriptionHistoryError && !subscriptionHistoryRows.length && (
                    <div style={styles.emptyState}>Історія абонементів поки порожня.</div>
                  )}
                  {!subscriptionHistoryLoading && !subscriptionHistoryError && subscriptionHistoryRows.map((row) => {
                    const summary = formatSubscriptionChangeSummary(row);
                    const dateRange = [row.activationDate || row.startDate, row.endDate]
                      .filter(Boolean)
                      .map(fmtUaShortDate)
                      .join("–");
                    return (
                      <div key={row.id} style={styles.historyRow}>
                        <div style={styles.historyRowTop}>
                          <span>{formatAuditDateTime(row.createdAt)}</span>
                          <span style={styles.historyChip("quiet")}>{row.source || "unknown"}</span>
                        </div>
                        <div style={styles.historyActorRow}>
                          <span style={styles.historyChip(getAuditActorTone(row))}>{getAuditActorRoleLabel(row)}</span>
                          <span style={styles.historyActorName}>{getAuditActorName(row)}</span>
                        </div>
                        <div style={styles.historyFocusRow}>
                          <span style={styles.historyChip(getSubscriptionActionTone(row))}>{formatSubscriptionActionLabel(row)}</span>
                          <span style={styles.historyArrow}>→</span>
                          <span style={styles.historyTarget}>{getSubscriptionTargetLabel(row)}</span>
                        </div>
                        {summary && (
                          <div style={styles.historyMeta}>
                            <span style={styles.historyChip("quiet")}>{summary}</span>
                          </div>
                        )}
                        <div style={styles.historyMeta}>
                          <span style={styles.historyChip("neutral")}>Група: {row.groupName || row.groupId || "не вказана"}</span>
                          <span style={styles.historyChip("neutral")}>Тип: {getSubscriptionTypeLabel(row.subscriptionType)}</span>
                          {(row.usedTrainings !== null || row.totalTrainings !== null) && (
                            <span style={styles.historyChip("neutral")}>Заняття: {row.usedTrainings ?? "—"} / {row.totalTrainings ?? "—"}</span>
                          )}
                          {row.amount !== null && <span style={styles.historyChip("neutral")}>Сума: {formatMoneyValue(row.amount)}</span>}
                          {row.paid !== null && <span style={styles.historyChip(row.paid ? "added" : "removed")}>{formatPaidValue(row.paid)}</span>}
                          {row.payMethod && <span style={styles.historyChip("neutral")}>Метод: {row.payMethod}</span>}
                          {dateRange && <span style={styles.historyChip("neutral")}>Дати: {dateRange}</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="attendance-mobile-hint" aria-hidden="true">Гортай вправо →</div>

      <div style={styles.tableWrap}>
        <table className="attendance-table" style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.thSticky, ...styles.headTop, ...styles.studentHead }}>
                Учениці
              </th>
              {monthSpans.map((m) => (
                <th
                  key={m.month}
                  colSpan={m.span}
                  style={{ ...styles.headTop, ...styles.monthHead(m.month === centerMonth) }}
                >
                  {m.label}
                </th>
              ))}
            </tr>

            <tr>
              <th style={{ ...styles.thSticky, ...styles.headTop, ...styles.studentHead }}>
                {currentGroup.name}
              </th>
              {visibleDays.map((dateStr) => {
                const cancelledDay = isCancelledDate(dateStr);
                const dow = getDayOfWeek(dateStr);
                const isBusy = busyCancelDate === dateStr;
                const monthKey = dateStr.slice(0, 7);
                const isCurrentMonth = monthKey === centerMonth;
                const isMutedMonth = monthKey !== centerMonth;
                const dayIdx = visibleDayIndex[dateStr];
                const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                const dayBookings = confirmedTrialBookingsByDate[dateStr] || [];
                const headStyle = {
                  ...styles.headTop,
                  ...styles.dayHead(cancelledDay, isMutedMonth, isCurrentMonth),
                  ...(isMonthBoundary ? styles.monthDivider : {}),
                };

                return (
                  <th
                    key={dateStr}
                    className="attendance-day-head"
                    style={headStyle}
                  >
                    <div style={styles.dayNum(isCurrentMonth, isMutedMonth)}>{dateStr.slice(8, 10)}</div>
                    <div style={styles.dayName(isCurrentMonth, isMutedMonth)}>{WEEKDAYS_SHORT[dow]}</div>
                    <button
                      type="button"
                      className="attendance-day-cancel"
                      disabled={isBusy}
                      onClick={() => handleToggleCancelled(dateStr)}
                      style={styles.cancelBtn(cancelledDay)}
                      title={cancelledDay ? "Відновити тренування" : "Скасувати тренування"}
                    >
                      {cancelledDay ? "↺" : "×"}
                    </button>
                    {dayBookings.length > 0 && (
                      <button
                        type="button"
                        title={`${dayBookings.length} ${dayBookings.length === 1 ? "підтверджене пробне" : (dayBookings.length < 5 ? "підтверджені пробні" : "підтверджених пробних")}`}
                        aria-label={`${dayBookings.length} ${dayBookings.length === 1 ? "підтверджене пробне" : (dayBookings.length < 5 ? "підтверджені пробні" : "підтверджених пробних")}`}
                        style={{
                          marginTop: 4,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          color: "#065f46",
                          background: "rgba(16,185,129,.16)",
                          borderRadius: 999,
                          minWidth: 22,
                          minHeight: 22,
                          padding: "0 6px",
                          border: "1px solid rgba(16,185,129,.35)",
                          boxShadow: "0 0 0 1px rgba(16,185,129,.08) inset",
                          lineHeight: 1,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isMobile = window.innerWidth < 700;
                          const popoverWidth = Math.min(300, Math.max(240, window.innerWidth - 24));
                          const left = isMobile ? 12 : Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 12));
                          const top = isMobile ? null : Math.min(rect.bottom + 8, window.innerHeight - 20);
                          setTrialPopoverState({ dateStr, left, top, width: popoverWidth, mobile: isMobile });
                        }}
                      >
                        {dayBookings.length}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((student, rowIndex) => {
              if (student.isGuestGroup) {
                return (
                  <tr key={student.id}>
                    <td className="attendance-row-head" style={styles.rowHead}>
                      <div className="attendance-profile-card" style={{ ...styles.profileCard, ...styles.guestGroupCard }}>
                        <button
                          type="button"
                          className="attendance-student-name-row attendance-guest-group-row"
                          onClick={() => setGuestGroupExpandedByGroup((prev) => ({ ...(prev || {}), [String(gid)]: !guestGroupExpanded }))}
                          style={styles.guestGroupBtn}
                        >
                          <span style={styles.guestGroupArrow(guestGroupExpanded)}>▸</span>
                          <span className="attendance-student-name" style={styles.studentName}>{`Гості (${student.guestCount})`}</span>
                        </button>
                        <div className="attendance-student-meta" style={styles.studentMeta}>Тимчасові гості</div>
                      </div>
                    </td>
                    {visibleDays.map((dateStr) => {
                      const dayIdx = visibleDayIndex[dateStr];
                      const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                      const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                      const isLastDay = dayIdx === visibleDays.length - 1;
                      const cellStyle = {
                        ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      };
                      if (isLastDay) {
                        cellStyle.borderTopRightRadius = 15;
                        cellStyle.borderBottomRightRadius = 15;
                      }
                      return <td key={dateStr} className="attendance-day-cell" style={cellStyle} />;
                    })}
                  </tr>
                );
              }
              if (student.isGuest) {
                return (
                  <tr key={student.id}>
                    <td className="attendance-row-head" style={{ ...styles.rowHead, ...(student.isGuestChild ? styles.guestChildRowHead : {}) }}>
                      <div className="attendance-profile-card" style={{ ...styles.profileCard, ...(student.isGuestChild ? styles.guestChildCard : {}) }}>
                        <div className="attendance-student-name-row" style={styles.studentNameRow}>
                          <div className="attendance-student-name" style={styles.studentName}>{`${rowIndex + 1}. ${student.anonymous ? "Гість" : student.guestName}`}</div>
                          <div className="attendance-student-menu-wrap" style={styles.menuWrap}>
                            <button type="button" className="attendance-menu-btn" style={styles.menuBtn} title="Дії" data-attn-menu-btn="1" onClick={(e) => { e.stopPropagation(); openStudentMenu(student, e.currentTarget); }}>⋮</button>
                          </div>
                        </div>
                        <div className="attendance-student-meta" style={styles.studentMeta}>Тимчасовий гість (trial/single)</div>
                      </div>
                    </td>
                    {visibleDays.map((dateStr) => {
                      const futureDay = isFutureAttendanceDate(dateStr);
                      const dayIdx = visibleDayIndex[dateStr];
                      const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                      const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                      const isLastDay = dayIdx === visibleDays.length - 1;
                      const rec = attn.find((a) =>
                        String(a.groupId) === String(gid) &&
                        !a.studentId &&
                        normalizeName(a.guestName) === normalizeName(student.guestName) &&
                        toDateKey(a.date) === toDateKey(dateStr)
                      );
                      const saving = busyCell === `guest_${student?.id || normalizeName(student.guestName)}_${dateStr}`;
                      const t = String(rec?.entryType || rec?.guestType || "subscription").toLowerCase();
                      const mark = rec ? ((rec.quantity || 1) >= 2 ? "2" : "✓") : "";
                      const cellView = !rec
                        ? { bg: theme.bg === "#0F131A" ? "#182230" : theme.card, mark: "" }
                        : t === "debt"
                          ? { bg: theme.bg === "#0F131A" ? "#7f1d1d" : "#dc2626", mark: "!" }
                          : t === "single"
                            ? { bg: theme.bg === "#0F131A" ? "#7a4313" : "#f59e0b", mark }
                            : t === "trial"
                              ? { bg: theme.bg === "#0F131A" ? "#0f5a43" : "#10b981", mark }
                              : { bg: theme.bg === "#0F131A" ? "#1f3e79" : "#2563eb", mark };
                      return (
                        <td key={dateStr} className="attendance-day-cell" style={{ ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth), ...(isMonthBoundary ? styles.monthDivider : {}), ...(isLastDay ? { borderTopRightRadius: 15, borderBottomRightRadius: 15 } : {}) }}>
                          <div className="attendance-cell-shell" style={styles.cellShell}><button type="button" className="attendance-cell-button" disabled={isCancelledDate(dateStr) || saving} onClick={() => handleToggleGuestCell(student, dateStr)} style={styles.cellBtn(cellView.bg, isCancelledDate(dateStr) || futureDay, saving)} title={futureDay ? FUTURE_ATTENDANCE_MESSAGE : dateStr}>{cellView.mark}</button></div>
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              const statusInfo = getStudentStatusText(subsForAttendanceSemantics, student.id, gid);
              const hasPack = rawSubs.some((s) => String(s.groupId) === String(gid) && String(s.studentId) === String(student.id) && isPackSubscription(s));
              const oneOffHistory = rawSubs.some((s) => String(s.groupId) === String(gid) && String(s.studentId) === String(student.id) && ["trial", "single"].includes(String(s.planType || "").toLowerCase()))
                || attn.some((a) => String(a.groupId) === String(gid) && String(a.studentId) === String(student.id) && ["trial", "single"].includes(String(a.entryType || a.guestType || "").toLowerCase()));
              const hasNonOneOff = rawSubs.some((s) => String(s.groupId) === String(gid) && String(s.studentId) === String(student.id) && !["trial", "single"].includes(String(s.planType || "").toLowerCase()));
              const isOnlyOneOffNoPack = !hasPack && oneOffHistory && !hasNonOneOff;
              const warnedDone = isWarned(student.id);
              const isDark = theme.bg === "#0F131A";
              const metaColor = statusInfo.tone === "danger"
                ? (isDark
                    ? (warnedDone ? "#c7767f" : "#ff7b86")
                    : (warnedDone ? "#b06a6a" : "#c81e1e"))
                : statusInfo.tone === "warning"
                  ? (isDark ? (warnedDone ? "#c98a3a" : "#ffb24c") : "#d97706")
                  : styles.studentMeta.color;
              const rowHighlightStyle = statusInfo.tone === "danger"
                ? (isDark
                    ? (warnedDone
                        ? { background: "#3a171b", borderLeft: "3px solid #b24a54", boxShadow: "inset 0 1px 0 rgba(178,74,84,0.35)" }
                        : { background: "#5a161d", borderLeft: "3px solid #ef4444", boxShadow: "inset 0 1px 0 rgba(248,113,113,0.35)" })
                    : (warnedDone
                        ? { background: "#f7eeee", borderLeft: "3px solid #caa5a5" }
                        : { background: "#ffe2e2", borderLeft: "3px solid #dc2626", boxShadow: "inset 0 1px 0 #fecaca" }))
                : statusInfo.tone === "warning"
                  ? (isDark
                      ? (warnedDone
                          ? { background: "#3f2711", borderLeft: "3px solid #c27a1f", boxShadow: "inset 0 1px 0 rgba(194,122,31,0.35)" }
                          : { background: "#5a2f08", borderLeft: "3px solid #f59e0b", boxShadow: "inset 0 1px 0 rgba(251,191,36,0.35)" })
                      : { background: "#fff7ed", borderLeft: "3px solid #f59e0b" })
                  : (isOnlyOneOffNoPack ? (isDark ? { background: "#2b1f4a", borderLeft: "3px solid #a855f7" } : { background: "#f3e8ff", borderLeft: "3px solid #9333ea" }) : {});

              return (
              <tr key={student.id}>
                <td className="attendance-row-head" style={{ ...styles.rowHead, ...rowHighlightStyle }}>
                  <div className="attendance-profile-card" style={styles.profileCard}>
                    <div className="attendance-student-name-row" style={styles.studentNameRow}>
                      <div className="attendance-student-name" style={styles.studentName}>{`${rowIndex + 1}. ${getDisplayName(student)}`}</div>
                      <div style={styles.orderBtns}>
                        <div className="attendance-student-menu-wrap" style={styles.menuWrap}>
                        <button
                          type="button"
                          className="attendance-menu-btn"
                          style={styles.menuBtn}
                          title="Дії"
                          data-attn-menu-btn="1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuState?.studentId === student.id) {
                              setOpenMenuState(null);
                              return;
                            }
                            openStudentMenu(student, e.currentTarget);
                          }}
                        >
                          ⋮
                        </button>
                        </div>
                      </div>
                    </div>
                    <div className="attendance-student-meta" style={{ ...styles.studentMeta, color: metaColor }}>
                      {statusInfo.text}
                    </div>
                  </div>
                </td>

                {visibleDays.map((dateStr) => {
                  const cancelledDay = isCancelledDate(dateStr);
                  const futureDay = isFutureAttendanceDate(dateStr);
                  const monthKey = dateStr.slice(0, 7);
                  const isCurrentMonth = monthKey === centerMonth;
                  const isMutedMonth = monthKey !== centerMonth;
                  const cellKey = `${student.id}_${dateStr}`;
                  const saving = busyCell === cellKey;
                  const cellView = getCellView(student, dateStr);
                  const subPeriod = getSubPeriodForCell(student.id, dateStr);
                  const dayIdx = visibleDayIndex[dateStr];
                  const prevDay = dayIdx > 0 ? visibleDays[dayIdx - 1] : null;
                  const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                  const isLastDay = dayIdx === visibleDays.length - 1;
                  const isStart = !!subPeriod && (!prevDay || prevDay < subPeriod.start);
                  const isEnd = !!subPeriod && (!nextDay || nextDay > subPeriod.end);
                  const isDark = theme.bg === "#0F131A";
                  const tone = subPeriod?.completed ? (isDark ? "#2b3647" : "#ecf1f5") : (isDark ? "#1d2f4e" : "#e0edff");
                  const border = subPeriod?.completed ? (isDark ? "#5f728d" : "#64748b") : (isDark ? "#3f6fc2" : "#2563eb");
                  const buttonBg = subPeriod?.completed && cellView.mark ? (isDark ? "#4b5b70" : "#9ca3af") : cellView.bg;
                  const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                  const cellStyle = subPeriod
                    ? {
                        ...styles.cell(cancelledDay, isMutedMonth, isCurrentMonth),
                        ...styles.subPeriodCell(tone, border, isStart, isEnd, cancelledDay),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      }
                    : {
                        ...styles.cell(cancelledDay, isMutedMonth, isCurrentMonth),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      };
                  if (isLastDay) {
                    cellStyle.borderTopRightRadius = 15;
                    cellStyle.borderBottomRightRadius = 15;
                  }

                  return (
                    <td key={dateStr} className="attendance-day-cell" style={cellStyle}>
                      <div className="attendance-cell-shell" style={styles.cellShell}>
                      <button
                        type="button"
                        className="attendance-cell-button"
                        disabled={cancelledDay || saving}
                        onClick={() => handleToggleCell(student, dateStr)}
                        style={styles.cellBtn(buttonBg, cancelledDay || futureDay, saving)}
                        title={cancelledDay ? "Тренування скасоване" : (futureDay ? FUTURE_ATTENDANCE_MESSAGE : dateStr)}
                      >
                        {cellView.mark}
                      </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            )})}

            {!displayRows.length && (
              <tr>
                <td className="attendance-row-head" style={styles.rowHead}>Немає учениць</td>
                <td colSpan={visibleDays.length} style={{ padding: 16, color: theme.textMuted }}>
                  У цій групі поки немає учениць.
                </td>
              </tr>
            )}

            <tr>
              <td className="attendance-row-head" style={styles.rowHead}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <button type="button" className="attendance-add-mode-btn" onClick={() => setAddMode("student")} style={{ ...styles.control, height: 28, fontSize: 12, padding: "0 8px", background: addMode === "student" ? theme.primary : theme.input, color: addMode === "student" ? "#fff" : theme.textMain }}>Учениця</button>
                  <button type="button" className="attendance-add-mode-btn" onClick={() => setAddMode("guest")} style={{ ...styles.control, height: 28, fontSize: 12, padding: "0 8px", background: addMode === "guest" ? theme.primary : theme.input, color: addMode === "guest" ? "#fff" : theme.textMain }}>Гість</button>
                  <button type="button" className="attendance-add-mode-btn" onClick={() => setAddMode("restore")} style={{ ...styles.control, height: 28, fontSize: 12, padding: "0 8px", background: addMode === "restore" ? theme.primary : theme.input, color: addMode === "restore" ? "#fff" : theme.textMain }} disabled={loadingRestoreCandidates || !restoreCandidates.length}>Відновити</button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>{addMode === "student" ? "Додати ученицю" : (addMode === "restore" ? "Відновити в групу" : "Додати гостя")}</div>
                <div className="attendance-add-controls" style={{ display: "flex", gap: 6, position: "relative", zIndex: 2 }}>
                  {addMode === "student" ? (
                    <div style={{ display: "grid", gap: 5, width: "100%" }}>
                      <div style={{ display: "flex", gap: 6, width: "100%" }}>
                        <input value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Ім'я учениці" style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }} />
                        <button type="button" className="attendance-add-action" style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }} onClick={handleCreateStudentInGroup} disabled={creatingStudent}>Додати</button>
                      </div>
                      {normalizeName(newStudentName).length >= 2 && (
                        <div style={{ display: "grid", gap: 5, padding: 7, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.input }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Схожі учениці в базі:</div>
                          {existingStudentMatches.length ? existingStudentMatches.map((match) => {
                            const contact = [match.student.phone, match.student.telegram].filter(Boolean).join(" · ");
                            return (
                              <div key={match.student.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 8px", borderRadius: 9, background: theme.card }}>
                                <div style={{ minWidth: 140 }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMain }}>{match.displayName}</div>
                                  {contact ? <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{contact}</div> : null}
                                </div>
                                {match.isLinkedToCurrentGroup ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Вже є в цій групі</span>
                                ) : match.canRestoreToCurrentGroup ? (
                                  <button type="button" className="attendance-add-action" style={{ ...styles.control, height: 28, fontSize: 11, padding: "0 8px" }} onClick={() => handleRestoreStudentToGroup(match.student.id)} disabled={restoringStudent}>Відновити</button>
                                ) : (
                                  <button type="button" className="attendance-add-action" style={{ ...styles.control, height: 28, fontSize: 11, padding: "0 8px" }} onClick={() => handleAddExistingStudentToGroup(match.student)} disabled={addingExistingStudentId === String(match.student.id)}>Додати в цю групу</button>
                                )}
                              </div>
                            );
                          }) : (
                            <div style={{ fontSize: 11, color: theme.textMuted }}>Схожих учениць не знайдено — можна створити нову.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : addMode === "restore" ? (
                    restoreCandidates.length ? (
                      <>
                        <select value={restoreStudentId} onChange={(e) => setRestoreStudentId(e.target.value)} style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }}>
                          <option value="">Вибери ученицю</option>
                          {restoreCandidates.map(({ student, hasHistory }) => (
                            <option key={student.id} value={student.id}>{`${getDisplayName(student)}${hasHistory ? " • була в цій групі" : ""}`}</option>
                          ))}
                        </select>
                        <button type="button" className="attendance-add-action" style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }} onClick={handleRestoreStudentToGroup} disabled={restoringStudent || !restoreStudentId}>Відновити</button>
                      </>
                    ) : (
                      <div style={{ ...styles.control, height: 30, display: "flex", alignItems: "center", flex: 1, minWidth: 0, fontSize: 12, color: theme.textMuted }}>{loadingRestoreCandidates ? "Завантажуємо..." : "Немає учениць для відновлення в цю групу."}</div>
                    )
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateGuestAttendance();
                      }}
                      style={{ display: "flex", gap: 6, width: "100%" }}
                    >
                      <input value={guestNameInput} onChange={(e) => setGuestNameInput(e.target.value)} placeholder="Ім'я гостя (необов'язково)" style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }} />
                      <select value={guestEntryType} onChange={(e) => setGuestEntryType(e.target.value)} style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 8px" }}>
                        <option value="trial">Пробне</option>
                        <option value="single">Разове</option>
                      </select>
                      <button
                        type="submit"
                        className="attendance-add-action"
                        style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }}
                        disabled={creatingGuest || !gid}
                      >
                        Додати
                      </button>
                    </form>
                  )}
                </div>
              </td>
              <td colSpan={visibleDays.length} style={{ ...styles.cell(false), background: theme.input }} />
            </tr>

            <tr style={styles.totalsRow}>
              <td className="attendance-row-head" style={{ ...styles.rowHead, ...styles.totalsHead, ...styles.totalsRow }}>Всього присутніх:</td>
              {visibleDays.map((dateStr) => (
                <td
                  key={`total_${dateStr}`}
                  className="attendance-day-cell"
                  style={{
                    ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth),
                    ...styles.totalsRow,
                    fontWeight: 700,
                    color: theme.textMain,
                  }}
                >
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                    <span>{totalsByDate[dateStr]?.total || 0}</span>
                    {!!totalsByDate[dateStr]?.removed && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted }}>
                        (+{totalsByDate[dateStr].removed} видал.)
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {trialPopoverState && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 2998, background: "transparent" }}
            onClick={() => setTrialPopoverState(null)}
          />
          <div
            style={trialPopoverState.mobile
              ? {
                  position: "fixed",
                  left: 12,
                  right: 12,
                  bottom: 12,
                  maxHeight: "60vh",
                  overflowY: "auto",
                  zIndex: 2999,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: theme.card,
                  padding: 10,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
                }
              : {
                  position: "fixed",
                  left: trialPopoverState.left,
                  top: trialPopoverState.top,
                  width: trialPopoverState.width,
                  minWidth: 240,
                  maxWidth: 300,
                  maxHeight: "60vh",
                  overflowY: "auto",
                  zIndex: 2999,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  background: theme.card,
                  padding: 10,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
                }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMain }}>{`Пробні · ${fmtUaShortDate(trialPopoverState.dateStr)}`}</div>
              <button type="button" onClick={() => setTrialPopoverState(null)} style={{ border: `1px solid ${theme.border}`, background: "transparent", borderRadius: 999, width: 22, height: 22, lineHeight: "20px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: theme.textMuted, padding: 0 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {(confirmedTrialBookingsByDate[trialPopoverState.dateStr] || []).map((booking) => {
                const contact = [booking.phone, booking.telegram, booking.instagram, booking.contact].filter(Boolean).join(" · ");
                return (
                  <div key={booking.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg, padding: 7 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMain }}>{booking.name || "Без імені"}</div>
                    {contact ? <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{contact}</div> : null}
                    {booking.note ? <div style={{ fontSize: 10, color: theme.textMain, marginTop: 2 }}>Нотатка: {booking.note}</div> : null}
                    <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 800, color: "#047857", background: "rgba(16,185,129,.14)", borderRadius: 999, padding: "2px 7px" }}>Підтвердила</span>
                    <button type="button" title="Додати пробну в групу" aria-label="Додати пробну в групу" onClick={() => handleAddTrialBookingToGroup(booking)} disabled={markingTrialId === String(booking.id)} style={{ marginTop: 6, border: `1px solid ${theme.border}`, borderRadius: 999, background: theme.card, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, minHeight: trialPopoverState.mobile ? 34 : undefined }}>
                      {markingTrialId === String(booking.id) ? "Додаємо..." : "+ В групу"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {openMenuState && createPortal(
        <div
          ref={menuPopupRef}
          className="attendance-menu-popup"
          style={{ ...styles.menu, top: openMenuState.top, left: openMenuState.left }}
        >
          {(() => {
            const student = displayRows.find((s) => s.id === openMenuState.studentId);
            if (!student) return null;
            if (student.isGuest) {
              return (
                <>
                  <div style={styles.menuSection}>
                    <button type="button" style={styles.menuItem} onClick={() => handleConvertGuestToStudent(student)}>Перетворити на ученицю</button>
                  </div>
                  <div style={styles.menuSection}>
                    <button type="button" style={{ ...styles.menuItem, ...styles.menuDanger }} onClick={() => handleRemoveGuestRosterRow(student)}>Прибрати тимчасового гостя</button>
                  </div>
                </>
              );
            }
            return (
              <>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => moveStudent(student.id, "up")}>Перемістити вгору</button>
                  <button type="button" style={styles.menuItem} onClick={() => moveStudent(student.id, "down")}>Перемістити вниз</button>
                </div>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => handleAddSub(student)}>Додати абонемент</button>
                  <button type="button" style={styles.menuItem} onClick={() => handleEditSub(student)}>Змінити абонемент</button>
                  <button type="button" style={styles.menuItem} onClick={() => handleEditStudent(student)}>Редагувати ученицю</button>
                </div>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => handleMessageStudent(student)}>Написати повідомлення</button>
                </div>
                <div style={styles.menuSection}>
                  <label style={styles.notifyRow}>
                    <input
                      type="checkbox"
                      style={styles.notifyCheck}
                      checked={isWarned(student.id)}
                      onChange={(e) => toggleWarned(student.id, e.target.checked)}
                    />
                    <span>Сповіщено про завершення</span>
                  </label>
                </div>
                <div style={styles.menuDivider} />
                <div style={styles.menuSection}>
                  <button type="button" style={{ ...styles.menuItem, ...styles.menuDanger }} onClick={() => { handleRemoveFromGroup(student); setOpenMenuState(null); }}>Прибрати з групи</button>
                </div>
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
