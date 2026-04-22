import React, { useEffect, useMemo, useRef, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";

const shellCard = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
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
    <div style={{ display: "grid", gridTemplateColumns: "180px 360px 1fr", gap: 16 }}>
      <div style={{ ...shellCard, padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: theme.textMain }}>Фільтри</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" onClick={() => setRailFilter("all")} style={{ textAlign: "left", border: `1px solid ${railFilter === "all" ? theme.primary : theme.border}`, borderRadius: 10, padding: "8px 10px", background: railFilter === "all" ? "#eef2ff" : "#fff", cursor: "pointer", fontWeight: 600 }}>
            Усі чати
          </button>
          <button type="button" onClick={() => setRailFilter("trainers")} style={{ textAlign: "left", border: `1px solid ${railFilter === "trainers" ? theme.primary : theme.border}`, borderRadius: 10, padding: "8px 10px", background: railFilter === "trainers" ? "#eef2ff" : "#fff", cursor: "pointer", fontWeight: 600 }}>
            Тренери
          </button>
          {groups.map((g) => {
            const key = `group:${g.id}`;
            return (
              <button key={g.id} type="button" onClick={() => setRailFilter(key)} style={{ textAlign: "left", border: `1px solid ${railFilter === key ? theme.primary : theme.border}`, borderRadius: 10, padding: "8px 10px", background: railFilter === key ? "#eef2ff" : "#fff", cursor: "pointer", fontSize: 13 }}>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: theme.textMain }}>Повідомлення / Чати</div>
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 640, overflow: "auto" }}>
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
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${active ? theme.primary : theme.border}`,
                  background: active ? "#eef2ff" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: theme.textMain, fontSize: 14, fontWeight: 700 }}>{dlg.title}</div>
                  <div style={{ color: theme.textLight, fontSize: 12 }}>{dlg.lastMessageDate?.slice(0, 10) || "—"}</div>
                </div>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {dlg.lastMessageText || dlg.username || "Порожній діалог"}
                </div>
              </button>
            );
          })}
          {!enrichedDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів.</div>}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>
          {activeDialog ? `Чат: ${activeDialog.title}` : "Оберіть діалог"}
        </div>

        {activeDialog && (
          <>
            <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
              {activeDialog.username || `chat_id: ${activeDialog.id}`}
            </div>

            <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
              <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>CRM block</div>
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
                style={{ width: "100%", borderRadius: 10, border: `1px solid ${theme.border}`, padding: "8px 10px", marginBottom: 8 }}
              >
                <option value="">Не прив'язано до учениці</option>
                {students.map((st) => <option key={st.id} value={st.id}>{getDisplayName(st)}</option>)}
              </select>

              {activeDialog.linkedStudent && (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>
                  Групи: {normalizeStudentGroupIds(activeDialog.linkedStudent, membershipByStudent[activeDialog.linkedStudent.id] || []).map((gid) => {
                    const g = groupMap[gid];
                    const d = g ? directionMap[g.directionId] : null;
                    return g ? `${g.name}${d ? ` (${d.name})` : ""}` : gid;
                  }).join(", ") || "—"}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.bg }}>
              <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6 }}>Внутрішня нотатка</div>
              <textarea
                value={metaByChat[activeDialog.id]?.internal_note || ""}
                onChange={(e) => {
                  const nextNote = e.target.value;
                  setMetaByChat((prev) => ({ ...prev, [activeDialog.id]: { ...(prev[activeDialog.id] || {}), internal_note: nextNote } }));
                  queueMetaSave(activeDialog.id, { internalNote: nextNote });
                }}
                onBlur={(e) => saveMeta(activeDialog.id, { internalNote: e.target.value })}
                rows={3}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
              <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6 }}>Персональний шаблон чату</div>
              <textarea
                value={metaByChat[activeDialog.id]?.custom_template || ""}
                onChange={(e) => setMetaByChat((prev) => ({ ...prev, [activeDialog.id]: { ...(prev[activeDialog.id] || {}), custom_template: e.target.value } }))}
                onBlur={(e) => saveMeta(activeDialog.id, { customTemplate: e.target.value })}
                rows={3}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, resize: "vertical" }}
              />
            </div>

            {activeDialog.trainer && (
              <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${theme.primary}`, borderRadius: 12, background: "#eef2ff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: theme.primary }}>Trainer template block</div>
                  <button type="button" onClick={() => setDraft((prev) => (prev ? `${prev}\n\n${trainerDraft}` : trainerDraft))} style={{ border: "none", borderRadius: 8, background: theme.primary, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}>
                    Вставити
                  </button>
                </div>
                <div style={{ color: theme.textMain, fontSize: 13, whiteSpace: "pre-wrap" }}>{trainerDraft || "Не знайдено trainer_groups або немає учениць без активного абонемента."}</div>
              </div>
            )}

            <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 700, color: theme.textMain }}>Повідомлення</div>
            <textarea value={resolvedDraft} onChange={(e) => setDraft(e.target.value)} rows={6} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, resize: "vertical", fontSize: 13 }} />

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/send-test-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatId: activeDialog.id, message: resolvedDraft }),
                  });
                }}
                style={{ border: "none", borderRadius: 8, background: theme.primary, color: "#fff", padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}
              >
                Надіслати тест
              </button>
            </div>

            <div style={{ marginTop: 14, maxHeight: 220, overflow: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
              {(messagesByChat[activeDialog.id] || []).map((m) => (
                <div key={m.id} style={{ marginBottom: 8, textAlign: m.out ? "right" : "left" }}>
                  <div style={{ display: "inline-block", background: m.out ? "#e9f5ff" : theme.bg, borderRadius: 10, padding: "6px 10px", maxWidth: "85%" }}>
                    <div style={{ fontSize: 13, color: theme.textMain, whiteSpace: "pre-wrap" }}>{m.text || "—"}</div>
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
