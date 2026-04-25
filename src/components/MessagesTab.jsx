import React, { useEffect, useMemo, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";
import { isTrainerChatByNote } from "../shared/trainerDigest";

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
  onOpenTrainerNotifications,
}) {
  const isDark = theme.bg === "#0F131A";
  const shellCard = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 24,
    boxShadow: isDark ? "0 16px 30px rgba(0, 0, 0, 0.35)" : "0 10px 26px rgba(31,55,99,0.12)",
  };
  const [railFilter, setRailFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [draft, setDraft] = useState("");
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [customTemplateDraft, setCustomTemplateDraft] = useState("");
  const [linkUiByChat, setLinkUiByChat] = useState({});
  const [linkSearchByChat, setLinkSearchByChat] = useState({});
  const [linkSavingChatId, setLinkSavingChatId] = useState("");

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
        const res = await fetch("/api/telegram?op=listDialogs");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.details || payload?.error || "Failed to load dialogs");
        const loadedDialogs = payload.dialogs || [];
        if (!cancelled) setDialogs(loadedDialogs);

        const metaRows = await Promise.all(
          loadedDialogs.map(async (dlg) => {
            try {
              const metaRes = await fetch(`/api/telegram?op=chatMeta&chatId=${encodeURIComponent(dlg.id)}`);
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
    if (selectedStudentId) {
      const directChatMatch = dialogs.find((d) => d.id === selectedStudentId);
      if (directChatMatch) return directChatMatch;

      const chatIdByStudent = Object.entries(metaByChat).find(([, meta]) => String(meta?.student_id || "") === String(selectedStudentId))?.[0];
      if (chatIdByStudent) {
        const matchedByStudent = dialogs.find((d) => d.id === chatIdByStudent);
        if (matchedByStudent) return matchedByStudent;
      }
    }
    return dialogs[0];
  }, [dialogs, metaByChat, selectedStudentId]);

  useEffect(() => {
    const chatId = selectedDialog?.id;
    if (!chatId) return;

    if (!messagesByChat[chatId]) {
      fetch(`/api/telegram?op=chatMessages&chatId=${encodeURIComponent(chatId)}&limit=40`)
        .then((r) => r.json().then((p) => (r.ok ? p : Promise.reject(new Error(p?.details || p?.error || "Failed")))))
        .then((p) => setMessagesByChat((prev) => ({ ...prev, [chatId]: p.messages || [] })))
        .catch(() => setMessagesByChat((prev) => ({ ...prev, [chatId]: [] })));
    }

    fetch(`/api/telegram?op=chatMeta&chatId=${encodeURIComponent(chatId)}`)
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

  const crmSummary = useMemo(() => {
    const st = activeDialog?.linkedStudent;
    if (!st) return null;

    const groupIds = normalizeStudentGroupIds(st, membershipByStudent[st.id] || []);
    const groupNames = groupIds.map((gid) => groupMap[gid]?.name || gid);
    const directionNames = Array.from(
      new Set(
        groupIds
          .map((gid) => {
            const g = groupMap[gid];
            const d = g ? directionMap[g.directionId] : null;
            return d?.name || null;
          })
          .filter(Boolean)
      )
    );

    const studentSubs = subsByStudent[st.id] || [];
    const sortedSubs = [...studentSubs].sort((a, b) => {
      const aKey = a.endDate || a.activationDate || a.startDate || a.created_at || "";
      const bKey = b.endDate || b.activationDate || b.startDate || b.created_at || "";
      return bKey.localeCompare(aKey);
    });
    const activeSub = sortedSubs.find((s) => {
      const status = getSubStatus(s);
      return status === "active" || status === "warning";
    }) || null;
    const summarySub = activeSub || sortedSubs[0] || null;
    const summarySubStatus = summarySub ? getSubStatus(summarySub) : null;
    const remainingTrainings = summarySub
      ? Math.max(0, Number(summarySub.totalTrainings || 0) - Number(summarySub.usedTrainings || 0))
      : null;
    const endDate = summarySub?.endDate || null;

    const subIds = new Set(studentSubs.map((s) => s.id).filter(Boolean));
    const lastAttendance = attn
      .filter((a) => String(a.studentId || "") === String(st.id) || (a.subId && subIds.has(a.subId)))
      .map((a) => a.date)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || null;

    return {
      studentName: getDisplayName(st),
      groupNames,
      directionNames,
      summarySubStatus,
      remainingTrainings,
      endDate,
      lastAttendance,
    };
  }, [activeDialog, attn, directionMap, groupMap, membershipByStudent, subsByStudent]);

  const orderedMessages = useMemo(() => {
    const list = [...(messagesByChat[activeDialog?.id] || [])];
    return list.sort((a, b) => {
      const at = new Date(a?.date || 0).getTime() || 0;
      const bt = new Date(b?.date || 0).getTime() || 0;
      if (at !== bt) return at - bt;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }, [activeDialog?.id, messagesByChat]);

  const templateText =
    activeDialog?.linkedStudent?.messageTemplate ||
    activeDialog?.linkedStudent?.message_template ||
    metaByChat[activeDialog?.id || ""]?.custom_template ||
    "";
  const resolvedDraft = draft || templateText || "";

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
    const res = await fetch("/api/telegram?op=chatMeta", {
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
    setInternalNoteDraft(meta.internal_note || "");
    setCustomTemplateDraft(meta.custom_template || "");
  }, [activeDialog?.id, metaByChat]);

  const openLinkPanel = (chatId, currentStudentId = "") => {
    setLinkUiByChat((prev) => ({
      ...prev,
      [chatId]: { open: true, draftId: currentStudentId || "" },
    }));
  };

  const handleSaveLink = async (chatId) => {
    if (!chatId) return;
    const draftId = linkUiByChat[chatId]?.draftId || null;
    setLinkSavingChatId(chatId);
    try {
      await saveMeta(chatId, { studentId: draftId });
    } finally {
      setLinkSavingChatId("");
    }
  };

  const handleClearLink = async (chatId) => {
    if (!chatId) return;
    setLinkSavingChatId(chatId);
    try {
      await saveMeta(chatId, { studentId: null });
      setLinkUiByChat((prev) => ({
        ...prev,
        [chatId]: { ...(prev[chatId] || {}), draftId: "" },
      }));
    } finally {
      setLinkSavingChatId("");
    }
  };

  const refreshMessages = async (chatId) => {
    if (!chatId) return;
    const res = await fetch(`/api/telegram?op=chatMessages&chatId=${encodeURIComponent(chatId)}&limit=40`);
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
        background: isDark
          ? "radial-gradient(1200px 500px at 8% -10%, rgba(255, 106, 88, 0.22) 0%, rgba(255, 106, 88, 0) 42%), radial-gradient(900px 420px at 92% -20%, rgba(100, 149, 255, 0.2) 0%, rgba(100, 149, 255, 0) 45%), linear-gradient(180deg, #0f1217 0%, #0b0d12 100%)"
          : `linear-gradient(180deg, ${theme.bg} 0%, ${theme.input} 100%)`,
        borderRadius: 30,
        padding: 12,
        height: "min(80vh, 860px)",
        minHeight: 620,
      }}
    >
      <div style={{ ...shellCard, padding: 12, background: theme.card, borderColor: theme.border }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10, color: theme.textMuted }}>Фільтри</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={() => setRailFilter("all")} style={{ textAlign: "left", border: `1px solid ${railFilter === "all" ? theme.primary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "all" ? theme.primary : theme.input, cursor: "pointer", fontWeight: 700, color: railFilter === "all" ? "#fff" : theme.textMain, boxShadow: railFilter === "all" ? "0 10px 24px rgba(255, 94, 74, 0.35)" : "none" }}>
            Усі чати
          </button>
          <button type="button" onClick={() => setRailFilter("trainers")} style={{ textAlign: "left", border: `1px solid ${railFilter === "trainers" ? theme.secondary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: railFilter === "trainers" ? theme.secondary : theme.input, cursor: "pointer", fontWeight: 700, color: "#fff", boxShadow: railFilter === "trainers" ? "0 10px 24px rgba(90, 141, 236, 0.28)" : "none" }}>
            Тренери
          </button>
          {groups.map((g) => {
            const key = `group:${g.id}`;
            return (
              <button key={g.id} type="button" onClick={() => setRailFilter(key)} style={{ textAlign: "left", border: `1px solid ${railFilter === key ? theme.primary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: railFilter === key ? `${theme.primary}22` : theme.input, cursor: "pointer", fontSize: 12, color: railFilter === key ? theme.primary : theme.textMain, fontWeight: railFilter === key ? 700 : 600 }}>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 14, display: "flex", flexDirection: "column", background: theme.card, minHeight: 0, height: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: theme.textMain, letterSpacing: "-0.01em" }}>Повідомлення / Чати</div>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Пошук: чат, @username, учениця"
          style={{ marginBottom: 10, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "9px 11px", background: theme.input, color: theme.textMain, fontSize: 13 }}
        />
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
          {enrichedDialogs.map((dlg) => {
            const active = activeDialog?.id === dlg.id;
            return (
              <div
                key={dlg.id}
                style={{
                  textAlign: "left",
                  padding: "12px 13px",
                  borderRadius: 16,
                  border: `1px solid ${active ? theme.primary : theme.border}`,
                  background: active ? `${theme.primary}22` : theme.input,
                  cursor: "pointer",
                  boxShadow: active ? "0 10px 24px rgba(255, 94, 74, 0.28)" : "0 4px 14px rgba(0, 0, 0, 0.24)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectStudent?.(dlg.id);
                    setDraft("");
                  }}
                  style={{ border: "none", background: "transparent", width: "100%", padding: 0, textAlign: "left", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ color: theme.textMain, fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dlg.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 600 }}>{dlg.lastMessageDate?.slice(0, 10) || "—"}</div>
                    </div>
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {dlg.lastMessageText || dlg.username || "Порожній діалог"}
                  </div>
                </button>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>CRM:</span>
                  <span style={{ fontSize: 11, color: dlg.linkedStudent ? theme.success : theme.textMuted, fontWeight: 600 }}>
                    {dlg.linkedStudent ? getDisplayName(dlg.linkedStudent) : "не прив'язано"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const panel = linkUiByChat[dlg.id];
                      if (panel?.open) {
                        setLinkUiByChat((prev) => ({ ...prev, [dlg.id]: { ...(prev[dlg.id] || {}), open: false } }));
                        return;
                      }
                      openLinkPanel(dlg.id, dlg.linkedStudent?.id || metaByChat[dlg.id]?.student_id || "");
                    }}
                    style={{ marginLeft: "auto", border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.secondary, fontSize: 11, fontWeight: 700, padding: "4px 7px", cursor: "pointer" }}
                  >
                    🔗
                  </button>
                </div>

                {linkUiByChat[dlg.id]?.open && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.card }}>
                    <input
                      value={linkSearchByChat[dlg.id] || ""}
                      onChange={(e) => setLinkSearchByChat((prev) => ({ ...prev, [dlg.id]: e.target.value }))}
                      placeholder="Пошук учениці..."
                      style={{ width: "100%", borderRadius: 10, border: `1px solid ${theme.border}`, padding: "7px 8px", marginBottom: 7, background: theme.input, color: theme.textMain, fontSize: 12 }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflow: "auto", marginBottom: 8 }}>
                      {students
                        .filter((st) => {
                          const q = (linkSearchByChat[dlg.id] || "").trim().toLowerCase();
                          if (!q) return true;
                          return getDisplayName(st).toLowerCase().includes(q);
                        })
                        .slice(0, 6)
                        .map((st) => {
                          const selected = (linkUiByChat[dlg.id]?.draftId || "") === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => setLinkUiByChat((prev) => ({ ...prev, [dlg.id]: { ...(prev[dlg.id] || {}), draftId: st.id } }))}
                              style={{ border: `1px solid ${selected ? theme.primary : theme.border}`, borderRadius: 999, background: selected ? `${theme.primary}22` : theme.input, color: selected ? theme.primary : theme.textMain, fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                            >
                              {getDisplayName(st)}
                            </button>
                          );
                        })}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSaveLink(dlg.id);
                        }}
                        disabled={linkSavingChatId === dlg.id}
                        style={{ border: `1px solid ${theme.primary}`, borderRadius: 9, background: `${theme.primary}22`, color: theme.primary, padding: "5px 8px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                      >
                        Прив'язати
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleClearLink(dlg.id);
                        }}
                        disabled={linkSavingChatId === dlg.id}
                        style={{ border: `1px solid ${theme.border}`, borderRadius: 9, background: theme.input, color: theme.textMuted, padding: "5px 8px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                      >
                        Відв'язати
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!enrichedDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів.</div>}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 18, display: "flex", flexDirection: "column", minHeight: 0, height: "100%", background: theme.card, borderColor: theme.border }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: theme.textMain, marginBottom: 4, letterSpacing: "-0.02em" }}>
          {activeDialog ? `Чат: ${activeDialog.title}` : "Оберіть діалог"}
        </div>

        {activeDialog && (
          <>
            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
              {activeDialog.username || `chat_id: ${activeDialog.id}`}
            </div>

            <div style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: theme.textMain, fontSize: 13, letterSpacing: "0.01em" }}>CRM block</div>
                <div style={{ color: activeDialog.linkedStudent ? theme.success : theme.textMuted, fontSize: 11, fontWeight: 700 }}>
                  {activeDialog.linkedStudent ? "Прив'язано" : "Не прив'язано"}
                </div>
              </div>
              <div style={{ color: theme.textMuted, fontSize: 11, marginBottom: 8 }}>Керування привʼязкою — в картці чату ліворуч (кнопка 🔗).</div>
              {crmSummary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                  {[
                    { label: "Учениця", value: crmSummary.studentName || "—" },
                    { label: "Групи", value: crmSummary.groupNames.join(", ") || "—" },
                    { label: "Напрямки", value: crmSummary.directionNames.join(", ") || "—" },
                    { label: "Статус абонемента", value: crmSummary.summarySubStatus || "—" },
                    { label: "Залишок занять", value: crmSummary.remainingTrainings ?? "—" },
                    { label: "Дата завершення", value: crmSummary.endDate || "—" },
                    { label: "Останнє відвідування", value: crmSummary.lastAttendance || "—" },
                  ].map((item) => (
                    <div key={item.label} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "5px 7px", background: theme.card, minHeight: 44 }}>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2, lineHeight: 1.2 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: theme.textMain, fontWeight: 600, lineHeight: 1.25, wordBreak: "break-word" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
              <div style={{ padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input, minHeight: 0 }}>
                <div style={{ fontWeight: 800, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>Внутрішня нотатка</div>
                <textarea
                  value={internalNoteDraft}
                  onChange={(e) => setInternalNoteDraft(e.target.value)}
                  rows={2}
                  style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 8, resize: "vertical", background: theme.card, color: theme.textMain, minHeight: 68 }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await saveMeta(activeDialog.id, { internalNote: internalNoteDraft });
                  }}
                  style={{ marginTop: 7, border: `1px solid ${theme.secondary}`, borderRadius: 11, background: `${theme.secondary}22`, color: theme.secondary, padding: "6px 9px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                >
                  Зберегти
                </button>
              </div>

              <div style={{ padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input, minHeight: 0 }}>
                <div style={{ fontWeight: 800, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>Персональний шаблон</div>
                <textarea
                  value={customTemplateDraft}
                  onChange={(e) => setCustomTemplateDraft(e.target.value)}
                  rows={2}
                  style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 8, resize: "vertical", background: theme.card, color: theme.textMain, minHeight: 68 }}
                />
                <button
                  type="button"
                  onClick={() => saveMeta(activeDialog.id, { customTemplate: customTemplateDraft })}
                  style={{ marginTop: 7, border: `1px solid ${theme.secondary}`, borderRadius: 11, background: `${theme.secondary}22`, color: theme.secondary, padding: "6px 9px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                >
                  Зберегти
                </button>
              </div>
            </div>

            {activeDialog.trainer && (
              <div style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, color: theme.secondary, fontSize: 12, letterSpacing: "0.02em" }}>Trainer contact</div>
                </div>
                <div style={{ color: theme.textMain, fontSize: 12, lineHeight: 1.45 }}>
                  Це контакт тренера. Дайджест і сповіщення доступні у вкладці <strong>Тренери → Сповіщення</strong>.
                </div>
                {onOpenTrainerNotifications && (
                  <button type="button" onClick={onOpenTrainerNotifications} style={{ marginTop: 8, border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
                    Відкрити сповіщення тренерів
                  </button>
                )}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 10, marginTop: 4, marginBottom: 12 }}>
              {orderedMessages.map((m) => (
                <div key={m.id} style={{ marginBottom: 8, textAlign: m.out ? "right" : "left" }}>
                  <div style={{ display: "inline-block", background: m.out ? `${theme.secondary}22` : theme.input, borderRadius: 14, padding: "7px 11px", maxWidth: "84%", border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 13, color: theme.textMain, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.text || "—"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
              <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 800, color: theme.textMain, letterSpacing: "0.01em" }}>Повідомлення</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <textarea value={resolvedDraft} onChange={(e) => setDraft(e.target.value)} rows={4} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, resize: "vertical", fontSize: 13, background: theme.input, color: theme.textMain }} />
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

                    await fetch("/api/telegram?op=sendTest", {
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
