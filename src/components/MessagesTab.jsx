import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName, getSubStatus } from "../shared/utils";
import { isTrainerChatByNote } from "../shared/trainerDigest";
import { buildUnifiedContact, CONTACT_TYPES, CRM_STAGES, LEAD_STATUSES, PIPELINE_STATUSES, normalizeContactType, normalizeCrmStage, normalizeLeadStatus, normalizePipelineStatus } from "../shared/messagesContacts";

const buildAuthHeaders = async (headers = {}) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

const authFetch = async (url, options = {}) => fetch(url, {
  ...options,
  headers: await buildAuthHeaders(options.headers || {}),
});

const normalizeStudentGroupIds = (student, membership) => {
  const inline = [student?.groupId, ...(Array.isArray(student?.groupIds) ? student.groupIds : [])].filter(Boolean);
  return Array.from(new Set([...(membership || []), ...inline]));
};

const parseIsoDateSafe = (value) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

const formatChatTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === yesterday.toDateString()) return "Вчора";
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
};

const formatMessageDay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Сьогодні";
  if (date.toDateString() === yesterday.toDateString()) return "Вчора";
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
};

const getInitials = (value = "") => String(value || "?")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0] || "")
  .join("")
  .toUpperCase() || "?";

const PIPELINE_LABELS_UA = {
  new: "Нова",
  contacted: "Зв'язались",
  interested: "Зацікавлена",
  thinking: "Думає",
  reminder_needed: "Треба нагадати",
  waitlist: "Лист очікування",
  booked: "Записалась",
  closed: "Неактуально",
};

const crmStatusTone = (status) => {
  if (status === "booked") return { bg: "rgba(37,184,122,0.18)", border: "#25B87A", text: "#25B87A" };
  if (["thinking", "interested"].includes(status)) return { bg: "rgba(245,159,58,0.18)", border: "#F59F3A", text: "#F59F3A" };
  if (status === "reminder_needed") return { bg: "rgba(90,129,250,0.18)", border: "#5A81FA", text: "#5A81FA" };
  if (status === "waitlist") return { bg: "rgba(175,82,222,0.2)", border: "#AF52DE", text: "#AF52DE" };
  if (status === "closed") return { bg: "rgba(234,84,85,0.18)", border: "#EA5455", text: "#EA5455" };
  return { bg: "rgba(160,170,190,0.18)", border: "#8F9BB2", text: "#8F9BB2" };
};


