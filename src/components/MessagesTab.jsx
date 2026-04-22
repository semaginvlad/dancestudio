import React, { useEffect, useMemo, useRef, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";

const shellCard = {
  background: "#ffffff",
  border: "1px solid #eceff3",
  borderRadius: 24,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const parseTrainerGroups = (note = "") => {
  const match = note.match(/trainer_groups\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return [];
  return match[1].split("|").map((s) => s.trim()).filter(Boolean);
};

const isTrainerChatByNote = (note = "") => {
  const lc = note.toLowerCase();
  return lc.includes("trainer") || lc.includes("тренер") || /trainer_groups\s*:/i.test(note);
};

const normalizeStudentGroupIds = (student, membership) => {
  const inline = [student?.groupId, ...(Array.isArray(student?.groupIds) ? student.groupIds : [])].filter(Boolean);
  return Array.from(new Set([...(membership || []), ...inline]));
};

const parseIsoDateSafe = (value) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

export default function MessagesTab({
  students = [],
  groups = [],
  subs = [],
  attn = [],
  studentGrps = [],
  selectedStudentId = "",
  onSelectStudent,
}) {
  const [railFilter, setRailFilter] = useState("all");
  const [draft, setDraft] = useState("");

  const [dialogs, setDialogs] = useState([]);
  const [dialogsError, setDialogsError] = useState("");
  const [messagesByChat, setMessagesByChat] = useState({});
  const [metaByChat, setMetaByChat] = useState({});
  const metaSaveTimersRef = useRef({});

  const membershipByStudent = useMemo(
    () =>
      studentGrps.reduce((acc, row) => {
        if (!row?.studentId || !row?.groupId) return acc;
        if (!acc[row.studentId]) acc[row.studentId] = [];
        acc[row.studentId].push(row.groupId);
        return acc;
      }, {}),
    [studentGrps]
  );

  const subsByStudent = useMemo(
    () =>
      subs.reduce((acc, s) => {
        if (!s?.studentId) return acc;
        if (!acc[s.studentId]) acc[s.studentId] = [];
        acc[s.studentId].push(s);
        return acc;
      }, {}),
    [subs]
  );

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const directionMap = useMemo(() => Object.fromEntries(DIRECTIONS.map((d) => [d.id, d])), []);

  useEffect(() => {
    return () => {
      Object.values(metaSaveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      metaSaveTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDialogs = async () => {
      try {
        setDialogsError("");
        const res = await fetch("/api/telegram-list-dialogs");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.details || payload?.error || "Failed to load dialogs");
        const loadedDialogs = payload.dialogs || [];
        if (!cancelled) setDialogs(loadedDialogs);

        const metaRows = await Promise.all(
          loadedDialogs.map(async (dlg) => {
            try {
              const metaRes = await fetch(`/api/telegram-chat-meta?chatId=${encodeURIComponent(dlg.id)}`);
              const metaPayload = await metaRes.json();
              if (!metaRes.ok) return [dlg.id, null];
              return [dlg.id, metaPayload.meta || null];
            } catch {
              return [dlg.id, null];
            }
          })
        );
        if (!cancelled) {
          setMetaByChat((prev) => ({
            ...prev,
            ...Object.fromEntries(metaRows),
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setDialogs([]);
          setDialogsError(String(e?.message || e));
        }
      }
    };

    loadDialogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDialog = useMemo(() => {
    if (!dialogs.length) return null;
    return dialogs.find((d) => d.id === selectedStudentId) || dialogs[0];
  }, [dialogs, selectedStudentId]);

  useEffect(() => {
    const chatId = selectedDialog?.id;
    if (!chatId) return;

    if (!messagesByChat[chatId]) {
      fetch(`/api/telegram-chat-messages?chatId=${encodeURIComponent(chatId)}&limit=40`)
        .then((r) => r.json().then((p) => (r.ok ? p : Promise.reject(new Error(p?.details || p?.error || "Failed")))))
        .then((p) => setMessagesByChat((prev) => ({ ...prev, [chatId]: p.messages || [] })))
        .catch(() => setMessagesByChat((prev) => ({ ...prev, [chatId]: [] })));
    }

    fetch(`/api/telegram-chat-meta?chatId=${encodeURIComponent(chatId)}`)
      .then((r) => r.json().then((p) => (r.ok ? p : Promise.reject(new Error(p?.details || p?.error || "Failed")))))
      .then((p) => setMetaByChat((prev) => ({ ...prev, [chatId]: p.meta || null })))
      .catch(() => setMetaByChat((prev) => ({ ...prev, [chatId]: null })));
  }, [selectedDialog, messagesByChat]);

  const enrichedDialogs = useMemo(() => {
    return dialogs
      .map((dlg) => {
        const meta = metaByChat[dlg.id] || null;
        const linkedStudent = meta?.student_id ? studentMap[meta.student_id] : null;
        const hasStoredNote = !!meta && Object.prototype.hasOwnProperty.call(meta, "internal_note");
        const note = hasStoredNote ? (meta?.internal_note || "") : (linkedStudent?.notes || "");
        const trainer = isTrainerChatByNote(note);
        const linkedGroupIds = linkedStudent
          ? normalizeStudentGroupIds(linkedStudent, membershipByStudent[linkedStudent.id] || [])
          : [];

        const lastTs = parseIsoDateSafe(dlg.lastMessageDate);

        return {
          ...dlg,
          linkedStudent,
          linkedGroupIds,
          trainer,
          note,
          lastTs,
        };
      })
      .filter((d) => {
        if (railFilter === "all") return true;
        if (railFilter === "trainers") return d.trainer;
        if (railFilter.startsWith("group:")) {
          const gid = railFilter.replace("group:", "");
          return d.linkedGroupIds.includes(gid);
        }
        return true;
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [dialogs, membershipByStudent, metaByChat, railFilter, studentMap]);

  const activeDialog = enrichedDialogs.find((d) => d.id === selectedDialog?.id) || enrichedDialogs[0] || null;

  const trainerDraft = useMemo(() => {
    if (!activeDialog?.trainer) return "";

    const trainerGroups = parseTrainerGroups(activeDialog.note || "");
    const parsedGroups = groups.filter((g) => trainerGroups.map((x) => x.toLowerCase()).includes((g.name || "").toLowerCase()));
    if (!parsedGroups.length) return "";

    const parts = parsedGroups
      .map((g) => {
        const members = students.filter((st) => normalizeStudentGroupIds(st, membershipByStudent[st.id] || []).includes(g.id));
        const bad = members.filter((m) => {
          const forGroup = (subsByStudent[m.id] || []).filter((s) => s.groupId === g.id);
          if (!forGroup.length) return true;
          return !forGroup.some((s) => getSubStatus(s) !== "expired");
        });
        if (!bad.length) return null;
        return `Привіт. Немає абонементів в групі ${g.name} у: ${bad.map((m) => getDisplayName(m)).join(", ")}.`;
      })
      .filter(Boolean);

    return parts.join("\n\n");
  }, [activeDialog, groups, membershipByStudent, students, subsByStudent]);

  const templateText =
    activeDialog?.linkedStudent?.messageTemplate ||
    activeDialog?.linkedStudent?.message_template ||
    metaByChat[activeDialog?.id || ""]?.custom_template ||
    "";
  const resolvedDraft = draft || trainerDraft || templateText || "";

  const saveMeta = async (chatId, patch) => {
    if (!chatId) return;
    const current = metaByChat[chatId] || {};
    const body = {
      chatId,
      studentId: patch.studentId ?? current.student_id ?? null,
      internalNote: patch.internalNote ?? current.internal_note ?? null,
      customTemplate: patch.customTemplate ?? current.custom_template ?? null,
    };

    const res = await fetch("/api/telegram-chat-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (res.ok) setMetaByChat((prev) => ({ ...prev, [chatId]: payload.meta }));
  };

  const queueMetaSave = (chatId, patch) => {
    if (!chatId) return;
    if (metaSaveTimersRef.current[chatId]) {
      clearTimeout(metaSaveTimersRef.current[chatId]);
    }
    metaSaveTimersRef.current[chatId] = setTimeout(() => {
      saveMeta(chatId, patch);
      delete metaSaveTimersRef.current[chatId];
    }, 500);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 340px minmax(620px,1fr)",
        gap: 18,
        alignItems: "stretch",
        background: "linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%)",
        borderRadius: 30,
        padding: 12,
      }}
    >
      <div style={{ ...shellCard, padding: 12, background: "#fcfdff", borderColor: "#e7ebf2" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10, color: "#6b7280" }}>Фільтри</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={() => setRailFilter("all")} style={{ textAlign: "left", border: `1px solid ${railFilter === "all" ? "#ff6f61" : "#e4e8ef"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "all" ? "#fff3f1" : "#fff", cursor: "pointer", fontWeight: 700, color: railFilter === "all" ? "#111827" : "#374151", boxShadow: railFilter === "all" ? "inset 0 0 0 1px #ffd3cc" : "none" }}>
            Усі чати
          </button>
          <button type="button" onClick={() => setRailFilter("trainers")} style={{ textAlign: "left", border: `1px solid ${railFilter === "trainers" ? "#7fb0ff" : "#e4e8ef"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "trainers" ? "#eef5ff" : "#fff", cursor: "pointer", fontWeight: 700, color: railFilter === "trainers" ? "#111827" : "#374151", boxShadow: railFilter === "trainers" ? "inset 0 0 0 1px #cfe2ff" : "none" }}>
            Тренери
          </button>
          {groups.map((g) => {
            const key = `group:${g.id}`;
            return (
              <button key={g.id} type="button" onClick={() => setRailFilter(key)} style={{ textAlign: "left", border: `1px solid ${railFilter === key ? "#7fb0ff" : "#e4e8ef"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === key ? "#f2f7ff" : "#fff", cursor: "pointer", fontSize: 12, color: "#374151", fontWeight: railFilter === key ? 700 : 600 }}>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 14, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: "#111827", letterSpacing: "-0.01em" }}>Повідомлення / Чати</div>
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 700, overflow: "auto", paddingRight: 2 }}>
          {enrichedDialogs.map((dlg) => {
            const active = activeDialog?.id === dlg.id;
            return (
              <button
                key={dlg.id}
                type="button"
                onClick={() => {
                  onSelectStudent?.(dlg.id);
                  setDraft("");
                }}
                style={{
                  textAlign: "left",
                  padding: "12px 13px",
                  borderRadius: 16,
                  border: `1px solid ${active ? "#ffb7ac" : "#e9edf3"}`,
                  background: active ? "linear-gradient(180deg, #fff5f3 0%, #ffffff 100%)" : "#fff",
                  cursor: "pointer",
                  boxShadow: active ? "0 8px 20px rgba(255, 111, 97, 0.14)" : "0 4px 14px rgba(17, 24, 39, 0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: "#111827", fontSize: 14, fontWeight: 700 }}>{dlg.title}</div>
                  <div style={{ color: "#9aa3b2", fontSize: 11, fontWeight: 600 }}>{dlg.lastMessageDate?.slice(0, 10) || "—"}</div>
                </div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {dlg.lastMessageText || dlg.username || "Порожній діалог"}
                </div>
              </button>
            );
          })}
          {!enrichedDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів.</div>}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 18, display: "flex", flexDirection: "column", minHeight: 760 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.02em" }}>
          {activeDialog ? `Чат: ${activeDialog.title}` : "Оберіть діалог"}
        </div>

        {activeDialog && (
          <>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
              {activeDialog.username || `chat_id: ${activeDialog.id}`}
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #e8edf4", borderRadius: 16, background: "#fbfdff" }}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8, fontSize: 13, letterSpacing: "0.01em" }}>CRM block</div>
              <select
                value={metaByChat[activeDialog.id]?.student_id || ""}
                onChange={async (e) => {
                  const studentId = e.target.value || null;
                  await fetch("/api/link-student-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ studentId, chatId: activeDialog.id }),
                  });
                  await saveMeta(activeDialog.id, { studentId });
                }}
                style={{ width: "100%", borderRadius: 12, border: "1px solid #d9e2ef", padding: "9px 10px", marginBottom: 8, background: "#fff", color: "#111827" }}
              >
                <option value="">Не прив'язано до учениці</option>
                {students.map((st) => <option key={st.id} value={st.id}>{getDisplayName(st)}</option>)}
              </select>

              {activeDialog.linkedStudent && (
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Групи: {normalizeStudentGroupIds(activeDialog.linkedStudent, membershipByStudent[activeDialog.linkedStudent.id] || []).map((gid) => {
                    const g = groupMap[gid];
                    const d = g ? directionMap[g.directionId] : null;
                    return g ? `${g.name}${d ? ` (${d.name})` : ""}` : gid;
                  }).join(", ") || "—"}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #e6edf8", borderRadius: 16, background: "#f6f9ff" }}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6, fontSize: 13 }}>Внутрішня нотатка</div>
              <textarea
                value={metaByChat[activeDialog.id]?.internal_note || ""}
                onChange={(e) => {
                  const nextNote = e.target.value;
                  setMetaByChat((prev) => ({ ...prev, [activeDialog.id]: { ...(prev[activeDialog.id] || {}), internal_note: nextNote } }));
                  queueMetaSave(activeDialog.id, { internalNote: nextNote });
                }}
                onBlur={(e) => saveMeta(activeDialog.id, { internalNote: e.target.value })}
                rows={3}
                style={{ width: "100%", border: "1px solid #d7e0ec", borderRadius: 12, padding: 9, resize: "vertical", background: "#fff" }}
              />
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #e8edf4", borderRadius: 16, background: "#fff" }}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6, fontSize: 13 }}>Персональний шаблон чату</div>
              <textarea
                value={metaByChat[activeDialog.id]?.custom_template || ""}
                onChange={(e) => setMetaByChat((prev) => ({ ...prev, [activeDialog.id]: { ...(prev[activeDialog.id] || {}), custom_template: e.target.value } }))}
                onBlur={(e) => saveMeta(activeDialog.id, { customTemplate: e.target.value })}
                rows={2}
                style={{ width: "100%", border: "1px solid #d7e0ec", borderRadius: 12, padding: 9, resize: "vertical", background: "#fff" }}
              />
            </div>

            {activeDialog.trainer && (
              <div style={{ marginBottom: 10, padding: 10, border: "1px solid #bfd7ff", borderRadius: 14, background: "#f2f7ff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 12, letterSpacing: "0.02em" }}>Trainer template block</div>
                  <button type="button" onClick={() => setDraft((prev) => (prev ? `${prev}\n\n${trainerDraft}` : trainerDraft))} style={{ border: "none", borderRadius: 10, background: "#ff6f61", color: "#fff", padding: "5px 9px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
                    Вставити
                  </button>
                </div>
                <div style={{ color: "#1f2937", fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 96, overflow: "auto", lineHeight: 1.45 }}>
                  {trainerDraft || "Не знайдено trainer_groups або немає учениць без активного абонемента."}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: "0.01em" }}>Повідомлення</div>
            <textarea value={resolvedDraft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ width: "100%", border: "1px solid #d8e2f0", borderRadius: 14, padding: 12, resize: "vertical", fontSize: 13, background: "#fff", color: "#111827" }} />

            <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/send-test-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatId: activeDialog.id, message: resolvedDraft }),
                  });
                }}
                style={{ border: "none", borderRadius: 12, background: "#ff6f61", color: "#fff", padding: "9px 14px", cursor: "pointer", fontWeight: 700, boxShadow: "0 8px 18px rgba(255, 111, 97, 0.24)" }}
              >
                Надіслати тест
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 250, maxHeight: 330, overflow: "auto", borderTop: "1px solid #e7ebf2", paddingTop: 10, marginTop: 4 }}>
              {(messagesByChat[activeDialog.id] || []).map((m) => (
                <div key={m.id} style={{ marginBottom: 8, textAlign: m.out ? "right" : "left" }}>
                  <div style={{ display: "inline-block", background: m.out ? "#ebf4ff" : "#f7f9fc", borderRadius: 14, padding: "7px 11px", maxWidth: "84%", border: "1px solid #e4eaf3" }}>
                    <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.text || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
