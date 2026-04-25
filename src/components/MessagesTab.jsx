import React, { useEffect, useMemo, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";
import { isTrainerChatByNote } from "../shared/trainerDigest";
import { buildUnifiedContact, CONTACT_TYPES, CRM_STAGES, LEAD_STATUSES, normalizeContactType, normalizeCrmStage, normalizeLeadStatus } from "../shared/messagesContacts";

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
  trainers = [],
  groups = [],
  waitlist = [],
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
  const [activeChannel, setActiveChannel] = useState("telegram");
  const [instagramSelectedId, setInstagramSelectedId] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [instagramCrmOverrides, setInstagramCrmOverrides] = useState({});

  const [dialogs, setDialogs] = useState([]);
  const [dialogsError, setDialogsError] = useState("");
  const [messagesByChat, setMessagesByChat] = useState({});
  const [metaByChat, setMetaByChat] = useState({});
  const [contactTypeDraft, setContactTypeDraft] = useState("other");
  const [crmStageDraft, setCrmStageDraft] = useState("");
  const [shortTagDraft, setShortTagDraft] = useState("");
  const [leadStatusDraft, setLeadStatusDraft] = useState("");
  const [leadSourceDraft, setLeadSourceDraft] = useState("");
  const [preferredDirectionDraft, setPreferredDirectionDraft] = useState("");
  const [preferredGroupDraft, setPreferredGroupDraft] = useState("");

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
  const trainerMapByTelegram = useMemo(
    () =>
      Object.fromEntries(
        (trainers || [])
          .map((t) => [String(t?.telegram || "").replace(/^@+/, "").toLowerCase(), t])
          .filter(([k]) => !!k)
      ),
    [trainers]
  );
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
        const telegramHandle = String(dlg.username || "").replace(/^@+/, "").toLowerCase();
        const hasStoredNote = !!meta && Object.prototype.hasOwnProperty.call(meta, "internal_note");
        const note = hasStoredNote ? (meta?.internal_note || "") : (linkedStudent?.notes || "");
        const inferredTrainer = trainerMapByTelegram[telegramHandle] || null;
        const trainer = !!inferredTrainer || isTrainerChatByNote(note);
        const linkedGroupIds = linkedStudent
          ? normalizeStudentGroupIds(linkedStudent, membershipByStudent[linkedStudent.id] || [])
          : [];
        const contactType = normalizeContactType(meta?.contact_type, linkedStudent ? "student" : trainer ? "trainer" : "other");
        const crmStage = normalizeCrmStage(meta?.crm_stage);
        const inferredLeadStatus = linkedStudent ? "student" : crmStage === "waitlist_ready" ? "waitlist" : contactType === "lead" ? "new_lead" : "";
        const leadStatus = normalizeLeadStatus(meta?.lead_status, inferredLeadStatus);
        const contact = buildUnifiedContact({
          id: dlg.id,
          channel: "telegram",
          name: meta?.contact_name || dlg.title || getDisplayName(linkedStudent || inferredTrainer || {}),
          phone: meta?.contact_phone || linkedStudent?.phone || inferredTrainer?.phone || "",
          telegram: meta?.contact_telegram || dlg.username || linkedStudent?.telegram || inferredTrainer?.telegram || "",
          instagram: meta?.contact_instagram || linkedStudent?.instagram || inferredTrainer?.instagramHandle || "",
          linkedStudentId: meta?.student_id || linkedStudent?.id || "",
          contactType,
          crmStage,
          leadStatus,
          source: meta?.lead_source || "",
          preferredDirection: meta?.preferred_direction || "",
          preferredGroup: meta?.preferred_group || "",
          shortTag: meta?.short_tag || "",
        });

        const lastTs = parseIsoDateSafe(dlg.lastMessageDate);

        return {
          ...dlg,
          linkedStudent,
          linkedGroupIds,
          trainer,
          note,
          lastTs,
          contact,
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
  }, [dialogs, membershipByStudent, metaByChat, railFilter, searchQ, studentMap, trainerMapByTelegram]);

  const instagramContacts = useMemo(() => {
    const waitlistStudents = new Set((waitlist || []).map((w) => String(w.studentId || "")));
    const rows = [];
    students.forEach((st) => {
      const studentId = String(st.id || "");
      const hasGroups = (membershipByStudent[studentId] || []).length > 0;
      const baseStatus = hasGroups ? "student" : waitlistStudents.has(studentId) ? "waitlist" : "new_lead";
      const baseCrmStage = waitlistStudents.has(studentId) ? "waitlist_ready" : (!hasGroups ? "potential_lead" : "");
      const override = instagramCrmOverrides[`instagram:student:${studentId}`] || {};
      rows.push(buildUnifiedContact({
        id: `instagram:student:${studentId}`,
        channel: "instagram",
        name: getDisplayName(st),
        phone: st.phone || "",
        telegram: st.telegram || "",
        instagram: st.instagram || "",
        linkedStudentId: studentId,
        contactType: override.contactType || (hasGroups ? "student" : "lead"),
        crmStage: override.crmStage ?? baseCrmStage,
        leadStatus: override.leadStatus || baseStatus,
        source: override.source || "",
        preferredDirection: override.preferredDirection || "",
        preferredGroup: override.preferredGroup || "",
        shortTag: override.shortTag || "",
      }));
    });
    trainers.forEach((tr) => {
      const trainerName = [tr.firstName, tr.lastName].filter(Boolean).join(" ").trim() || tr.name || tr.id;
      const id = `instagram:trainer:${tr.id}`;
      const override = instagramCrmOverrides[id] || {};
      rows.push(buildUnifiedContact({
        id,
        channel: "instagram",
        name: trainerName,
        phone: tr.phone || "",
        telegram: tr.telegram || "",
        instagram: tr.instagramHandle || "",
        contactType: override.contactType || "trainer",
        crmStage: override.crmStage || "",
        leadStatus: override.leadStatus || "",
        source: override.source || "",
        preferredDirection: override.preferredDirection || "",
        preferredGroup: override.preferredGroup || "",
        shortTag: override.shortTag || "",
      }));
    });
    return rows
      .filter((c) => {
        const q = searchQ.trim().toLowerCase();
        if (!q) return true;
        return [c.name, c.phone, c.telegram, c.instagram].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [instagramCrmOverrides, membershipByStudent, searchQ, students, trainers, waitlist]);
  const matchesQuickFilter = (contact) => {
    if (!contact) return false;
    if (quickFilter === "all") return true;
    if (quickFilter === "waitlist") return contact.leadStatus === "waitlist" || contact.crmStage === "waitlist_ready";
    if (quickFilter === "leads") return contact.contactType === "lead" || ["new_lead", "contacted", "interested"].includes(contact.leadStatus);
    if (quickFilter === "students") return contact.contactType === "student" || contact.leadStatus === "student";
    if (quickFilter === "trainers") return contact.contactType === "trainer";
    return true;
  };
  const filteredTelegramDialogs = useMemo(() => enrichedDialogs.filter((d) => matchesQuickFilter(d.contact)), [enrichedDialogs, quickFilter]);
  const filteredInstagramContacts = useMemo(() => instagramContacts.filter((c) => matchesQuickFilter(c)), [instagramContacts, quickFilter]);
  const activeDialog = filteredTelegramDialogs.find((d) => d.id === selectedDialog?.id) || filteredTelegramDialogs[0] || null;
  const activeInstagramContact = filteredInstagramContacts.find((c) => c.id === instagramSelectedId) || filteredInstagramContacts[0] || null;

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
    if (Object.prototype.hasOwnProperty.call(patch || {}, "contactType")) {
      body.contactType = patch.contactType ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "crmStage")) {
      body.crmStage = patch.crmStage ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "shortTag")) {
      body.shortTag = patch.shortTag ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "contactName")) {
      body.contactName = patch.contactName ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "contactPhone")) {
      body.contactPhone = patch.contactPhone ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "contactTelegram")) {
      body.contactTelegram = patch.contactTelegram ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "contactInstagram")) {
      body.contactInstagram = patch.contactInstagram ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "leadStatus")) {
      body.leadStatus = patch.leadStatus ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "leadSource")) {
      body.leadSource = patch.leadSource ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "preferredDirection")) {
      body.preferredDirection = patch.preferredDirection ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "preferredGroup")) {
      body.preferredGroup = patch.preferredGroup ?? null;
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
    setContactTypeDraft(normalizeContactType(meta.contact_type, activeDialog?.contact?.contactType || "other"));
    setCrmStageDraft(normalizeCrmStage(meta.crm_stage));
    setShortTagDraft(meta.short_tag || "");
    setLeadStatusDraft(normalizeLeadStatus(meta.lead_status, activeDialog?.contact?.leadStatus || ""));
    setLeadSourceDraft(meta.lead_source || "");
    setPreferredDirectionDraft(meta.preferred_direction || "");
    setPreferredGroupDraft(meta.preferred_group || "");
  }, [activeDialog?.id, metaByChat]);

  useEffect(() => {
    if (activeChannel !== "instagram") return;
    if (!filteredInstagramContacts.length) return;
    if (!filteredInstagramContacts.some((c) => c.id === instagramSelectedId)) {
      setInstagramSelectedId(filteredInstagramContacts[0].id);
    }
  }, [activeChannel, filteredInstagramContacts, instagramSelectedId]);

  useEffect(() => {
    if (activeChannel !== "instagram") return;
    if (!activeInstagramContact) return;
    setContactTypeDraft(activeInstagramContact.contactType || "other");
    setCrmStageDraft(activeInstagramContact.crmStage || "");
    setShortTagDraft(activeInstagramContact.shortTag || "");
    setLeadStatusDraft(activeInstagramContact.leadStatus || "");
    setLeadSourceDraft(activeInstagramContact.source || "");
    setPreferredDirectionDraft(activeInstagramContact.preferredDirection || "");
    setPreferredGroupDraft(activeInstagramContact.preferredGroup || "");
  }, [activeChannel, activeInstagramContact]);

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
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: theme.textMain, letterSpacing: "-0.01em" }}>Повідомлення / Multi-channel</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setActiveChannel("telegram")}
            style={{ border: `1px solid ${activeChannel === "telegram" ? theme.primary : theme.border}`, borderRadius: 12, padding: "8px 10px", background: activeChannel === "telegram" ? `${theme.primary}22` : theme.input, color: activeChannel === "telegram" ? theme.primary : theme.textMain, fontWeight: 700, cursor: "pointer" }}
          >
            Telegram
          </button>
          <button
            type="button"
            onClick={() => setActiveChannel("instagram")}
            style={{ border: `1px solid ${activeChannel === "instagram" ? theme.secondary : theme.border}`, borderRadius: 12, padding: "8px 10px", background: activeChannel === "instagram" ? `${theme.secondary}22` : theme.input, color: activeChannel === "instagram" ? theme.secondary : theme.textMain, fontWeight: 700, cursor: "pointer" }}
          >
            Instagram
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            ["all", "all"],
            ["leads", "leads"],
            ["waitlist", "waitlist"],
            ["students", "students"],
            ["trainers", "trainers"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQuickFilter(id)}
              style={{ border: `1px solid ${quickFilter === id ? theme.primary : theme.border}`, borderRadius: 999, padding: "5px 9px", background: quickFilter === id ? `${theme.primary}22` : theme.input, color: quickFilter === id ? theme.primary : theme.textMain, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={activeChannel === "telegram" ? "Пошук: чат, @username, учениця" : "Пошук: контакт, phone, @telegram, instagram"}
          style={{ marginBottom: 10, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "9px 11px", background: theme.input, color: theme.textMain, fontSize: 13 }}
        />
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
          {activeChannel === "telegram" && filteredTelegramDialogs.map((dlg) => {
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
                  {dlg.contact?.leadStatus && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: dlg.contact.leadStatus === "waitlist" ? theme.warning : theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "2px 6px", background: theme.card }}>
                      {dlg.contact.leadStatus}
                    </span>
                  )}
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
          {activeChannel === "instagram" && filteredInstagramContacts.map((contact) => {
            const active = activeInstagramContact?.id === contact.id;
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => setInstagramSelectedId(contact.id)}
                style={{ textAlign: "left", padding: "12px 13px", borderRadius: 16, border: `1px solid ${active ? theme.secondary : theme.border}`, background: active ? `${theme.secondary}22` : theme.input, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: theme.textMain, fontSize: 14, fontWeight: 700 }}>{contact.name || "Без імені"}</div>
                  <span style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>{contact.contactType}</span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                  {contact.instagram || "Instagram handle не вказано"}
                </div>
                {contact.crmStage && <div style={{ fontSize: 11, color: theme.warning, marginTop: 4 }}>CRM: {contact.crmStage}</div>}
                {contact.leadStatus && <div style={{ fontSize: 11, color: contact.leadStatus === "waitlist" ? theme.warning : theme.textMuted, marginTop: 3 }}>status: {contact.leadStatus}</div>}
              </button>
            );
          })}
          {activeChannel === "telegram" && !filteredTelegramDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів за вибраним фільтром.</div>}
          {activeChannel === "instagram" && !filteredInstagramContacts.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Контакти для foundation поки відсутні.</div>}
        </div>
      </div>

      <div style={{ ...shellCard, padding: 18, display: "flex", flexDirection: "column", minHeight: 0, height: "100%", background: theme.card, borderColor: theme.border }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: theme.textMain, marginBottom: 4, letterSpacing: "-0.02em" }}>
          {activeChannel === "telegram"
            ? (activeDialog ? `Telegram чат: ${activeDialog.title}` : "Оберіть діалог")
            : (activeInstagramContact ? `Instagram foundation: ${activeInstagramContact.name || "контакт"}` : "Оберіть контакт")}
        </div>

        {activeChannel === "instagram" && (
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.secondary, marginBottom: 6 }}>Instagram channel readiness</div>
              <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
                Foundation режим: API інтеграція з Meta/Instagram ще не підключена на цьому кроці. Нижче — уніфікована contact model та CRM-поля для майбутнього каналу.
              </div>
            </div>
            {activeInstagramContact && (
              <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["name", activeInstagramContact.name || "—"],
                    ["phone", activeInstagramContact.phone || "—"],
                    ["telegram", activeInstagramContact.telegram || "—"],
                    ["instagram", activeInstagramContact.instagram || "—"],
                    ["linked student", activeInstagramContact.linkedStudentId || "—"],
                    ["contact type", activeInstagramContact.contactType || "other"],
                    ["crm stage", activeInstagramContact.crmStage || "—"],
                    ["short tag", activeInstagramContact.shortTag || "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 12, color: theme.textMain, fontWeight: 600, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeInstagramContact && (
              <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMain, marginBottom: 8 }}>Instagram CRM foundation edit (local)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  <select value={contactTypeDraft} onChange={(e) => setContactTypeDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    {CONTACT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={leadStatusDraft} onChange={(e) => setLeadStatusDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">lead status</option>
                    {LEAD_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={crmStageDraft} onChange={(e) => setCrmStageDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">crm stage</option>
                    {CRM_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <input value={leadSourceDraft} onChange={(e) => setLeadSourceDraft(e.target.value)} placeholder="source" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={preferredDirectionDraft} onChange={(e) => setPreferredDirectionDraft(e.target.value)} placeholder="preferred direction" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={preferredGroupDraft} onChange={(e) => setPreferredGroupDraft(e.target.value)} placeholder="preferred group" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={shortTagDraft} onChange={(e) => setShortTagDraft(e.target.value)} placeholder="short tag / note" style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <button
                    type="button"
                    onClick={() => setInstagramCrmOverrides((prev) => ({
                      ...prev,
                      [activeInstagramContact.id]: {
                        contactType: contactTypeDraft,
                        crmStage: crmStageDraft,
                        leadStatus: leadStatusDraft,
                        source: leadSourceDraft,
                        preferredDirection: preferredDirectionDraft,
                        preferredGroup: preferredGroupDraft,
                        shortTag: shortTagDraft,
                      },
                    }))}
                    style={{ border: `1px solid ${theme.secondary}`, borderRadius: 10, background: `${theme.secondary}22`, color: theme.secondary, padding: "7px 10px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Save foundation
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeChannel === "telegram" && activeDialog && (
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

            <div style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input }}>
              <div style={{ fontWeight: 800, color: theme.textMain, marginBottom: 8, fontSize: 13 }}>Contact foundation (multi-channel ready)</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "2px 8px", background: theme.card, color: theme.textMuted }}>
                  type: {contactTypeDraft || "other"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "2px 8px", background: theme.card, color: leadStatusDraft === "waitlist" ? theme.warning : theme.textMuted }}>
                  status: {leadStatusDraft || "—"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Тип контакту</div>
                  <select value={contactTypeDraft} onChange={(e) => setContactTypeDraft(e.target.value)} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    {CONTACT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>CRM stage</div>
                  <select value={crmStageDraft} onChange={(e) => setCrmStageDraft(e.target.value)} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">—</option>
                    {CRM_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Short tag</div>
                  <input value={shortTagDraft} onChange={(e) => setShortTagDraft(e.target.value)} placeholder="vip / warm / callback" style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => saveMeta(activeDialog.id, {
                      contactType: contactTypeDraft,
                      crmStage: crmStageDraft || null,
                      shortTag: shortTagDraft || null,
                      contactName: activeDialog.contact?.name || activeDialog.title || "",
                      contactPhone: activeDialog.contact?.phone || activeDialog.linkedStudent?.phone || "",
                      contactTelegram: activeDialog.contact?.telegram || activeDialog.username || "",
                      contactInstagram: activeDialog.contact?.instagram || "",
                    })}
                    style={{ width: "100%", border: `1px solid ${theme.secondary}`, borderRadius: 11, background: `${theme.secondary}22`, color: theme.secondary, padding: "7px 9px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                  >
                    Зберегти foundation
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Lead status</div>
                  <select value={leadStatusDraft} onChange={(e) => setLeadStatusDraft(e.target.value)} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">—</option>
                    {LEAD_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Source</div>
                  <input value={leadSourceDraft} onChange={(e) => setLeadSourceDraft(e.target.value)} placeholder="instagram/ad/referral" style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Preferred direction</div>
                  <input value={preferredDirectionDraft} onChange={(e) => setPreferredDirectionDraft(e.target.value)} placeholder="heels / bachata ..." style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3 }}>Preferred group</div>
                  <input value={preferredGroupDraft} onChange={(e) => setPreferredGroupDraft(e.target.value)} placeholder="group id/name" style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => saveMeta(activeDialog.id, {
                    leadStatus: leadStatusDraft || null,
                    leadSource: leadSourceDraft || null,
                    preferredDirection: preferredDirectionDraft || null,
                    preferredGroup: preferredGroupDraft || null,
                  })}
                  style={{ border: `1px solid ${theme.secondary}`, borderRadius: 11, background: theme.card, color: theme.secondary, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
                >
                  Зберегти lead fields
                </button>
              </div>
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