const TelegramDialogRow = React.memo(function TelegramDialogRow({
  dialog,
  active,
  linkPanelOpen,
  linkDraftId,
  linkSearch,
  linkSaving,
  students,
  onOpen,
  onToggleLink,
  onLinkSearchChange,
  onSelectLinkStudent,
  onSaveLink,
  onClearLink,
}) {
  const tone = crmStatusTone(dialog.contact?.pipelineStatus || "");
  const statusLabel = PIPELINE_LABELS_UA[dialog.contact?.pipelineStatus] || "";
  const crmSummaryText = dialog.linkedStudent
    ? `CRM: ${getDisplayName(dialog.linkedStudent)}${statusLabel ? ` · ${statusLabel}` : ""}`
    : "CRM: не прив'язано";
  const chatInitials = getInitials(dialog.title || dialog.username || "?");
  const linkSearchQuery = String(linkSearch || "").trim().toLowerCase();
  const linkStudentOptions = students
    .filter((st) => {
      if (!linkSearchQuery) return true;
      return String(getDisplayName(st) || "").toLowerCase().includes(linkSearchQuery);
    })
    .slice(0, 6);

  return (
    <div
      className={`messages-chat-row ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(dialog.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(dialog.id);
        }
      }}
      style={{
        textAlign: "left",
        padding: "12px 13px",
        borderRadius: 16,
        border: `1px solid ${active ? tone.border : theme.border}`,
        background: active ? tone.bg : theme.input,
        cursor: "pointer",
        boxShadow: active ? "0 10px 24px rgba(100, 120, 160, 0.24)" : "0 4px 14px rgba(0, 0, 0, 0.24)",
      }}
    >
      <div className="messages-avatar messages-chat-row-avatar" aria-hidden="true">{chatInitials}</div>
      <div className="messages-chat-row-content">
        <div className="messages-chat-row-top">
          <div className="messages-chat-row-title">{dialog.title}</div>
          <div className="messages-chat-row-time">{formatChatTime(dialog.lastMessageDate)}</div>
        </div>
        <div className="messages-chat-row-preview">{dialog.lastMessageText || dialog.username || "Порожній діалог"}</div>
        <div className="messages-chat-row-crm" title={crmSummaryText}>
          <span className="messages-chat-row-crm-text">{dialog.linkedStudent ? `CRM: ${getDisplayName(dialog.linkedStudent)}` : "CRM: не прив'язано"}</span>
          {statusLabel && <span className="messages-chat-row-status">{statusLabel}</span>}
        </div>
      </div>
      <button
        type="button"
        className="messages-chat-row-link"
        onClick={(event) => onToggleLink(event, dialog)}
        aria-label={dialog.linkedStudent ? "Змінити привʼязку учениці" : "Привʼязати ученицю"}
      >
        🔗
      </button>

      {linkPanelOpen && (
        <div className="messages-inline-link-panel" style={{ marginTop: 8, padding: 8, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.card }}>
          <input
            value={linkSearch || ""}
            onChange={(e) => onLinkSearchChange(dialog.id, e.target.value)}
            placeholder="Пошук учениці..."
            style={{ width: "100%", borderRadius: 10, border: `1px solid ${theme.border}`, padding: "7px 8px", marginBottom: 7, background: theme.input, color: theme.textMain, fontSize: 12 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflow: "auto", marginBottom: 8 }}>
            {linkStudentOptions.map((st) => {
              const selected = (linkDraftId || "") === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectLinkStudent(dialog.id, st.id);
                  }}
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
                onSaveLink(dialog.id);
              }}
              disabled={linkSaving}
              style={{ border: `1px solid ${theme.primary}`, borderRadius: 9, background: `${theme.primary}22`, color: theme.primary, padding: "5px 8px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
            >
              Прив'язати
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClearLink(dialog.id);
              }}
              disabled={linkSaving}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 9, background: theme.input, color: theme.textMuted, padding: "5px 8px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
            >
              Відв'язати
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

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
  const [telegramRailFilter, setTelegramRailFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [draft, setDraft] = useState("");
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [customTemplateDraft, setCustomTemplateDraft] = useState("");
  const [linkUiByChat, setLinkUiByChat] = useState({});
  const [linkSearchByChat, setLinkSearchByChat] = useState({});
  const [linkSavingChatId, setLinkSavingChatId] = useState("");
  const [activeChannel, setActiveChannel] = useState("telegram");
  const [instagramSelectedId, setInstagramSelectedId] = useState("");
  const [instagramRailFilter, setInstagramRailFilter] = useState("all");
  const [instagramCrmOverrides, setInstagramCrmOverrides] = useState({});
  const [instagramConnectionAction, setInstagramConnectionAction] = useState("");
  const [instagramConnectionError, setInstagramConnectionError] = useState("");
  const [instagramAuthCodeDraft, setInstagramAuthCodeDraft] = useState("");
  const [instagramConnectionLoading, setInstagramConnectionLoading] = useState(false);
  const [instagramConnectionStatus, setInstagramConnectionStatus] = useState(null);
  const [instagramThreads, setInstagramThreads] = useState([]);
  const [instagramThreadsLoading, setInstagramThreadsLoading] = useState(false);
  const [instagramSyncStatus, setInstagramSyncStatus] = useState("");
  const [instagramSyncError, setInstagramSyncError] = useState("");
  const [instagramLastSyncedAt, setInstagramLastSyncedAt] = useState("");
  const [instagramSyncDebug, setInstagramSyncDebug] = useState("");

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
  const [formatPreferenceDraft, setFormatPreferenceDraft] = useState("");
  const [waitlistStatusDraft, setWaitlistStatusDraft] = useState("");
  const [pipelineStatusDraft, setPipelineStatusDraft] = useState("");
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [followUpAtDraft, setFollowUpAtDraft] = useState("");
  const [followUpReasonDraft, setFollowUpReasonDraft] = useState("");
  const [followUpStateDraft, setFollowUpStateDraft] = useState("pending");
  const [mobilePane, setMobilePane] = useState("list");
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showMobileFilterSheet, setShowMobileFilterSheet] = useState(false);
  const messagesScrollRef = useRef(null);
  const chatListScrollRef = useRef(null);
  const lastOpenedChatRef = useRef("");
  const wasNearBottomRef = useRef(true);
  const deferredSearchQ = useDeferredValue(searchQ);
  const normalizedSearchQ = useMemo(() => String(deferredSearchQ || "").trim().toLowerCase(), [deferredSearchQ]);

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
        const res = await authFetch("/api/telegram?op=listDialogs");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося завантажити діалоги");
        const loadedDialogs = payload.dialogs || [];
        if (!cancelled) setDialogs(loadedDialogs);

        const metaRows = await Promise.all(
          loadedDialogs.map(async (dlg) => {
            try {
              const metaRes = await authFetch(`/api/telegram?op=chatMeta&chatId=${encodeURIComponent(dlg.id)}`);
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
      authFetch(`/api/telegram?op=chatMessages&chatId=${encodeURIComponent(chatId)}&limit=40`)
        .then((r) => r.json().then((p) => (r.ok ? p : Promise.reject(new Error(p?.details || p?.error || "Не вдалося завантажити повідомлення")))))
        .then((p) => setMessagesByChat((prev) => ({ ...prev, [chatId]: p.messages || [] })))
        .catch(() => setMessagesByChat((prev) => ({ ...prev, [chatId]: [] })));
    }

    authFetch(`/api/telegram?op=chatMeta&chatId=${encodeURIComponent(chatId)}`)
      .then((r) => r.json().then((p) => (r.ok ? p : Promise.reject(new Error(p?.details || p?.error || "Не вдалося завантажити метадані")))))
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
        const inferredPipelineStatus = linkedStudent ? "booked" : leadStatus === "waitlist" ? "waitlist" : contactType === "lead" ? "new" : "";
        const pipelineStatus = normalizePipelineStatus(meta?.pipeline_status, inferredPipelineStatus);
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
          formatPreference: meta?.format_preference || "",
          waitlistStatus: meta?.waitlist_status || "",
          pipelineStatus,
          nextAction: meta?.next_action || "",
          followUpAt: meta?.follow_up_at || "",
          followUpReason: meta?.follow_up_reason || "",
          followUpState: meta?.follow_up_state || "pending",
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
        if (!normalizedSearchQ) return true;
        const q = normalizedSearchQ;
        const linkedName = d.linkedStudent ? String(getDisplayName(d.linkedStudent) || "").toLowerCase() : "";
        return (
          String(d.title || "").toLowerCase().includes(q) ||
          String(d.username || "").toLowerCase().includes(q) ||
          linkedName.includes(q)
        );
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [dialogs, membershipByStudent, metaByChat, normalizedSearchQ, studentMap, trainerMapByTelegram]);

  const instagramContacts = useMemo(() => {
    const waitlistStudents = new Set((waitlist || []).map((w) => String(w.studentId || "")));
    const rows = [];
    students.forEach((st) => {
      const studentId = String(st.id || "");
      const hasGroups = (membershipByStudent[studentId] || []).length > 0;
      const baseStatus = hasGroups ? "student" : waitlistStudents.has(studentId) ? "waitlist" : "new_lead";
      const baseCrmStage = waitlistStudents.has(studentId) ? "waitlist_ready" : (!hasGroups ? "potential_lead" : "");
      const basePipelineStatus = hasGroups ? "booked" : waitlistStudents.has(studentId) ? "waitlist" : "new";
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
        formatPreference: override.formatPreference || "",
        waitlistStatus: override.waitlistStatus || "",
        pipelineStatus: override.pipelineStatus || basePipelineStatus,
        nextAction: override.nextAction || "",
        followUpAt: override.followUpAt || "",
        followUpReason: override.followUpReason || "",
        followUpState: override.followUpState || "pending",
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
        formatPreference: override.formatPreference || "",
        waitlistStatus: override.waitlistStatus || "",
        pipelineStatus: override.pipelineStatus || "",
        nextAction: override.nextAction || "",
        followUpAt: override.followUpAt || "",
        followUpReason: override.followUpReason || "",
        followUpState: override.followUpState || "pending",
        shortTag: override.shortTag || "",
      }));
    });
    return rows
      .filter((c) => {
        const q = normalizedSearchQ;
        if (!q) return true;
        return [c.name, c.phone, c.telegram, c.instagram].map((value) => String(value || "")).join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [instagramCrmOverrides, membershipByStudent, normalizedSearchQ, students, trainers, waitlist]);
  const matchesTelegramRailFilter = (dialog) => {
    if (!dialog) return false;
    if (telegramRailFilter === "all") return true;
    if (telegramRailFilter === "trainers") return dialog.trainer;
    if (telegramRailFilter === "groups") return (dialog.linkedGroupIds || []).length > 0;
    if (telegramRailFilter === "unlinked") return !dialog.linkedStudent;
    if (telegramRailFilter.startsWith("group:")) {
      const gid = telegramRailFilter.replace("group:", "");
      return (dialog.linkedGroupIds || []).includes(gid);
    }
    return true;
  };
  const matchesInstagramRailFilter = (contact, lastTs = 0) => {
    const now = Date.now();
    const ageMs = Math.max(0, now - (lastTs || 0));
    const h24 = 24 * 60 * 60 * 1000;
    const d3 = 3 * h24;
    switch (instagramRailFilter) {
      case "all": return true;
      case "new": return (contact?.pipelineStatus || "") === "new";
      case "needs_reply": return ["new", "contacted", "interested"].includes(contact?.pipelineStatus || "");
      case "reminder_needed": return (contact?.pipelineStatus || "") === "reminder_needed";
      case "thinking": return (contact?.pipelineStatus || "") === "thinking";
      case "booked": return (contact?.pipelineStatus || "") === "booked";
      case "waitlist": return (contact?.pipelineStatus || "") === "waitlist";
      case "closed": return (contact?.pipelineStatus || "") === "closed";
      case "no_status": return !(contact?.pipelineStatus);
      case "no_reply_24h": return ageMs >= h24;
      case "no_reply_3d": return ageMs >= d3;
      default: return true;
    }
  };
  const filteredTelegramDialogs = useMemo(
    () => enrichedDialogs.filter((d) => matchesTelegramRailFilter(d)),
    [enrichedDialogs, telegramRailFilter]
  );
  const filteredInstagramContacts = useMemo(
    () => instagramContacts.filter((c) => matchesInstagramRailFilter(c, parseIsoDateSafe(c.followUpAt))),
    [instagramContacts, instagramRailFilter]
  );
  const filteredInstagramThreads = useMemo(() => {
    const q = normalizedSearchQ;
    return (instagramThreads || []).filter((row) => {
      if (!q) return true;
      return [row?.title, row?.participantUsername, row?.preview, row?.threadId].map((value) => String(value || "")).join(" ").toLowerCase().includes(q);
    });
  }, [instagramThreads, normalizedSearchQ]);
  const telegramFilterOptions = useMemo(() => {
    const countFor = (id) => enrichedDialogs.filter((d) => {
      if (id === "all") return true;
      if (id === "trainers") return d.trainer;
      if (id === "groups") return (d.linkedGroupIds || []).length > 0;
      if (id === "unlinked") return !d.linkedStudent;
      if (id.startsWith("group:")) return (d.linkedGroupIds || []).includes(id.replace("group:", ""));
      return true;
    }).length;
    return [
      { id: "all", label: "Усі чати", count: countFor("all") },
      { id: "trainers", label: "Тренери", count: countFor("trainers") },
      { id: "groups", label: "Групи", count: countFor("groups") },
      { id: "unlinked", label: "Непривʼязані / сервісні", count: countFor("unlinked") },
      ...groups.map((g) => {
        const id = `group:${g.id}`;
        return { id, label: g.name, count: countFor(id) };
      }),
    ];
  }, [enrichedDialogs, groups]);

  const activeTelegramFilterLabel = telegramFilterOptions.find((item) => item.id === telegramRailFilter)?.label || "Усі чати";
  const mobileLinkChatId = Object.entries(linkUiByChat).find(([, panel]) => panel?.open)?.[0] || "";
  const mobileLinkDialog = enrichedDialogs.find((dlg) => dlg.id === mobileLinkChatId) || null;

  const instagramConnectionReadiness = useMemo(() => {
    const status = instagramConnectionStatus || {};
    return {
      connected: !!status.connected,
      provider: status.provider || "Meta Graph / Instagram",
      mode: "oauth_foundation",
      accountLabel: status.igUsername ? `@${status.igUsername}` : "Не підключено",
      pageLabel: status.igUserId || "Не прив'язано",
      lastSyncAt: status.refreshedAt || "",
      expiresAt: status.expiresAt || "",
    };
  }, [instagramConnectionStatus]);
  const loadInstagramConnectionStatus = useCallback(async ({ withFeedback = false } = {}) => {
    try {
      const res = await fetch("/api/instagram-oauth?op=status", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося завантажити Instagram connection status");
      setInstagramConnectionStatus(payload.connection || null);
      setInstagramConnectionError("");
      if (withFeedback) setInstagramConnectionAction("Статус Instagram оновлено.");
    } catch (error) {
      setInstagramConnectionStatus(null);
      setInstagramConnectionError(String(error?.message || error));
    }
  }, []);
  const loadInstagramInboxThreads = useCallback(async () => {
    try {
      setInstagramThreadsLoading(true);
      const res = await fetch("/api/instagram-inbox?op=list", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося завантажити Instagram inbox threads");
      setInstagramThreads(payload.rows || []);
      setInstagramSyncError(payload.emptyReason || "");
      return payload;
    } catch (error) {
      setInstagramThreads([]);
      setInstagramSyncError(String(error?.message || error));
      return null;
    } finally {
      setInstagramThreadsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadInstagramConnectionStatus();
  }, [loadInstagramConnectionStatus]);
  useEffect(() => {
    if (activeChannel !== "instagram") return;
    loadInstagramConnectionStatus();
    loadInstagramInboxThreads();
  }, [activeChannel, loadInstagramConnectionStatus, loadInstagramInboxThreads]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const oauthCode = String(params.get("ig_oauth_code") || "").trim();
    const oauthStatus = String(params.get("ig_oauth_status") || "").trim();
    const oauthError = String(params.get("ig_oauth_error_description") || params.get("ig_oauth_error") || "").trim();
    if (oauthCode) {
      setActiveChannel("instagram");
      setInstagramAuthCodeDraft(oauthCode);
      setInstagramConnectionAction("OAuth callback отримано. Натисніть Exchange code для завершення token exchange.");
    } else if (oauthStatus === "error" && oauthError) {
      setActiveChannel("instagram");
      setInstagramConnectionError(`OAuth помилка: ${oauthError}`);
    }
  }, []);
  const activeDialog = filteredTelegramDialogs.find((d) => d.id === selectedDialog?.id) || filteredTelegramDialogs[0] || null;
  const activeInstagramContact = filteredInstagramContacts.find((c) => c.id === instagramSelectedId) || filteredInstagramContacts[0] || null;
  const activeInstagramThread = filteredInstagramThreads.find((t) => t.id === instagramSelectedId) || filteredInstagramThreads[0] || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mobilePane !== "dialog") return;
    const onPopState = () => setMobilePane("list");
    window.history.pushState({ messagesMobilePane: "dialog" }, "");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [mobilePane]);

  const openTelegramDialog = (dialogId) => {
    onSelectStudent?.(dialogId);
    setDraft("");
    setMobilePane("dialog");
  };

  const scrollMessagesToBottom = useCallback((behavior = "auto") => {
    const node = messagesScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    setShowScrollDown(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const node = messagesScrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distance < 120;
    wasNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

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

  useEffect(() => {
    if (!activeDialog?.id) return;
    const isNewChat = lastOpenedChatRef.current !== activeDialog.id;
    if (isNewChat) {
      lastOpenedChatRef.current = activeDialog.id;
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }
    if (wasNearBottomRef.current) requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
  }, [activeDialog?.id, orderedMessages.length, scrollMessagesToBottom]);

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
    if (Object.prototype.hasOwnProperty.call(patch || {}, "pipelineStatus")) {
      body.pipelineStatus = patch.pipelineStatus ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "formatPreference")) {
      body.formatPreference = patch.formatPreference ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "waitlistStatus")) {
      body.waitlistStatus = patch.waitlistStatus ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "nextAction")) {
      body.nextAction = patch.nextAction ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "followUpAt")) {
      body.followUpAt = patch.followUpAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "followUpReason")) {
      body.followUpReason = patch.followUpReason ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "followUpState")) {
      body.followUpState = patch.followUpState ?? null;
    }
    const res = await authFetch("/api/telegram?op=chatMeta", {
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
    setFormatPreferenceDraft(meta.format_preference || "");
    setWaitlistStatusDraft(meta.waitlist_status || "");
    setPipelineStatusDraft(normalizePipelineStatus(meta.pipeline_status, activeDialog?.contact?.pipelineStatus || ""));
    setNextActionDraft(meta.next_action || "");
    setFollowUpAtDraft(String(meta.follow_up_at || "").slice(0, 16));
    setFollowUpReasonDraft(meta.follow_up_reason || "");
    setFollowUpStateDraft(meta.follow_up_state || "pending");
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
    setFormatPreferenceDraft(activeInstagramContact.formatPreference || "");
    setWaitlistStatusDraft(activeInstagramContact.waitlistStatus || "");
    setPipelineStatusDraft(activeInstagramContact.pipelineStatus || "");
    setNextActionDraft(activeInstagramContact.nextAction || "");
    setFollowUpAtDraft(String(activeInstagramContact.followUpAt || "").slice(0, 16));
    setFollowUpReasonDraft(activeInstagramContact.followUpReason || "");
    setFollowUpStateDraft(activeInstagramContact.followUpState || "pending");
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

  const handleOpenDialogRow = useCallback((dialogId) => {
    openTelegramDialog(dialogId);
  }, [onSelectStudent]);

  const handleToggleLinkPanel = useCallback((event, dialog) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = linkUiByChat[dialog.id];
    if (panel?.open) {
      setLinkUiByChat((prev) => ({ ...prev, [dialog.id]: { ...(prev[dialog.id] || {}), open: false } }));
      return;
    }
    openLinkPanel(dialog.id, dialog.linkedStudent?.id || metaByChat[dialog.id]?.student_id || "");
  }, [linkUiByChat, metaByChat]);

  const handleLinkSearchChange = useCallback((chatId, value) => {
    setLinkSearchByChat((prev) => ({ ...prev, [chatId]: value }));
  }, []);

  const handleSelectLinkStudent = useCallback((chatId, studentId) => {
    setLinkUiByChat((prev) => ({ ...prev, [chatId]: { ...(prev[chatId] || {}), draftId: studentId } }));
  }, []);

  const handleSaveLinkById = useCallback((chatId) => {
    handleSaveLink(chatId);
  }, [linkUiByChat]);

  const handleClearLinkById = useCallback((chatId) => {
    handleClearLink(chatId);
  }, []);

  const refreshMessages = async (chatId) => {
    if (!chatId) return;
    const res = await authFetch(`/api/telegram?op=chatMessages&chatId=${encodeURIComponent(chatId)}&limit=40`);
    const payload = await res.json();
    if (res.ok) setMessagesByChat((prev) => ({ ...prev, [chatId]: payload.messages || [] }));
  };

  return (
    <div
      className={`messages-tab-shell messages-mobile-${mobilePane} ${showMobileDetails ? "messages-show-details" : ""}`}
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
      <div className="messages-filter-rail" style={{ ...shellCard, padding: 12, background: theme.card, borderColor: theme.border }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10, color: theme.textMuted }}>
          {activeChannel === "telegram" ? "Операційні фільтри" : "CRM-фільтри"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeChannel === "telegram" ? (
            <>
              {[
                ["all", "Усі чати"],
                ["trainers", "Тренери"],
                ["groups", "Групи"],
                ["unlinked", "Неприв'язані / службові"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTelegramRailFilter(id)}
                  style={{ textAlign: "left", border: `1px solid ${telegramRailFilter === id ? theme.primary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: telegramRailFilter === id ? `${theme.primary}22` : theme.input, cursor: "pointer", fontSize: 12, color: telegramRailFilter === id ? theme.primary : theme.textMain, fontWeight: telegramRailFilter === id ? 700 : 600 }}
                >
                  {label}
                </button>
              ))}
              {groups.map((g) => {
                const id = `group:${g.id}`;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTelegramRailFilter(id)}
                    style={{ textAlign: "left", border: `1px solid ${telegramRailFilter === id ? theme.primary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: telegramRailFilter === id ? `${theme.primary}22` : theme.input, cursor: "pointer", fontSize: 12, color: telegramRailFilter === id ? theme.primary : theme.textMain, fontWeight: telegramRailFilter === id ? 700 : 600 }}
                  >
                    {g.name}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {[
                ["all", "Усі"],
                ["new", "Нові"],
                ["needs_reply", "Потрібно відповісти"],
                ["reminder_needed", "Потрібно нагадати"],
                ["thinking", "Думає"],
                ["booked", "Записані"],
                ["waitlist", "Лист очікування"],
                ["closed", "Закриті"],
                ["no_reply_24h", "Без відповіді 24г+"],
                ["no_reply_3d", "Без відповіді 3 дні+"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInstagramRailFilter(id)}
                  style={{ textAlign: "left", border: `1px solid ${instagramRailFilter === id ? theme.primary : theme.border}`, borderRadius: 14, padding: "10px 12px", background: instagramRailFilter === id ? `${theme.primary}22` : theme.input, cursor: "pointer", fontSize: 12, color: instagramRailFilter === id ? theme.primary : theme.textMain, fontWeight: instagramRailFilter === id ? 700 : 600 }}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="messages-chat-list-panel" style={{ ...shellCard, padding: 14, display: "flex", flexDirection: "column", background: theme.card, minHeight: 0, height: "100%" }}>
        <div className="messages-list-header" style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: theme.textMain, letterSpacing: "-0.01em" }}>
          <div className="messages-list-title-block"><span>Повідомлення</span><span className="messages-active-filter" title={activeTelegramFilterLabel}>{activeChannel === "telegram" ? activeTelegramFilterLabel : "Instagram"}</span></div>
          <span className="messages-unread-count">{activeChannel === "telegram" ? filteredTelegramDialogs.length : filteredInstagramThreads.length} чатів</span>
          {activeChannel === "telegram" && <button type="button" className="messages-filter-button" onClick={() => setShowMobileFilterSheet(true)} aria-label="Фільтр чатів">Фільтр</button>}
        </div>
        <div className="messages-channel-switch" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setActiveChannel("telegram")}
            style={{ border: `1px solid ${activeChannel === "telegram" ? theme.primary : theme.border}`, borderRadius: 12, padding: "8px 10px", background: activeChannel === "telegram" ? `${theme.primary}22` : theme.input, color: activeChannel === "telegram" ? theme.primary : theme.textMain, fontWeight: 700, cursor: "pointer" }}
          >
            Телеграм
          </button>
          <button
            type="button"
            onClick={() => setActiveChannel("instagram")}
            style={{ border: `1px solid ${activeChannel === "instagram" ? theme.secondary : theme.border}`, borderRadius: 12, padding: "8px 10px", background: activeChannel === "instagram" ? `${theme.secondary}22` : theme.input, color: activeChannel === "instagram" ? theme.secondary : theme.textMain, fontWeight: 700, cursor: "pointer" }}
          >
            Інстаграм
          </button>
        </div>
        <div className="messages-search-wrap"><span className="messages-search-icon" aria-hidden="true">⌕</span><input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={activeChannel === "telegram" ? "Пошук: чат, @username, учениця" : "Пошук: контакт, телефон, @telegram, instagram"}
          style={{ marginBottom: 10, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "9px 36px 9px 11px", background: theme.input, color: theme.textMain, fontSize: 16, width: "100%" }}
        />
        {searchQ && <button type="button" className="messages-search-clear" aria-label="Очистити пошук" onClick={() => setSearchQ("")}>×</button>}
        </div>
        {dialogsError && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{dialogsError}</div>}

        <div ref={chatListScrollRef} className="messages-chat-list" style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
          {activeChannel === "telegram" && filteredTelegramDialogs.map((dlg) => (
            <TelegramDialogRow
              key={dlg.id}
              dialog={dlg}
              active={activeDialog?.id === dlg.id}
              linkPanelOpen={!!linkUiByChat[dlg.id]?.open}
              linkDraftId={linkUiByChat[dlg.id]?.draftId || ""}
              linkSearch={linkSearchByChat[dlg.id] || ""}
              linkSaving={linkSavingChatId === dlg.id}
              students={students}
              onOpen={handleOpenDialogRow}
              onToggleLink={handleToggleLinkPanel}
              onLinkSearchChange={handleLinkSearchChange}
              onSelectLinkStudent={handleSelectLinkStudent}
              onSaveLink={handleSaveLinkById}
              onClearLink={handleClearLinkById}
            />
          ))}
          {activeChannel === "instagram" && filteredInstagramThreads.map((thread) => {
            const active = activeInstagramThread?.id === thread.id;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setInstagramSelectedId(thread.id)}
                style={{ textAlign: "left", padding: "12px 13px", borderRadius: 16, border: `1px solid ${active ? theme.secondary : theme.border}`, background: active ? `${theme.secondary}22` : theme.input, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ color: theme.textMain, fontSize: 14, fontWeight: 700 }}>{thread.title || thread.participantUsername || "Instagram thread"}</div>
                  <span style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>
                    {thread.lastMessageAt ? String(thread.lastMessageAt).slice(0, 16).replace("T", " ") : "—"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                  {thread.preview || "Без preview повідомлення"}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                  @{thread.participantUsername || "unknown"} · thread_id: {thread.threadId || "—"}
                </div>
              </button>
            );
          })}
          {activeChannel === "telegram" && !filteredTelegramDialogs.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Немає діалогів за вибраним фільтром.</div>}
          {activeChannel === "instagram" && instagramThreadsLoading && <div style={{ color: theme.textMuted, fontSize: 13 }}>Завантаження Instagram threads...</div>}
          {activeChannel === "instagram" && !instagramThreadsLoading && !filteredInstagramThreads.length && (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>
              {instagramSyncError || "Instagram threads ще не синхронізовано. Натисніть Sync Instagram inbox."}
            </div>
          )}
        </div>
      </div>

      <div className="messages-dialog-panel" style={{ ...shellCard, padding: 18, display: "flex", flexDirection: "column", minHeight: 0, height: "100%", background: theme.card, borderColor: theme.border }}>
        <div className="messages-dialog-title" style={{ fontSize: 20, fontWeight: 800, color: theme.textMain, marginBottom: 4, letterSpacing: "-0.02em" }}>
          <button type="button" className="messages-back-button" onClick={() => setMobilePane("list")} aria-label="Повернутися до списку чатів">←</button>
          {activeChannel === "telegram" && activeDialog && <div className="messages-avatar messages-dialog-avatar" aria-hidden="true">{getInitials(activeDialog.title || activeDialog.username || "?")}</div>}
          <div className="messages-dialog-heading">
            <div className="messages-dialog-name">{activeChannel === "telegram"
              ? (activeDialog ? activeDialog.title : "Оберіть діалог")
              : (activeInstagramThread ? (activeInstagramThread.title || activeInstagramThread.participantUsername || activeInstagramThread.threadId) : "Оберіть Instagram thread")}</div>
            <div className="messages-dialog-subtitle">{activeChannel === "telegram" ? (activeDialog?.username || (activeDialog ? `чат_id: ${activeDialog.id}` : "")) : "Instagram"}</div>
          </div>
          {activeChannel === "telegram" && activeDialog && <button type="button" className="messages-details-button" onClick={() => setShowMobileDetails((v) => !v)} aria-label="Деталі чату">⋯</button>}
        </div>

        {activeChannel === "instagram" && (
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.secondary, marginBottom: 6 }}>Готовність каналу Інстаграм</div>
              <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
                {instagramConnectionReadiness.connected
                  ? "Instagram підключено. Token активний, статус і терміни дії синхронізовані з OAuth storage."
                  : "Режим бази: API інтеграція з Meta/Instagram ще не підключена на цьому кроці. Нижче — уніфікована модель контакту та CRM-поля для майбутнього каналу."}
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Статус підключення</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: instagramConnectionReadiness.connected ? theme.success : theme.warning }}>
                    {instagramConnectionReadiness.connected ? "Connected" : "Not connected"}
                  </div>
                </div>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Provider</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: theme.textMain }}>{instagramConnectionReadiness.provider}</div>
                </div>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Instagram account</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: theme.textMain }}>{instagramConnectionReadiness.accountLabel}</div>
                </div>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Facebook page</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: theme.textMain }}>{instagramConnectionReadiness.pageLabel}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Mode</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: theme.textMain }}>{instagramConnectionReadiness.mode}</div>
                </div>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Expires at</div>
                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: theme.textMain }}>{instagramConnectionReadiness.expiresAt || "—"}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, padding: 9, border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Inbox foundation sync</div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setInstagramThreadsLoading(true);
                        const res = await fetch("/api/instagram-inbox?op=sync", { method: "POST" });
                        const payload = await res.json();
                        if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося синхронізувати Instagram inbox");
                        setInstagramLastSyncedAt(payload?.syncedAt || new Date().toISOString());
                        setInstagramSyncStatus(`Sync завершено: fetched ${payload?.fetchedThreads || 0}, persisted ${payload?.persistedThreads || 0}. Endpoint: ${payload?.sourceEndpoint || "—"}`);
                        setInstagramSyncError(payload?.diagnostics?.likelyProductReason || payload?.emptyReason || payload?.permissionHint || "");
                        setInstagramSyncDebug(JSON.stringify({
                          sourceEndpoint: payload?.sourceEndpoint || "",
                          attempts: payload?.attempts || [],
                          rawMeta: payload?.rawMeta || {},
                          diagnostics: payload?.diagnostics || {},
                        }, null, 2));
                        await loadInstagramInboxThreads();
                      } catch (error) {
                        setInstagramSyncError(String(error?.message || error));
                        setInstagramSyncDebug("");
                      } finally {
                        setInstagramThreadsLoading(false);
                      }
                    }}
                    disabled={instagramThreadsLoading}
                    style={{ border: `1px solid ${theme.secondary}`, borderRadius: 10, background: `${theme.secondary}22`, color: theme.secondary, padding: "5px 9px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                  >
                    {instagramThreadsLoading ? "Syncing..." : "Sync Instagram inbox"}
                  </button>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: theme.textMuted }}>
                  Last synced: {instagramLastSyncedAt ? String(instagramLastSyncedAt).replace("T", " ").slice(0, 19) : "—"}
                </div>
                {!!instagramSyncStatus && <div style={{ marginTop: 4, fontSize: 11, color: theme.success }}>{instagramSyncStatus}</div>}
                {!!instagramSyncError && <div style={{ marginTop: 4, fontSize: 11, color: theme.warning }}>{instagramSyncError}</div>}
                {!!instagramSyncDebug && (
                  <pre style={{ marginTop: 6, maxHeight: 140, overflow: "auto", border: `1px dashed ${theme.border}`, borderRadius: 8, padding: "6px 7px", fontSize: 10, color: theme.textMuted, background: theme.input, whiteSpace: "pre-wrap" }}>
                    {instagramSyncDebug}
                  </pre>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setInstagramConnectionLoading(true);
                      const res = await fetch("/api/instagram-oauth?op=start", { cache: "no-store" });
                      const payload = await res.json();
                      if (!res.ok || !payload?.authUrl) throw new Error(payload?.details || payload?.error || "Не вдалося сформувати URL підключення");
                      setInstagramConnectionAction("Відкрито OAuth URL. Після авторизації вставте `code` у поле нижче та натисніть Exchange code.");
                      if (typeof window !== "undefined") window.open(payload.authUrl, "_blank", "noopener,noreferrer");
                    } catch (error) {
                      setInstagramConnectionError(String(error?.message || error));
                    } finally {
                      setInstagramConnectionLoading(false);
                    }
                  }}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                >
                  Connect Instagram
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setInstagramConnectionLoading(true);
                      const res = await fetch("/api/instagram-oauth?op=refresh", { method: "POST", cache: "no-store" });
                      const payload = await res.json();
                      if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося оновити Instagram token");
                      setInstagramConnectionAction("Long-lived token успішно оновлено.");
                      setInstagramConnectionStatus(payload.connection || null);
                      setInstagramConnectionError("");
                    } catch (error) {
                      setInstagramConnectionError(String(error?.message || error));
                    } finally {
                      setInstagramConnectionLoading(false);
                    }
                  }}
                  disabled={instagramConnectionLoading || !instagramConnectionReadiness.connected}
                  style={{ border: `1px solid ${theme.secondary}`, borderRadius: 10, background: `${theme.secondary}22`, color: theme.secondary, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                >
                  Refresh token
                </button>
                <span style={{ fontSize: 11, color: theme.textMuted, alignSelf: "center" }}>
                  Last sync: {instagramConnectionReadiness.lastSyncAt || "—"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginTop: 8 }}>
                <input
                  value={instagramAuthCodeDraft}
                  onChange={(e) => setInstagramAuthCodeDraft(e.target.value)}
                  placeholder="Вставте authorization code після redirect"
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain, fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setInstagramConnectionLoading(true);
                      const res = await fetch("/api/instagram-oauth?op=exchange", {
                        method: "POST",
                        cache: "no-store",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code: instagramAuthCodeDraft.trim() }),
                      });
                      const payload = await res.json();
                      if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося обміняти код на token");
                      setInstagramConnectionStatus(payload.connection || null);
                      setInstagramConnectionAction("OAuth code успішно обміняно: short-lived -> long-lived token збережено.");
                      setInstagramConnectionError("");
                      setInstagramAuthCodeDraft("");
                    } catch (error) {
                      setInstagramConnectionError(String(error?.message || error));
                    } finally {
                      setInstagramConnectionLoading(false);
                    }
                  }}
                  disabled={instagramConnectionLoading || !instagramAuthCodeDraft.trim()}
                  style={{ border: `1px solid ${theme.primary}`, borderRadius: 10, background: `${theme.primary}22`, color: theme.primary, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                >
                  Exchange code
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setInstagramConnectionLoading(true);
                      await loadInstagramConnectionStatus({ withFeedback: true });
                    } finally {
                      setInstagramConnectionLoading(false);
                    }
                  }}
                  disabled={instagramConnectionLoading}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.input, color: theme.textMuted, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                >
                  {instagramConnectionLoading ? "Reloading..." : "Reload"}
                </button>
              </div>
              {!!instagramConnectionError && (
                <div style={{ marginTop: 8, fontSize: 11, color: theme.danger }}>
                  {instagramConnectionError}
                </div>
              )}
              {!!instagramConnectionAction && (
                <div style={{ marginTop: 8, fontSize: 11, color: theme.textMuted }}>
                  {instagramConnectionAction}
                </div>
              )}
            </div>
            {activeInstagramThread && (
              <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMain, marginBottom: 8 }}>Instagram thread detail</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["Thread ID", activeInstagramThread.threadId || "—"],
                    ["Username", activeInstagramThread.participantUsername || "—"],
                    ["External participant ID", activeInstagramThread.participantId || "—"],
                    ["Last message time", activeInstagramThread.lastMessageAt || "—"],
                    ["Channel binding", activeInstagramThread.channelId || "—"],
                    ["State", activeInstagramThread.state || "open"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card }}>
                      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: theme.textMain, fontWeight: 600, wordBreak: "break-word" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted, border: `1px dashed ${theme.border}`, borderRadius: 10, padding: "8px 9px" }}>
                  {activeInstagramThread.preview || "Немає preview останнього повідомлення."}
                </div>
              </div>
            )}
            {activeInstagramContact && (
              <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["Ім'я", activeInstagramContact.name || "—"],
                    ["Телефон", activeInstagramContact.phone || "—"],
                    ["Телеграм", activeInstagramContact.telegram || "—"],
                    ["Інстаграм", activeInstagramContact.instagram || "—"],
                    ["Прив'язана учениця", activeInstagramContact.linkedStudentId || "—"],
                    ["Тип контакту", activeInstagramContact.contactType || "інше"],
                    ["Етап CRM", activeInstagramContact.crmStage || "—"],
                    ["Короткий тег", activeInstagramContact.shortTag || "—"],
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
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMain, marginBottom: 8 }}>Редагування CRM-основи Інстаграм (локально)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  <select value={contactTypeDraft} onChange={(e) => setContactTypeDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    {CONTACT_TYPES.map((item) => <option key={item} value={item}>{item === "lead" ? "лід" : item === "student" ? "учениця" : item === "trainer" ? "тренер" : "інше"}</option>)}
                  </select>
                  <select value={leadStatusDraft} onChange={(e) => setLeadStatusDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">Статус ліда</option>
                    {LEAD_STATUSES.map((item) => <option key={item} value={item}>{item === "new_lead" ? "новий лід" : item === "contacted" ? "зв'язались" : item === "interested" ? "зацікавлена" : item === "waitlist" ? "лист очікування" : item === "student" ? "учениця" : "неактуально"}</option>)}
                  </select>
                  <select value={crmStageDraft} onChange={(e) => setCrmStageDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">Етап CRM</option>
                    {CRM_STAGES.map((item) => <option key={item} value={item}>{item === "potential_lead" ? "потенційний лід" : "готова до очікування"}</option>)}
                  </select>
                  <input value={leadSourceDraft} onChange={(e) => setLeadSourceDraft(e.target.value)} placeholder="Джерело ліда" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={preferredDirectionDraft} onChange={(e) => setPreferredDirectionDraft(e.target.value)} placeholder="Бажаний напрямок" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={preferredGroupDraft} onChange={(e) => setPreferredGroupDraft(e.target.value)} placeholder="Бажана група" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <select value={pipelineStatusDraft} onChange={(e) => setPipelineStatusDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">Основний статус чату</option>
                    {PIPELINE_STATUSES.map((item) => <option key={item} value={item}>{PIPELINE_LABELS_UA[item]}</option>)}
                  </select>
                  <select value={formatPreferenceDraft} onChange={(e) => setFormatPreferenceDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="">Формат занять</option>
                    <option value="group">Групові</option>
                    <option value="individual">Індивідуальні</option>
                  </select>
                  <input value={waitlistStatusDraft} onChange={(e) => setWaitlistStatusDraft(e.target.value)} placeholder="Статус очікування" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={nextActionDraft} onChange={(e) => setNextActionDraft(e.target.value)} placeholder="Наступна дія" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input type="datetime-local" value={followUpAtDraft} onChange={(e) => setFollowUpAtDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <select value={followUpStateDraft} onChange={(e) => setFollowUpStateDraft(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }}>
                    <option value="pending">Фоллоу-ап: очікує</option>
                    <option value="done">Фоллоу-ап: виконано</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={shortTagDraft} onChange={(e) => setShortTagDraft(e.target.value)} placeholder="Короткий тег / нотатка" style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
                  <input value={followUpReasonDraft} onChange={(e) => setFollowUpReasonDraft(e.target.value)} placeholder="Причина фоллоу-апу" style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 8px", background: theme.card, color: theme.textMain }} />
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
                        formatPreference: formatPreferenceDraft,
                        waitlistStatus: waitlistStatusDraft,
                        pipelineStatus: pipelineStatusDraft,
                        nextAction: nextActionDraft,
                        followUpAt: followUpAtDraft,
                        followUpReason: followUpReasonDraft,
                        followUpState: followUpStateDraft,
                        shortTag: shortTagDraft,
                      },
                    }))}
                    style={{ border: `1px solid ${theme.secondary}`, borderRadius: 10, background: `${theme.secondary}22`, color: theme.secondary, padding: "7px 10px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Зберегти базу
                  </button>
                </div>
              </div>
            )}
            {activeInstagramContact && (
              <div style={{ padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ fontWeight: 800, color: theme.secondary, fontSize: 12, marginBottom: 6 }}>AI-основа (майбутній блок)</div>
                <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                  Тут буде AI-підсумок для продажів: ймовірність запису, ризик втрати ліда, рекомендації повідомлень і next best action.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
                  <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 10, padding: "8px 9px", color: theme.textMuted, fontSize: 11 }}>Стислий summary: —</div>
                  <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 10, padding: "8px 9px", color: theme.textMuted, fontSize: 11 }}>Ризики: —</div>
                  <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 10, padding: "8px 9px", color: theme.textMuted, fontSize: 11 }}>Рекомендована дія: —</div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeChannel === "telegram" && activeDialog && (
          <>
            <div className="messages-desktop-subtitle" style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
              {activeDialog.username || `чат_id: ${activeDialog.id}`}
            </div>

            <div className="messages-detail-card" style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: theme.textMain, fontSize: 13, letterSpacing: "0.01em" }}>Операційний контекст</div>
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

            <div className="messages-detail-card" style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.input }}>
              <div style={{ fontWeight: 800, color: theme.textMain, marginBottom: 8, fontSize: 13 }}>Операційний профіль чату</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "2px 8px", background: theme.card, color: theme.textMuted }}>
                  Тип: {activeDialog.contact?.contactType === "trainer" ? "тренер" : activeDialog.contact?.contactType === "student" ? "учениця" : "інше"}
                </span>
              </div>
              <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                У Telegram лишено лише операційний контекст: прив'язка до учениці, групи, статус абонемента, нотатка та шаблон для щоденної комунікації.
              </div>
            </div>

            <div className="messages-detail-card messages-notes-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
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
              <div className="messages-trainer-banner" style={{ marginBottom: 10, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, color: theme.secondary, fontSize: 12, letterSpacing: "0.02em" }}>Контакт тренера</div>
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

            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="messages-thread" style={{ flex: 1, minHeight: 0, overflow: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 10, marginTop: 4, marginBottom: 12 }}>
              {orderedMessages.map((m, index) => {
                const day = formatMessageDay(m.date);
                const previousDay = formatMessageDay(orderedMessages[index - 1]?.date);
                return (
                  <React.Fragment key={m.id}>
                    {day && day !== previousDay && <div className="messages-date-separator"><span>{day}</span></div>}
                    <div className={`messages-message-row ${m.out ? "is-out" : "is-in"}`} style={{ marginBottom: 8, textAlign: m.out ? "right" : "left" }}>
                      <div className="messages-bubble" style={{ display: "inline-block", background: m.out ? `${theme.secondary}22` : theme.input, borderRadius: 14, padding: "7px 11px", maxWidth: "84%", border: `1px solid ${theme.border}` }}>
                        <div style={{ fontSize: 13, color: theme.textMain, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.text || "—"}</div>
                        <div className="messages-bubble-time">{formatChatTime(m.date)}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              {showScrollDown && <button type="button" className="messages-scroll-down" onClick={() => scrollMessagesToBottom("smooth")}>Вниз ↓</button>}
            </div>

            <div className="messages-composer" style={{ marginTop: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
              <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 800, color: theme.textMain, letterSpacing: "0.01em" }}>Повідомлення</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <textarea value={resolvedDraft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Повідомлення" style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, resize: "none", fontSize: 16, lineHeight: 1.35, maxHeight: 132, overflow: "auto", background: theme.input, color: theme.textMain }} />
                <button
                  type="button"
                  disabled={!resolvedDraft.trim()}
                  onClick={async () => {
                    if (!resolvedDraft.trim()) return;
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

                    await authFetch("/api/telegram?op=sendTest", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chatId: activeDialog.id, message: resolvedDraft }),
                    });
                    await refreshMessages(activeDialog.id);
                  }}
                  style={{ border: "none", borderRadius: 14, background: "linear-gradient(180deg, #ff6a58 0%, #e74734 100%)", color: "#fff", padding: "11px 18px", cursor: "pointer", fontWeight: 800, boxShadow: "0 12px 24px rgba(255, 89, 66, 0.38)", height: 44 }}
                >
                  <span className="messages-send-label">Надіслати</span><span className="messages-send-icon" aria-hidden="true">➤</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>


      {showMobileFilterSheet && (
        <div className="messages-mobile-sheet-layer" role="presentation">
          <button type="button" className="messages-mobile-sheet-backdrop" aria-label="Закрити фільтр чатів" onClick={() => setShowMobileFilterSheet(false)} />
          <div className="messages-mobile-sheet" role="dialog" aria-modal="true" aria-label="Фільтр чатів">
            <div className="messages-mobile-sheet-header">
              <div>
                <div className="messages-mobile-sheet-title">Фільтр чатів</div>
                <div className="messages-mobile-sheet-subtitle">Поточний: {activeTelegramFilterLabel}</div>
              </div>
              <button type="button" className="messages-mobile-sheet-close" onClick={() => setShowMobileFilterSheet(false)} aria-label="Закрити">×</button>
            </div>
            <div className="messages-mobile-sheet-list">
              {telegramFilterOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`messages-mobile-sheet-option ${telegramRailFilter === item.id ? "is-active" : ""}`}
                  onClick={() => {
                    setTelegramRailFilter(item.id);
                    setShowMobileFilterSheet(false);
                  }}
                >
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mobileLinkChatId && mobileLinkDialog && (
        <div className="messages-mobile-sheet-layer messages-link-sheet-layer" role="presentation">
          <button
            type="button"
            className="messages-mobile-sheet-backdrop"
            aria-label="Закрити привʼязку учениці"
            onClick={() => setLinkUiByChat((prev) => ({ ...prev, [mobileLinkChatId]: { ...(prev[mobileLinkChatId] || {}), open: false } }))}
          />
          <div className="messages-mobile-sheet" role="dialog" aria-modal="true" aria-label="Привʼязати ученицю">
            <div className="messages-mobile-sheet-header">
              <div>
                <div className="messages-mobile-sheet-title">Привʼязати ученицю</div>
                <div className="messages-mobile-sheet-subtitle">{mobileLinkDialog.title || mobileLinkDialog.username || mobileLinkChatId}</div>
              </div>
              <button
                type="button"
                className="messages-mobile-sheet-close"
                onClick={() => setLinkUiByChat((prev) => ({ ...prev, [mobileLinkChatId]: { ...(prev[mobileLinkChatId] || {}), open: false } }))}
                aria-label="Закрити"
              >×</button>
            </div>
            <input
              value={linkSearchByChat[mobileLinkChatId] || ""}
              onChange={(e) => setLinkSearchByChat((prev) => ({ ...prev, [mobileLinkChatId]: e.target.value }))}
              placeholder="Пошук учениці..."
              className="messages-link-search-input"
            />
            <div className="messages-link-results">
              {students
                .filter((st) => {
                  const q = String(linkSearchByChat[mobileLinkChatId] || "").trim().toLowerCase();
                  if (!q) return true;
                  return String(getDisplayName(st) || "").toLowerCase().includes(q);
                })
                .slice(0, 30)
                .map((st) => {
                  const selected = (linkUiByChat[mobileLinkChatId]?.draftId || "") === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className={`messages-link-result ${selected ? "is-active" : ""}`}
                      onClick={() => setLinkUiByChat((prev) => ({ ...prev, [mobileLinkChatId]: { ...(prev[mobileLinkChatId] || {}), draftId: st.id } }))}
                    >
                      <span>{getDisplayName(st)}</span>
                      <span>{selected ? "✓" : ""}</span>
                    </button>
                  );
                })}
            </div>
            <div className="messages-link-actions">
              <button type="button" onClick={() => handleSaveLink(mobileLinkChatId)} disabled={linkSavingChatId === mobileLinkChatId}>Прив'язати</button>
              <button type="button" onClick={() => handleClearLink(mobileLinkChatId)} disabled={linkSavingChatId === mobileLinkChatId}>Відв'язати</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .messages-back-button, .messages-details-button, .messages-send-icon { display: none; }
        .messages-search-wrap { position: relative; }
        .messages-search-clear { position: absolute; right: 8px; top: 6px; width: 30px; height: 30px; border: 0; border-radius: 999px; background: rgba(142, 142, 147, 0.18); color: ${theme.textMuted}; font-size: 20px; cursor: pointer; }
        .messages-list-header { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; }
        .messages-list-title-block { min-width: 0; display: grid; gap: 2px; }
        .messages-active-filter { font-size: 11px; color: ${theme.textMuted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
        .messages-filter-button { display: none; border: 1px solid ${theme.border}; border-radius: 999px; background: ${theme.input}; color: ${theme.textMain}; min-height: 34px; padding: 0 10px; font-weight: 800; cursor: pointer; }
        .messages-unread-count { font-size: 12px; color: ${theme.textMuted}; font-weight: 700; }
        .messages-chat-row { position: relative; display: grid; grid-template-columns: 40px minmax(0, 1fr) 36px; column-gap: 10px; align-items: start; width: 100%; }
        .messages-chat-row-avatar { grid-column: 1; grid-row: 1 / span 3; }
        .messages-chat-row-content { grid-column: 2; }
        .messages-chat-row-link { grid-column: 3; grid-row: 1 / span 3; }
        .messages-inline-link-panel { grid-column: 1 / -1; }
        .messages-chat-row-main { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; min-width: 0; align-items: start; }
        .messages-chat-row-content { min-width: 0; display: grid; gap: 4px; }
        .messages-chat-row-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: baseline; min-width: 0; }
        .messages-chat-row-title { color: ${theme.textMain}; font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .messages-chat-row-time { color: ${theme.textMuted}; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .messages-chat-row-preview { color: ${theme.textMuted}; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .messages-chat-row-crm { display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; white-space: nowrap; color: ${theme.textMuted}; font-size: 11px; line-height: 1.2; font-weight: 700; }
        .messages-chat-row-crm-text { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .messages-chat-row-status { flex: 0 1 auto; max-width: 42%; overflow: hidden; text-overflow: ellipsis; border: 1px solid ${theme.success}; border-radius: 999px; color: ${theme.success}; background: rgba(37,184,122,0.12); padding: 1px 5px; font-size: 10px; line-height: 1.4; font-weight: 800; }
        .messages-chat-row-link { width: 36px; height: 36px; border: 1px solid ${theme.border}; border-radius: 999px; background: ${theme.card}; color: ${theme.secondary}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; align-self: center; padding: 0; flex-shrink: 0; }
        .messages-avatar { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; background: linear-gradient(135deg, ${theme.primary}33, ${theme.secondary}33); color: ${theme.textMain}; font-weight: 800; font-size: 13px; }
        .messages-chat-copy { min-width: 0; flex: 1; }
        .messages-dialog-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .messages-dialog-heading { min-width: 0; flex: 1; }
        .messages-dialog-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .messages-dialog-subtitle { display: none; font-size: 12px; color: ${theme.textMuted}; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .messages-thread { position: relative; overscroll-behavior: contain; }
        .messages-message-row { display: flex; }
        .messages-message-row.is-out { justify-content: flex-end; }
        .messages-message-row.is-in { justify-content: flex-start; }
        .messages-bubble { overflow-wrap: anywhere; word-break: break-word; }
        .messages-bubble-time { margin-top: 4px; font-size: 10px; color: ${theme.textMuted}; text-align: right; }
        .messages-date-separator { display: block; width: fit-content; margin: 12px auto; pointer-events: none; }
        .messages-date-separator span { border: 1px solid ${theme.border}; background: ${theme.card}; color: ${theme.textMuted}; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 700; }
        .messages-scroll-down { position: sticky; bottom: 8px; margin-left: auto; display: block; border: 1px solid ${theme.border}; border-radius: 999px; padding: 7px 11px; background: ${theme.card}; color: ${theme.textMain}; font-weight: 800; box-shadow: 0 10px 24px rgba(0,0,0,.22); cursor: pointer; }

        .messages-mobile-sheet-layer { display: none; }
        .messages-link-row { min-width: 0; display: flex; align-items: center; gap: 6px; }
        .messages-row-side { display: grid; justify-items: end; gap: 6px; min-width: 44px; }
        .messages-row-time { color: ${theme.textMuted}; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .messages-row-link { width: 34px; height: 34px; border: 1px solid ${theme.border}; border-radius: 999px; background: ${theme.card}; color: ${theme.secondary}; cursor: pointer; }
        .messages-row-meta { color: ${theme.textMuted}; font-size: 11px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .messages-row-status { color: ${theme.textMuted}; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 760px) {
          .messages-tab-shell, .messages-tab-shell * { box-sizing: border-box; min-width: 0; max-width: 100%; }
          .messages-tab-shell { display: flex !important; flex-direction: column !important; width: 100% !important; height: 100% !important; min-height: 0 !important; max-height: none !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; overflow: hidden !important; background: ${theme.card} !important; }
          .messages-filter-rail { display: none !important; }
          .messages-chat-list-panel, .messages-dialog-panel { width: 100% !important; max-width: none !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; height: 100% !important; min-height: 0 !important; padding: 0 !important; background: ${theme.card} !important; }
          .messages-mobile-list .messages-dialog-panel { display: none !important; }
          .messages-mobile-dialog .messages-chat-list-panel { display: none !important; }
          .messages-filter-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; min-height: 40px; border: 0 !important; background: ${theme.input} !important; padding: 0 11px; }
          .messages-list-header { position: sticky; top: 0; z-index: 3; min-height: 42px; background: ${theme.card}; margin: 0 !important; padding: calc(8px + env(safe-area-inset-top)) 12px 6px !important; }
          .messages-unread-count { font-size: 11px; }
          .messages-active-filter { font-size: 11px; }
          .messages-channel-switch { height: 42px; gap: 6px !important; margin: 0 10px 8px !important; padding: 2px; border-radius: 14px; background: ${theme.input}; }
          .messages-channel-switch button { border: 0 !important; border-radius: 12px !important; padding: 0 8px !important; min-height: 38px; box-shadow: none !important; }
          .messages-search-wrap { margin: 0 10px 8px; }
          .messages-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-58%); color: ${theme.textMuted}; font-size: 17px; pointer-events: none; }
          .messages-search-wrap input { min-height: 44px !important; margin-bottom: 0 !important; padding: 9px 38px 9px 34px !important; border: 0 !important; border-radius: 14px !important; background: ${theme.input} !important; box-shadow: none !important; }
          .messages-chat-list { width: 100% !important; flex: 1 !important; min-height: 0 !important; gap: 0 !important; padding: 0 0 max(12px, env(safe-area-inset-bottom)) !important; overflow-y: auto !important; overflow-x: hidden !important; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
          .messages-chat-row { display: grid !important; grid-template-columns: 44px minmax(0, 1fr) 40px !important; column-gap: 9px !important; align-items: start !important; width: 100% !important; min-height: 84px !important; height: auto !important; border-width: 0 0 1px 0 !important; border-color: rgba(142,142,147,.18) !important; border-radius: 0 !important; box-shadow: none !important; padding: 9px 12px !important; background: transparent !important; overflow: visible !important; }
          .messages-chat-row-avatar { grid-column: 1; grid-row: 1 / span 3; width: 42px !important; height: 42px !important; }
          .messages-chat-row-content { grid-column: 2; min-width: 0; display: grid; gap: 4px; align-self: start; }
          .messages-chat-row-link { grid-column: 3; grid-row: 1 / span 3; align-self: center; width: 40px !important; height: 40px !important; border: 0 !important; background: ${theme.input} !important; font-size: 17px; opacity: .9; }
          .messages-chat-row-link:active { transform: scale(.96); background: ${theme.primary}18 !important; }
          .messages-chat-row-title { font-size: 14px; }
          .messages-chat-row-preview { font-size: 12px; }
          .messages-chat-row-crm { max-width: 100%; }
          .messages-inline-link-panel { display: none !important; }
          .messages-chat-row.is-active { background: ${theme.primary}10 !important; }
          .messages-dialog-panel { display: flex !important; flex-direction: column !important; overflow: hidden !important; }
          .messages-dialog-title { width: 100% !important; display: grid !important; grid-template-columns: auto auto minmax(0, 1fr) auto; position: sticky; top: 0; z-index: 4; min-height: 60px; margin: 0 !important; padding: calc(8px + env(safe-area-inset-top)) 12px 8px !important; border-radius: 0 !important; box-shadow: none !important; background: ${theme.card}; border-bottom: 1px solid rgba(142,142,147,.2); }
          .messages-back-button, .messages-details-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: 999px; background: transparent; color: ${theme.textMain}; font-size: 22px; cursor: pointer; flex: 0 0 auto; }
          .messages-dialog-avatar { width: 36px; height: 36px; }
          .messages-dialog-subtitle { display: block; }
          .messages-desktop-subtitle { display: none; }
          .messages-detail-card, .messages-notes-grid { display: none !important; }
          .messages-show-details .messages-detail-card, .messages-show-details .messages-notes-grid { display: grid !important; flex-shrink: 0; max-height: 30dvh; overflow: auto; }
          .messages-trainer-banner { width: 100% !important; display: grid !important; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; max-height: 60px; overflow: hidden; margin: 0 !important; padding: 8px 12px !important; border: 0 !important; border-bottom: 1px solid rgba(142,142,147,.16) !important; border-radius: 0 !important; background: ${theme.input} !important; flex-shrink: 0; }
          .messages-trainer-banner div { min-width: 0; }
          .messages-trainer-banner > div:nth-child(2) { display: none; }
          .messages-trainer-banner button { margin-top: 0 !important; white-space: nowrap; }
          .messages-thread { width: 100% !important; flex: 1 !important; min-height: 0 !important; overflow-y: auto !important; overflow-x: hidden !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important; padding: 10px 10px 14px !important; scroll-padding-bottom: 72px; -webkit-overflow-scrolling: touch; background: ${isDark ? '#0b0d12' : '#f6f7fb'}; }
          .messages-bubble { width: fit-content !important; max-width: 82% !important; border-radius: 18px !important; padding: 8px 11px !important; text-align: left !important; overflow-wrap: anywhere; }
          .messages-bubble-time { display: block; margin-top: 5px; }
          .messages-message-row.is-out .messages-bubble { border-bottom-right-radius: 6px !important; }
          .messages-message-row.is-in .messages-bubble { border-bottom-left-radius: 6px !important; }
          .messages-composer { width: 100% !important; flex-shrink: 0; margin: 0 !important; padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important; border-radius: 0 !important; box-shadow: none !important; background: ${theme.card}; border-top: 1px solid rgba(142,142,147,.22) !important; }
          .messages-composer > div:last-child { display: grid !important; grid-template-columns: 1fr 44px !important; gap: 8px !important; }
          .messages-composer > div:first-child { display: none; }
          .messages-composer textarea { min-height: 42px !important; max-height: 120px !important; border-radius: 20px !important; border: 1px solid rgba(142,142,147,.22) !important; background: ${theme.input} !important; }
          .messages-composer button { width: 44px !important; height: 44px !important; padding: 0 !important; border-radius: 50% !important; flex-shrink: 0; }
          .messages-composer button:disabled { opacity: 0.45; box-shadow: none !important; cursor: default !important; }
          .messages-mobile-sheet-layer { display: block; position: fixed; inset: 0; z-index: 90; overflow: hidden; }
          .messages-mobile-sheet-backdrop { position: absolute; inset: 0; border: 0; background: rgba(0,0,0,.38); width: 100%; height: 100%; }
          .messages-mobile-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: min(78dvh, 620px); display: flex; flex-direction: column; gap: 10px; padding: 14px 14px calc(14px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; background: ${theme.card}; border-top: 1px solid ${theme.border}; box-shadow: 0 -18px 44px rgba(0,0,0,.28); overflow: hidden; }
          .messages-mobile-sheet-header { display: grid; grid-template-columns: minmax(0, 1fr) 44px; gap: 10px; align-items: center; }
          .messages-mobile-sheet-title { color: ${theme.textMain}; font-size: 16px; font-weight: 900; }
          .messages-mobile-sheet-subtitle { color: ${theme.textMuted}; font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .messages-mobile-sheet-close { width: 44px; height: 44px; border: 0; border-radius: 999px; background: ${theme.input}; color: ${theme.textMain}; font-size: 24px; }
          .messages-mobile-sheet-list, .messages-link-results { display: grid; gap: 4px; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-right: 2px; }
          .messages-mobile-sheet-option, .messages-link-result { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 42px; padding: 8px 10px; border: 0; border-radius: 12px; background: transparent; color: ${theme.textMain}; font-weight: 800; text-align: left; }
          .messages-mobile-sheet-option span:first-child, .messages-link-result span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .messages-mobile-sheet-option span:last-child { color: ${theme.textMuted}; font-size: 12px; }
          .messages-mobile-sheet-option.is-active, .messages-link-result.is-active { background: ${theme.primary}18; color: ${theme.primary}; }
          .messages-link-search-input { min-height: 42px; border: 1px solid ${theme.border}; border-radius: 14px; background: ${theme.input}; color: ${theme.textMain}; font-size: 16px; padding: 9px 11px; }
          .messages-link-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex-shrink: 0; }
          .messages-link-actions button { min-height: 42px; border: 1px solid ${theme.border}; border-radius: 12px; background: ${theme.input}; color: ${theme.textMain}; font-weight: 900; }
          .messages-send-label { display: none; }
          .messages-send-icon { display: inline; }
        }
      `}</style>
    </div>
  );
}
