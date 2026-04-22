import React, { useEffect, useMemo, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";

const shellCard = {
  background: "#171a20",
  border: "1px solid #2a2f38",
  borderRadius: 24,
  boxShadow: "0 16px 30px rgba(0, 0, 0, 0.35)",
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
  const [searchQ, setSearchQ] = useState("");
  const [draft, setDraft] = useState("");
  const [studentSearchQ, setStudentSearchQ] = useState("");
  const [studentLinkDraftId, setStudentLinkDraftId] = useState("");
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [customTemplateDraft, setCustomTemplateDraft] = useState("");

  const [dialogs, setDialogs] = useState([]);
  const [dialogsError, setDialogsError] = useState("");
  const [messagesByChat, setMessagesByChat] = useState({});
  const [metaByChat, setMetaByChat] = useState({});

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
      .filter((d) => {
        if (!searchQ.trim()) return true;
        const q = searchQ.trim().toLowerCase();
        const linkedName = d.linkedStudent ? getDisplayName(d.linkedStudent).toLowerCase() : "";
        return (
          (d.title || "").toLowerCase().includes(q) ||
          (d.username || "").toLowerCase().includes(q) ||
          linkedName.includes(q)
        );
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [dialogs, membershipByStudent, metaByChat, railFilter, searchQ, studentMap]);

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
    if (!chatId) return null;
    const body = { chatId };
    if (Object.prototype.hasOwnProperty.call(patch || {}, "studentId")) {
      body.studentId = patch.studentId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "internalNote")) {
      body.internalNote = patch.internalNote ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "customTemplate")) {
      body.customTemplate = patch.customTemplate ?? null;
    }

    const res = await fetch("/api/telegram-chat-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (res.ok) {
      setMetaByChat((prev) => ({ ...prev, [chatId]: payload.meta }));
      return payload.meta;
    }
    return null;
  };

  useEffect(() => {
    const chatId = activeDialog?.id;
    if (!chatId) return;
    const meta = metaByChat[chatId] || {};
    setStudentLinkDraftId(meta.student_id || "");
    setInternalNoteDraft(meta.internal_note || "");
    setCustomTemplateDraft(meta.custom_template || "");
    setStudentSearchQ("");
  }, [activeDialog?.id, metaByChat]);

  const matchedStudents = useMemo(() => {
    const q = studentSearchQ.trim().toLowerCase();
    if (!q) return students;
    return students.filter((st) => getDisplayName(st).toLowerCase().includes(q));
  }, [studentSearchQ, students]);

  const handleSaveLink = async () => {
    if (!activeDialog?.id) return;
    const saved = await saveMeta(activeDialog.id, { studentId: studentLinkDraftId || null });
    if (saved?.student_id) {
      const st = studentMap[saved.student_id];
      if (st) setStudentSearchQ(getDisplayName(st));
    }
  };

  const refreshMessages = async (chatId) => {
    if (!chatId) return;
    const res = await fetch(`/api/telegram-chat-messages?chatId=${encodeURIComponent(chatId)}&limit=40`);
    const payload = await res.json();
    if (res.ok) setMessagesByChat((prev) => ({ ...prev, [chatId]: payload.messages || [] }));
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 340px minmax(620px,1fr)",
        gap: 18,
        alignItems: "stretch",
        background: "radial-gradient(1200px 500px at 8% -10%, rgba(255, 106, 88, 0.22) 0%, rgba(255, 106, 88, 0) 42%), radial-gradient(900px 420px at 92% -20%, rgba(100, 149, 255, 0.2) 0%, rgba(100, 149, 255, 0) 45%), linear-gradient(180deg, #0f1217 0%, #0b0d12 100%)",
        borderRadius: 30,
        padding: 12,
        minHeight: 820,
      }}
    >
      <div style={{ ...shellCard, padding: 12, background: "#151920", borderColor: "#2a3039" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10, color: "#a1a9b8" }}>Фільтри</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={() => setRailFilter("all")} style={{ textAlign: "left", border: `1px solid ${railFilter === "all" ? "#ff6a58" : "#343a45"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "all" ? "linear-gradient(180deg, #ff6a58 0%, #ea4f3b 100%)" : "#191e26", cursor: "pointer", fontWeight: 700, color: railFilter === "all" ? "#fff" : "#d1d7e2", boxShadow: railFilter === "all" ? "0 10px 24px rgba(255, 94, 74, 0.35)" : "none" }}>
            Усі чати
          </button>
          <button type="button" onClick={() => setRailFilter("trainers")} style={{ textAlign: "left", border: `1px solid ${railFilter === "trainers" ? "#6da7ff" : "#343a45"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "trainers" ? "linear-gradient(180deg, #3d6cb6 0%, #2f5d9f 100%)" : "#191e26", cursor: "pointer", fontWeight: 700, color: "#d9e3f5", boxShadow: railFilter === "trainers" ? "0 10px 24px rgba(90, 141, 236, 0.28)" : "none" }}>
            Тренери
          </button>
          {groups.map((g) => {
            const key = `group:${g.id}`;
            return (
              <button key={g.id} type="button" onClick={() => setRailFilter(key)} style={{ textAlign: "left", border: `1px solid ${railFilter === key ? "#ff6a58" : "#343a45"}`, borderRadius: 14, padding: "10px 12px", background: railFilter === key ? "rgba(255, 106, 88, 0.16)" : "#191e26", cursor: "pointer", fontSize: 12, color: railFilter === key ? "#ffd9d3" : "#c1cad8", fontWeight: railFilter === key ? 700 : 600 }}>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 14, display: "flex", flexDirection: "column", background: "#171d26", minHeight: 790 }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: "#f8fafc", letterSpacing: "-0.01em" }}>Повідомлення / Чати</div>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Пошук: чат, @username, учениця"
          style={{ marginBottom: 10, border: "1px solid #3a4350", borderRadius: 12, padding: "9px 11px", background: "#0f141b", color: "#e8eef7", fontSize: 13 }}
        />
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
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
                  border: `1px solid ${active ? "#ff7a67" : "#2f3540"}`,
                  background: active ? "linear-gradient(180deg, rgba(255, 107, 88, 0.26) 0%, rgba(255, 107, 88, 0.1) 100%)" : "#1a2029",
                  cursor: "pointer",
                  boxShadow: active ? "0 10px 24px rgba(255, 94, 74, 0.28)" : "0 4px 14px rgba(0, 0, 0, 0.24)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: "#eef2f7", fontSize: 14, fontWeight: 700 }}>{dlg.title}</div>
                  <div style={{ color: "#8893a4", fontSize: 11, fontWeight: 600 }}>{dlg.lastMessageDate?.slice(0, 10) || "—"}</div>
                </div>
                <div style={{ color: "#a5aebc", fontSize: 12, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {dlg.lastMessageText || dlg.username || "Порожній діалог"}
                </div>
              </button>
            );
          })}
          {!enrichedDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів.</div>}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 18, display: "flex", flexDirection: "column", minHeight: 790, background: "#161c25", borderColor: "#303846" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", marginBottom: 4, letterSpacing: "-0.02em" }}>
          {activeDialog ? `Чат: ${activeDialog.title}` : "Оберіть діалог"}
        </div>

        {activeDialog && (
          <>
            <div style={{ color: "#9eabbf", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
              {activeDialog.username || `chat_id: ${activeDialog.id}`}
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #3a414d", borderRadius: 16, background: "#1b212b" }}>
              <div style={{ fontWeight: 800, color: "#f5f8fd", marginBottom: 8, fontSize: 13, letterSpacing: "0.01em" }}>CRM block</div>
              <input
                value={studentSearchQ}
                onChange={(e) => setStudentSearchQ(e.target.value)}
                placeholder="Пошук учениці..."
                style={{ width: "100%", borderRadius: 12, border: "1px solid #465062", padding: "9px 10px", marginBottom: 8, background: "#0f1319", color: "#e5ecf8" }}
              />
              <select
                value={studentLinkDraftId}
                onChange={(e) => {
                  setStudentLinkDraftId(e.target.value || "");
                }}
                style={{ width: "100%", borderRadius: 12, border: "1px solid #465062", padding: "9px 10px", marginBottom: 8, background: "#0f1319", color: "#e5ecf8" }}
              >
                <option value="">Не прив'язано до учениці</option>
                {matchedStudents.map((st) => <option key={st.id} value={st.id}>{getDisplayName(st)}</option>)}
              </select>
              <button
                type="button"
                onClick={handleSaveLink}
                style={{ border: "1px solid #ff6a58", borderRadius: 11, background: "rgba(255, 106, 88, 0.16)", color: "#ffd5ce", padding: "7px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12, marginBottom: 8 }}
              >
                Зберегти прив’язку
              </button>

              {activeDialog.linkedStudent && (
                <div style={{ color: "#a5b2c5", fontSize: 12 }}>
                  Групи: {normalizeStudentGroupIds(activeDialog.linkedStudent, membershipByStudent[activeDialog.linkedStudent.id] || []).map((gid) => {
                    const g = groupMap[gid];
                    const d = g ? directionMap[g.directionId] : null;
                    return g ? `${g.name}${d ? ` (${d.name})` : ""}` : gid;
                  }).join(", ") || "—"}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #374458", borderRadius: 16, background: "#182130" }}>
              <div style={{ fontWeight: 800, color: "#f5f8ff", marginBottom: 6, fontSize: 13 }}>Внутрішня нотатка</div>
              <textarea
                value={internalNoteDraft}
                onChange={(e) => setInternalNoteDraft(e.target.value)}
                rows={3}
                style={{ width: "100%", border: "1px solid #48566c", borderRadius: 12, padding: 9, resize: "vertical", background: "#0f141b", color: "#e8eef7" }}
              />
              <button
                type="button"
                onClick={async () => {
                  await saveMeta(activeDialog.id, { internalNote: internalNoteDraft });
                }}
                style={{ marginTop: 8, border: "1px solid #6da7ff", borderRadius: 11, background: "rgba(109, 167, 255, 0.14)", color: "#d4e6ff", padding: "7px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
              >
                Зберегти нотатку
              </button>
            </div>

            <div style={{ marginBottom: 10, padding: 12, border: "1px solid #3a414d", borderRadius: 16, background: "#1b212b" }}>
              <div style={{ fontWeight: 800, color: "#f5f8fd", marginBottom: 6, fontSize: 13 }}>Персональний шаблон чату</div>
              <textarea
                value={customTemplateDraft}
                onChange={(e) => setCustomTemplateDraft(e.target.value)}
                rows={2}
                style={{ width: "100%", border: "1px solid #48566c", borderRadius: 12, padding: 9, resize: "vertical", background: "#0f141b", color: "#e8eef7" }}
              />
              <button
                type="button"
                onClick={() => saveMeta(activeDialog.id, { customTemplate: customTemplateDraft })}
                style={{ marginTop: 8, border: "1px solid #6da7ff", borderRadius: 11, background: "rgba(109, 167, 255, 0.14)", color: "#d4e6ff", padding: "7px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
              >
                Зберегти шаблон
              </button>
            </div>

            {activeDialog.trainer && (
              <div style={{ marginBottom: 10, padding: 10, border: "1px solid #3d516e", borderRadius: 14, background: "#182536" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, color: "#9ec4ff", fontSize: 12, letterSpacing: "0.02em" }}>Trainer template block</div>
                  <button type="button" onClick={() => setDraft((prev) => (prev ? `${prev}\n\n${trainerDraft}` : trainerDraft))} style={{ border: "none", borderRadius: 10, background: "#ff5e4a", color: "#fff", padding: "5px 9px", cursor: "pointer", fontWeight: 700, fontSize: 11, boxShadow: "0 8px 16px rgba(255, 94, 74, 0.3)" }}>
                    Вставити
                  </button>
                </div>
                <div style={{ color: "#d6e0ee", fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 96, overflow: "auto", lineHeight: 1.45 }}>
                  {trainerDraft || "Не знайдено trainer_groups або немає учениць без активного абонемента."}
                </div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 280, maxHeight: 360, overflow: "auto", borderTop: "1px solid #323a45", paddingTop: 10, marginTop: 4, marginBottom: 12 }}>
              {(messagesByChat[activeDialog.id] || []).map((m) => (
                <div key={m.id} style={{ marginBottom: 8, textAlign: m.out ? "right" : "left" }}>
                  <div style={{ display: "inline-block", background: m.out ? "#2b3e57" : "#1f2732", borderRadius: 14, padding: "7px 11px", maxWidth: "84%", border: "1px solid #3a4759" }}>
                    <div style={{ fontSize: 13, color: "#e8eef7", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.text || "—"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "auto", borderTop: "1px solid #323a45", paddingTop: 10 }}>
              <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 800, color: "#f2f5fb", letterSpacing: "0.01em" }}>Повідомлення</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <textarea value={resolvedDraft} onChange={(e) => setDraft(e.target.value)} rows={4} style={{ width: "100%", border: "1px solid #495569", borderRadius: 14, padding: 12, resize: "vertical", fontSize: 13, background: "#0f141b", color: "#f1f5fb" }} />
                <button
                  type="button"
                  onClick={async () => {
                    const optimisticMsg = {
                      id: `local_${Date.now()}`,
                      text: resolvedDraft,
                      out: true,
                      date: new Date().toISOString(),
                    };
                    setMessagesByChat((prev) => ({
                      ...prev,
                      [activeDialog.id]: [...(prev[activeDialog.id] || []), optimisticMsg],
                    }));

                    await fetch("/api/send-test-telegram", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chatId: activeDialog.id, message: resolvedDraft }),
                    });
                    await refreshMessages(activeDialog.id);
                  }}
                  style={{ border: "none", borderRadius: 14, background: "linear-gradient(180deg, #ff6a58 0%, #e74734 100%)", color: "#fff", padding: "11px 18px", cursor: "pointer", fontWeight: 800, boxShadow: "0 12px 24px rgba(255, 89, 66, 0.38)", height: 44 }}
                >
                  Надіслати
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
