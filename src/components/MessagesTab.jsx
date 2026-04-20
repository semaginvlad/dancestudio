import React, { useEffect, useMemo, useState } from "react";
import { DIRECTIONS, theme } from "../shared/constants";
import { getDisplayName } from "../shared/utils";

const QUICK_FILTERS = [
  { id: "all", label: "Усі" },
  { id: "linked", label: "Прив’язані" },
  { id: "unlinked", label: "Без прив’язки" },
];

const TEMPLATE_OPTIONS = [
  {
    id: "payment_reminder",
    label: "Нагадування про оплату",
    text: "Привіт! Нагадуємо про оплату абонемента. Якщо вже оплатили — дякуємо 💛",
  },
  {
    id: "training_reminder",
    label: "Нагадування про тренування",
    text: "Привіт! Нагадуємо про найближче тренування. Будемо раді бачити вас 💃",
  },
  {
    id: "return_invite",
    label: "Запрошення повернутись",
    text: "Привіт! Дуже чекаємо вас знову на тренуваннях. Повертаєтесь цього тижня?",
  },
  {
    id: "absence_followup",
    label: "Уточнення після пропусків",
    text: "Привіт! Бачимо, що було кілька пропусків. Все добре? Можемо допомогти з графіком.",
  },
];

const shellCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #fffdf8 100%)",
  border: "1px solid rgba(0, 0, 0, 0.08)",
  borderRadius: 18,
  boxShadow: "0 10px 28px rgba(0, 0, 0, 0.06)",
};

const uiPalette = {
  red: "#e30613",
  lightBlue: "#b8dcec",
  black: "#000000",
  cream: "#ece4d2",
};

function normalizeTelegramUsername(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function parseFlexibleDate(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue;
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const normalized = rawValue < 1e12 ? rawValue * 1000 : rawValue;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const normalized = numeric < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function formatMessageDateTime(value) {
  const date = parseFlexibleDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readJsonSafe(response) {
  const rawText = await response.text();

  if (!rawText) {
    return { ok: response.ok, status: response.status, data: null, parseError: false };
  }

  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(rawText), parseError: false };
  } catch {
    return {
      ok: false,
      status: response.status,
      data: null,
      parseError: true,
      rawText,
    };
  }
}

export default function MessagesTab({ students = [], groups = [], subs = [], attn = [], studentGrps = [], selectedStudentId = "", onSelectStudent }) {
  const [dialogs, setDialogs] = useState([]);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [dialogsError, setDialogsError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");

  const [selectedChatId, setSelectedChatId] = useState("");

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [messagesReloadTick, setMessagesReloadTick] = useState(0);

  const [favoriteChats, setFavoriteChats] = useState({});
  const [needsReplyChats, setNeedsReplyChats] = useState({});
  const [chatNotes, setChatNotes] = useState({});
  const [chatTemplates, setChatTemplates] = useState({});
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");

  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_OPTIONS[0].id);
  const [templateDraft, setTemplateDraft] = useState(TEMPLATE_OPTIONS[0].text);

  const [linkOverrides, setLinkOverrides] = useState({});
  const [linkDialogId, setLinkDialogId] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [composerText, setComposerText] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendInfo, setSendInfo] = useState("");
  const [templateInfo, setTemplateInfo] = useState("");
  const [metaSyncError, setMetaSyncError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDialogs = async () => {
      setDialogsLoading(true);
      setDialogsError("");

      try {
        const resp = await fetch("/api/telegram-list-dialogs");
        const parsed = await readJsonSafe(resp);

        if (parsed.parseError) {
          throw new Error("Сервер повернув не-JSON відповідь для списку діалогів.");
        }

        if (!parsed.ok) {
          throw new Error(parsed.data?.error || "Не вдалося завантажити діалоги");
        }

        if (!cancelled) {
          setDialogs(Array.isArray(parsed.data?.dialogs) ? parsed.data.dialogs : []);
        }
      } catch (error) {
        if (!cancelled) {
          setDialogsError(String(error?.message || error));
          setDialogs([]);
        }
      } finally {
        if (!cancelled) {
          setDialogsLoading(false);
        }
      }
    };

    loadDialogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const studentsByTelegramUserId = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      if (s.telegram_user_id) {
        map[String(s.telegram_user_id)] = s;
      }
    });
    return map;
  }, [students]);

  const dialogsWithStudents = useMemo(() => {
    return dialogs.map((dialog) => {
      const override = Object.prototype.hasOwnProperty.call(linkOverrides, dialog.id)
        ? linkOverrides[dialog.id]
        : undefined;

      const matchedById = studentsByTelegramUserId[String(dialog.id)] || null;
      const matchedStudent = override === undefined ? matchedById : override;

      return {
        ...dialog,
        matchedStudent,
      };
    });
  }, [dialogs, linkOverrides, studentsByTelegramUserId]);

  useEffect(() => {
    if (!dialogsWithStudents.length || !selectedStudentId || selectedChatId) {
      return;
    }

    const matchedDialog = dialogsWithStudents.find((d) => d.matchedStudent?.id === selectedStudentId);
    if (matchedDialog?.id) {
      setSelectedChatId(String(matchedDialog.id));
    }
  }, [dialogsWithStudents, selectedStudentId, selectedChatId]);

  const groupById = useMemo(() => Object.fromEntries((groups || []).map((g) => [String(g.id), g])), [groups]);
  const directionById = useMemo(() => Object.fromEntries(DIRECTIONS.map((d) => [String(d.id), d])), []);

  const groupIdByStudentId = useMemo(() => {
    const map = {};

    (studentGrps || []).forEach((link) => {
      if (!link?.studentId || !link?.groupId) return;
      const studentKey = String(link.studentId);
      if (!map[studentKey]) map[studentKey] = new Set();
      map[studentKey].add(String(link.groupId));
    });

    (subs || []).forEach((sub) => {
      if (!sub?.studentId || !sub?.groupId) return;
      const studentKey = String(sub.studentId);
      if (!map[studentKey]) map[studentKey] = new Set();
      map[studentKey].add(String(sub.groupId));
    });

    (students || []).forEach((student) => {
      const studentKey = String(student?.id || "");
      if (!studentKey) return;
      if (!map[studentKey]) map[studentKey] = new Set();

      if (student.groupId) {
        map[studentKey].add(String(student.groupId));
      }
      if (Array.isArray(student.groupIds)) {
        student.groupIds.forEach((groupId) => {
          if (groupId) map[studentKey].add(String(groupId));
        });
      }
    });

    return map;
  }, [studentGrps, subs, students]);

  const groupFilterOptions = useMemo(() => {
    const counts = {};

    dialogsWithStudents.forEach((dialog) => {
      const studentId = dialog?.matchedStudent?.id;
      if (!studentId) return;
      const groupSet = groupIdByStudentId[String(studentId)];
      if (!groupSet) return;
      groupSet.forEach((groupId) => {
        counts[groupId] = (counts[groupId] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([groupId, count]) => {
        const group = groupById[groupId];
        const direction = directionById[String(group?.directionId)] || null;
        return { groupId, count, group, direction };
      })
      .filter((item) => item.group)
      .sort((a, b) => String(a.group.name || "").localeCompare(String(b.group.name || ""), "uk"));
  }, [dialogsWithStudents, groupById, groupIdByStudentId, directionById]);

  useEffect(() => {
    if (selectedGroupFilter === "all") return;
    const exists = groupFilterOptions.some((item) => String(item.groupId) === String(selectedGroupFilter));
    if (!exists) {
      setSelectedGroupFilter("all");
    }
  }, [selectedGroupFilter, groupFilterOptions]);

  const rankedAndFilteredDialogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = dialogsWithStudents.filter((dialog) => {
      const isLinked = Boolean(dialog.matchedStudent);

      if (quickFilter === "linked" && !isLinked) return false;
      if (quickFilter === "unlinked" && isLinked) return false;

      if (selectedGroupFilter !== "all") {
        const studentId = dialog?.matchedStudent?.id;
        const studentGroups = studentId ? groupIdByStudentId[String(studentId)] : null;
        if (!studentGroups || !studentGroups.has(String(selectedGroupFilter))) return false;
      }

      if (!normalizedQuery) return true;

      const studentName = dialog.matchedStudent ? getDisplayName(dialog.matchedStudent).toLowerCase() : "";
      const title = String(dialog.title || "").toLowerCase();
      const username = normalizeTelegramUsername(dialog.username);

      return (
        title.includes(normalizedQuery) ||
        username.includes(normalizedQuery) ||
        studentName.includes(normalizedQuery)
      );
    });

    return filtered.sort((a, b) => {
      const aFav = favoriteChats[a.id] ? 1 : 0;
      const bFav = favoriteChats[b.id] ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;

      const aActivity = [
        a.last_message_date,
        a.lastMessageDate,
        a.last_activity_at,
        a.lastActivityAt,
        a.top_message_date,
        a.date,
      ]
        .map((value) => parseFlexibleDate(value)?.getTime() || 0)
        .find((value) => value > 0) || 0;

      const bActivity = [
        b.last_message_date,
        b.lastMessageDate,
        b.last_activity_at,
        b.lastActivityAt,
        b.top_message_date,
        b.date,
      ]
        .map((value) => parseFlexibleDate(value)?.getTime() || 0)
        .find((value) => value > 0) || 0;

      if (aActivity !== bActivity) return bActivity - aActivity;

      return String(a.title || "").localeCompare(String(b.title || ""), "uk");
    });
  }, [dialogsWithStudents, searchQuery, quickFilter, favoriteChats, selectedGroupFilter, groupIdByStudentId]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setMessagesError("");
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setMessagesLoading(true);
      setMessagesError("");

      try {
        const resp = await fetch(`/api/telegram-chat-messages?chatId=${encodeURIComponent(selectedChatId)}&limit=60`);
        const parsed = await readJsonSafe(resp);

        if (parsed.parseError) {
          throw new Error("Сервер повернув не-JSON відповідь для повідомлень чату.");
        }

        if (!parsed.ok) {
          throw new Error(parsed.data?.error || "Не вдалося завантажити повідомлення");
        }

        if (!cancelled) {
          setMessages(Array.isArray(parsed.data?.messages) ? parsed.data.messages : []);
        }
      } catch (error) {
        if (!cancelled) {
          setMessagesError(String(error?.message || error));
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false);
        }
      }
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedChatId, messagesReloadTick]);

  const selectedDialog = useMemo(
    () => dialogsWithStudents.find((d) => String(d.id) === String(selectedChatId)) || null,
    [dialogsWithStudents, selectedChatId],
  );

  const linkDialog = useMemo(
    () => dialogsWithStudents.find((d) => String(d.id) === String(linkDialogId)) || null,
    [dialogsWithStudents, linkDialogId],
  );

  const filteredStudentsForLink = useMemo(() => {
    const normalized = studentSearchQuery.trim().toLowerCase();
    if (!normalized) return students;

    return students.filter((s) => getDisplayName(s).toLowerCase().includes(normalized));
  }, [students, studentSearchQuery]);

  useEffect(() => {
    const chatIds = dialogs.map((d) => String(d.id)).filter(Boolean);
    if (chatIds.length === 0) return;

    let cancelled = false;

    const loadChatMeta = async () => {
      try {
        const resp = await fetch(`/api/telegram-chat-meta?chatIds=${encodeURIComponent(chatIds.join(","))}`);
        const parsed = await readJsonSafe(resp);

        if (parsed.parseError || !parsed.ok) {
          throw new Error(parsed.data?.error || "Failed to load chat metadata");
        }

        if (cancelled) return;

        const items = Array.isArray(parsed.data?.items) ? parsed.data.items : [];
        const nextFav = {};
        const nextNeed = {};
        const nextNote = {};
        const nextTemplate = {};

        items.forEach((item) => {
          const chatId = String(item.chat_id);
          nextFav[chatId] = Boolean(item.is_favorite);
          nextNeed[chatId] = Boolean(item.needs_reply);
          nextNote[chatId] = item.internal_note || "";
          nextTemplate[chatId] = item.custom_template || item.customTemplate || "";
        });

        setFavoriteChats((prev) => ({ ...prev, ...nextFav }));
        setNeedsReplyChats((prev) => ({ ...prev, ...nextNeed }));
        setChatNotes((prev) => ({ ...prev, ...nextNote }));
        setChatTemplates((prev) => ({ ...prev, ...nextTemplate }));
        setMetaSyncError("");
      } catch (error) {
        if (!cancelled) {
          setMetaSyncError(String(error?.message || error));
        }
      }
    };

    loadChatMeta();
    return () => {
      cancelled = true;
    };
  }, [dialogs]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("telegram-chat-custom-templates");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        setChatTemplates((prev) => ({ ...parsed, ...prev }));
      }
    } catch {
      // ignore malformed local storage payload
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("telegram-chat-custom-templates", JSON.stringify(chatTemplates));
    } catch {
      // ignore storage errors
    }
  }, [chatTemplates]);

  const persistChatMeta = async (chatId, patch) => {
    const safeChatId = String(chatId || "");
    if (!safeChatId) return;

    const payload = {
      chatId: safeChatId,
      isFavorite: patch.isFavorite ?? Boolean(favoriteChats[safeChatId]),
      needsReply: patch.needsReply ?? Boolean(needsReplyChats[safeChatId]),
      internalNote: patch.internalNote ?? (chatNotes[safeChatId] || ""),
      customTemplate: patch.customTemplate ?? (chatTemplates[safeChatId] || ""),
    };

    try {
      const resp = await fetch("/api/telegram-chat-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = await readJsonSafe(resp);
      if (parsed.parseError || !parsed.ok) {
        throw new Error(parsed.data?.error || "Failed to save chat metadata");
      }
      setMetaSyncError("");
    } catch (error) {
      setMetaSyncError(String(error?.message || error));
    }
  };

  const handleSelectDialog = (dialog) => {
    setSelectedChatId(String(dialog.id));
    setTemplateInfo("");
    if (dialog.matchedStudent?.id) {
      onSelectStudent?.(dialog.matchedStudent.id);
    }
  };

  const handleStartLink = (dialogId) => {
    setLinkDialogId(String(dialogId));
    setStudentSearchQuery("");
    setLinkError("");
  };

  const handleSaveLink = async (dialog, student) => {
    if (!dialog?.id || !student?.id) return;

    setLinkSaving(true);
    setLinkError("");

    try {
      const resp = await fetch("/api/link-student-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          telegramUserId: String(dialog.id),
          telegramDisplayName: dialog.title || dialog.username || null,
        }),
      });

      const parsed = await readJsonSafe(resp);

      if (parsed.parseError) {
        throw new Error("Сервер повернув не-JSON відповідь під час прив’язки.");
      }

      if (!parsed.ok) {
        const backendError = parsed.data?.error || "Не вдалося зберегти прив’язку.";
        const backendDetails = parsed.data?.details ? ` (${parsed.data.details})` : "";
        throw new Error(`${backendError}${backendDetails}`);
      }

      setLinkOverrides((prev) => ({ ...prev, [String(dialog.id)]: student }));
      onSelectStudent?.(student.id);
      setLinkDialogId("");
      setStudentSearchQuery("");
    } catch (error) {
      setLinkError(String(error?.message || error));
    } finally {
      setLinkSaving(false);
    }
  };

  const handleUnlink = async (dialog) => {
    if (!dialog?.matchedStudent?.id) return;

    setLinkSaving(true);
    setLinkError("");

    try {
      const resp = await fetch("/api/link-student-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: dialog.matchedStudent.id,
          unlink: true,
        }),
      });

      const parsed = await readJsonSafe(resp);

      if (parsed.parseError) {
        throw new Error("Сервер повернув не-JSON відповідь під час відв’язки.");
      }

      if (!parsed.ok) {
        const backendError = parsed.data?.error || "Не вдалося виконати відв’язку.";
        const backendDetails = parsed.data?.details ? ` (${parsed.data.details})` : "";
        throw new Error(`${backendError}${backendDetails}`);
      }

      setLinkOverrides((prev) => ({ ...prev, [String(dialog.id)]: null }));
      setLinkDialogId("");
    } catch (error) {
      setLinkError(String(error?.message || error));
    } finally {
      setLinkSaving(false);
    }
  };

  const handleInsertTemplateToComposer = () => {
    setComposerText((prev) => (prev ? `${prev}\n${templateDraft}` : templateDraft));
  };

  const handleSaveChatTemplate = async () => {
    if (!selectedDialog?.id) return;
    await persistChatMeta(selectedDialog.id, { customTemplate: selectedChatTemplate });
    setTemplateInfo("Персональний шаблон збережено.");
    setTimeout(() => setTemplateInfo(""), 2200);
  };

  const handleSendMessage = async () => {
    if (!selectedDialog) return;

    const username = normalizeTelegramUsername(selectedDialog.username);
    const message = composerText.trim();

    if (!message) {
      setSendError("Введіть текст повідомлення.");
      setSendInfo("");
      return;
    }

    if (!username) {
      setSendError("Для цього чату немає username. Реальне надсилання поки доступне лише для чатів з @username.");
      setSendInfo("");
      return;
    }

    setSendLoading(true);
    setSendError("");
    setSendInfo("");

    try {
      const resp = await fetch("/api/send-test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, message }),
      });

      const parsed = await readJsonSafe(resp);

      if (parsed.parseError) {
        throw new Error("Сервер повернув не-JSON відповідь під час надсилання.");
      }

      if (!parsed.ok) {
        throw new Error(parsed.data?.error || "Не вдалося надіслати повідомлення.");
      }

      setComposerText("");
      setSendInfo("Повідомлення надіслано.");
      setMessagesReloadTick((v) => v + 1);
    } catch (error) {
      setSendError(String(error?.message || error));
    } finally {
      setSendLoading(false);
    }
  };
  const crmData = useMemo(() => {
    const student = selectedDialog?.matchedStudent;
    if (!student) return null;

    const studentSubs = (subs || []).filter((sub) => sub.studentId === student.id);
    const linkedGroupIds = Array.from(groupIdByStudentId[String(student.id)] || []);
    const linkedGroups = linkedGroupIds
      .map((groupId) => groupById[String(groupId)])
      .filter(Boolean)
      .filter((g, idx, arr) => arr.findIndex((x) => x.id === g.id) === idx);

    const activeSub = studentSubs.find((sub) => sub.status !== "expired") || null;
    const targetSub = activeSub || studentSubs[0] || null;

    const targetDirection = targetSub ? directionById[groupById[targetSub.groupId]?.directionId] : null;
    const remainingTrainings = targetSub
      ? Math.max(0, (targetSub.totalTrainings || 0) - (targetSub.usedTrainings || 0))
      : null;

    const subIdSet = new Set(studentSubs.map((sub) => sub.id));
    const lastAttendanceDate = (attn || [])
      .filter((row) => row.subId && subIdSet.has(row.subId))
      .map((row) => row.date)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0] || null;

    return {
      student,
      groups: linkedGroups,
      direction: targetDirection,
      sub: targetSub,
      remainingTrainings,
      lastAttendanceDate,
    };
  }, [selectedDialog, subs, groupById, directionById, attn, groupIdByStudentId]);

  const selectedChatNote = selectedDialog ? chatNotes[selectedDialog.id] || "" : "";
  const selectedChatTemplate = selectedDialog ? chatTemplates[selectedDialog.id] || "" : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(410px, 430px) 1fr", gap: 18 }}>
      <div style={{ ...shellCard, padding: 14, minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: 10, minWidth: 0 }}>
          <div style={{ border: "1px solid rgba(0, 0, 0, 0.1)", borderRadius: 13, padding: 8, background: `linear-gradient(180deg, #ffffff 0%, ${uiPalette.cream}55 100%)` }}>
            <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 8, textAlign: "center", letterSpacing: "0.04em", fontWeight: 700 }}>ГРУПИ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                onClick={() => setSelectedGroupFilter("all")}
                style={{
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: 10,
                  background: selectedGroupFilter === "all" ? `${uiPalette.lightBlue}88` : "#fff",
                  color: selectedGroupFilter === "all" ? uiPalette.black : theme.textMain,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "7px 5px",
                  cursor: "pointer",
                  lineHeight: 1.2,
                }}
              >
                Усі чати
              </button>
              {groupFilterOptions.map((item) => {
                const active = selectedGroupFilter === String(item.groupId);
                return (
                  <button
                    key={item.groupId}
                    type="button"
                    onClick={() => setSelectedGroupFilter(String(item.groupId))}
                    title={`${item.group.name}${item.direction?.name ? ` • ${item.direction.name}` : ""} (${item.count})`}
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.12)",
                      borderRadius: 10,
                      background: active ? `${uiPalette.lightBlue}aa` : "#fff",
                      color: active ? uiPalette.black : theme.textMain,
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "6px 5px",
                      cursor: "pointer",
                      lineHeight: 1.2,
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.group.name}</div>
                    {item.direction?.name && (
                      <div style={{ fontSize: 9, color: theme.textLight, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.direction.name}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: uiPalette.black, letterSpacing: "-0.2px" }}>
              Діалоги Telegram
            </div>

            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук: title, username, учениця..."
              style={{
                width: "100%",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                borderRadius: 12,
                padding: "11px 12px",
                marginBottom: 12,
                outline: "none",
                background: "#fbfcff",
                boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.03)",
              }}
            />

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setQuickFilter(f.id)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${quickFilter === f.id ? "rgba(227, 6, 19, 0.4)" : "rgba(0, 0, 0, 0.12)"}`,
                    background: quickFilter === f.id ? "rgba(227, 6, 19, 0.08)" : "#ffffff",
                    color: quickFilter === f.id ? uiPalette.red : theme.textMain,
                    fontWeight: 600,
                    fontSize: 12,
                    padding: "6px 11px",
                    cursor: "pointer",
                    transition: "all .18s ease",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {dialogsLoading && <div style={{ color: theme.textMuted }}>Завантаження діалогів…</div>}
            {!dialogsLoading && dialogsError && <div style={{ color: theme.danger }}>{dialogsError}</div>}
            {!dialogsLoading && !dialogsError && rankedAndFilteredDialogs.length === 0 && (
              <div style={{ color: theme.textMuted }}>Нічого не знайдено за поточним фільтром.</div>
            )}

            {!dialogsLoading && !dialogsError && rankedAndFilteredDialogs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 610, overflowY: "auto", overflowX: "hidden", paddingRight: 4, minWidth: 0 }}>
            {rankedAndFilteredDialogs.map((dialog) => {
              const active = String(selectedChatId) === String(dialog.id);
              const isFavorite = Boolean(favoriteChats[dialog.id]);
              const needsReply = Boolean(needsReplyChats[dialog.id]);
              const isLinking = String(linkDialogId) === String(dialog.id);

              return (
                <div
                  key={dialog.id}
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${active ? "rgba(227, 6, 19, 0.35)" : "rgba(0, 0, 0, 0.08)"}`,
                    background: active ? "linear-gradient(180deg, rgba(184,220,236,0.26) 0%, #ffffff 100%)" : "#ffffff",
                    padding: 10,
                    boxShadow: active ? "0 8px 20px rgba(227, 6, 19, 0.10)" : "0 5px 14px rgba(0, 0, 0, 0.05)",
                    transition: "all .2s ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectDialog(dialog)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      padding: 4,
                    }}
                  >
                    <div style={{ color: theme.textMain, fontSize: 14, fontWeight: 700 }}>
                      {dialog.title || "Без назви"}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                      {dialog.username || `chatId: ${dialog.id}`}
                    </div>
                    <div style={{ color: dialog.matchedStudent ? "#0f5470" : theme.textLight, fontSize: 12, marginTop: 4 }}>
                      {dialog.matchedStudent ? `👤 ${getDisplayName(dialog.matchedStudent)}` : "👤 Не прив’язано"}
                    </div>
                  </button>

                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !favoriteChats[dialog.id];
                        setFavoriteChats((prev) => ({ ...prev, [dialog.id]: next }));
                        persistChatMeta(dialog.id, { isFavorite: next });
                      }}
                      style={{
                        border: "1px solid rgba(0, 0, 0, 0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: isFavorite ? `${uiPalette.cream}` : "#fff",
                      }}
                    >
                      {isFavorite ? "★ Pin" : "☆ Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !needsReplyChats[dialog.id];
                        setNeedsReplyChats((prev) => ({ ...prev, [dialog.id]: next }));
                        persistChatMeta(dialog.id, { needsReply: next });
                      }}
                      style={{
                        border: "1px solid rgba(0, 0, 0, 0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: needsReply ? "rgba(227, 6, 19, 0.08)" : "#fff",
                        color: needsReply ? uiPalette.red : theme.textMain,
                      }}
                    >
                      {needsReply ? "Потрібна відповідь" : "Без мітки"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartLink(dialog.id)}
                      style={{
                        border: "1px solid rgba(0, 0, 0, 0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: "#fff",
                      }}
                    >
                      Прив’язати до учениці
                    </button>
                    {dialog.matchedStudent && (
                      <button
                        type="button"
                        onClick={() => handleUnlink(dialog)}
                        disabled={linkSaving}
                        style={{
                          border: "1px solid rgba(0, 0, 0, 0.12)",
                          borderRadius: 8,
                          fontSize: 12,
                          padding: "4px 8px",
                          cursor: linkSaving ? "not-allowed" : "pointer",
                          background: "#fff",
                          color: uiPalette.red,
                        }}
                      >
                        Відв’язати
                      </button>
                    )}
                  </div>

                  {isLinking && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(15, 23, 42, 0.1)", borderRadius: 12, background: "#fbfcff" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: theme.textMain }}>
                        Прив’язка чату до учениці
                      </div>
                      <input
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        placeholder="Пошук учениці..."
                        style={{
                          width: "100%",
                          border: "1px solid rgba(15, 23, 42, 0.1)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          marginBottom: 8,
                        }}
                      />
                      <div style={{ maxHeight: 150, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                        {filteredStudentsForLink.slice(0, 20).map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => handleSaveLink(dialog, student)}
                            disabled={linkSaving}
                            style={{
                              border: "1px solid rgba(15, 23, 42, 0.1)",
                              borderRadius: 8,
                              padding: "6px 8px",
                              textAlign: "left",
                              cursor: linkSaving ? "not-allowed" : "pointer",
                              background: "#fff",
                              fontSize: 12,
                            }}
                          >
                            {getDisplayName(student)}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => setLinkDialogId("")}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: theme.textLight,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Закрити
                        </button>
                        {linkSaving && <span style={{ fontSize: 12, color: theme.textMuted }}>Зберігаємо...</span>}
                      </div>
                      {linkError && linkDialog?.id === dialog.id && (
                        <div style={{ color: theme.danger, fontSize: 12, marginTop: 6 }}>{linkError}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 18 }}>
        <div style={{ ...shellCard, padding: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 10, letterSpacing: "-0.2px" }}>
            {selectedDialog ? `Чат: ${selectedDialog.title}` : "Оберіть діалог"}
          </div>

          {metaSyncError && (
            <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{metaSyncError}</div>
          )}

          {crmData ? (
            <div style={{ marginBottom: 14, maxWidth: 620, border: "1px solid rgba(0, 0, 0, 0.1)", borderRadius: 14, padding: 11, background: "linear-gradient(180deg, #ffffff 0%, rgba(184,220,236,0.20) 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: uiPalette.black, marginBottom: 8, letterSpacing: "-0.1px" }}>
                CRM по учениці: {getDisplayName(crmData.student)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(crmData.groups || []).slice(0, 3).map((groupItem) => (
                  <span key={groupItem.id} style={{ border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: theme.textMuted, background: "#fff" }}>
                    {groupItem.name}
                  </span>
                ))}
                {crmData.direction?.name && (
                  <span style={{ border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: theme.textMuted, background: `${uiPalette.lightBlue}55` }}>
                    {crmData.direction.name}
                  </span>
                )}
                <span style={{ border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: theme.textMuted, background: "#fff" }}>
                  Залишок: {crmData.remainingTrainings ?? "—"}
                </span>
                <span style={{ border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: theme.textMuted, background: `${uiPalette.cream}66` }}>
                  До: {crmData.sub?.endDate || "—"}
                </span>
                <span style={{ border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: theme.textMuted, background: "#fff" }}>
                  Останній візит: {crmData.lastAttendanceDate || "—"}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14, border: "1px dashed rgba(15, 23, 42, 0.18)", borderRadius: 14, padding: 12, color: theme.textMuted, fontSize: 13, background: "#fafcff" }}>
              Чат не прив’язаний до учениці — CRM-дані недоступні.
            </div>
          )}

          {selectedDialog && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", color: theme.textLight, fontSize: 12, marginBottom: 4 }}>
                Внутрішня нотатка (локально)
              </label>
              <textarea
                value={selectedChatNote}
                onChange={(e) =>
                  setChatNotes((prev) => ({
                    ...prev,
                    [selectedDialog.id]: e.target.value,
                  }))
                }
                onBlur={() => {
                  if (selectedDialog?.id) {
                    persistChatMeta(selectedDialog.id, { internalNote: selectedChatNote });
                  }
                }}
                placeholder="Коротка нотатка по діалогу..."
                rows={2}
                style={{
                  width: "100%",
                  border: "1px solid rgba(15, 23, 42, 0.1)",
                  borderRadius: 12,
                  padding: "9px 10px",
                  resize: "vertical",
                  background: "#fbfcff",
                }}
              />
            </div>
          )}

          {selectedDialog && (
            <div style={{ marginBottom: 12, border: "1px solid rgba(0, 0, 0, 0.1)", borderRadius: 13, padding: 10, background: "linear-gradient(180deg, #ffffff 0%, rgba(236,228,210,0.42) 100%)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: uiPalette.black, marginBottom: 6, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                Персональний шаблон цього чату
              </div>
              <textarea
                rows={2}
                value={selectedChatTemplate}
                onChange={(e) => {
                  const value = e.target.value;
                  setChatTemplates((prev) => ({ ...prev, [selectedDialog.id]: value }));
                  setTemplateInfo("");
                }}
                placeholder="Ваш шаблон для цього діалогу..."
                style={{
                  width: "100%",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: 12,
                  padding: "8px 10px",
                  resize: "vertical",
                  background: "#fff",
                  marginBottom: 7,
                }}
              />
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleSaveChatTemplate}
                  style={{
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: 10,
                    padding: "6px 12px",
                    background: "linear-gradient(180deg, #eb3440 0%, #e30613 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Зберегти
                </button>
                <button
                  type="button"
                  onClick={() => setComposerText((prev) => (prev ? `${prev}\n${selectedChatTemplate}` : selectedChatTemplate))}
                  disabled={!selectedChatTemplate}
                  style={{
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: 10,
                    padding: "6px 12px",
                    background: `${uiPalette.lightBlue}80`,
                    color: uiPalette.black,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: selectedChatTemplate ? "pointer" : "not-allowed",
                    opacity: selectedChatTemplate ? 1 : 0.6,
                  }}
                >
                  Вставити в повідомлення
                </button>
                {templateInfo && <span style={{ fontSize: 12, color: "#0f5470" }}>{templateInfo}</span>}
              </div>
            </div>
          )}

          {!selectedDialog && <div style={{ color: theme.textMuted, fontSize: 14 }}>Виберіть діалог ліворуч.</div>}
          {selectedDialog && messagesLoading && (
            <div style={{ color: theme.textMuted, fontSize: 14 }}>Завантаження повідомлень…</div>
          )}
          {selectedDialog && !messagesLoading && messagesError && (
            <div style={{ color: theme.danger, fontSize: 14 }}>{messagesError}</div>
          )}
          {selectedDialog && !messagesLoading && !messagesError && messages.length === 0 && (
            <div style={{ color: theme.textMuted, fontSize: 14 }}>У цьому чаті поки немає повідомлень.</div>
          )}

          {selectedDialog && !messagesLoading && !messagesError && messages.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 11, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.out ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    padding: "10px 13px",
                    borderRadius: 16,
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    background: m.out ? "linear-gradient(180deg, #eef2ff 0%, #e9efff 100%)" : "#f7f9fd",
                    boxShadow: "0 3px 10px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div style={{ color: theme.textMain, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                    {m.text || "(без тексту)"}
                  </div>
                  <div style={{ color: theme.textLight, fontSize: 11, marginTop: 7, letterSpacing: "0.1px" }}>
                    {formatMessageDateTime(m.date)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedDialog && (
            <div style={{ borderTop: "1px solid rgba(15, 23, 42, 0.08)", marginTop: 14, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain }}>Повідомлення</div>
                <button
                  type="button"
                  onClick={handleInsertTemplateToComposer}
                  style={{
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: 10,
                    padding: "5px 10px",
                    background: `${uiPalette.lightBlue}66`,
                    cursor: "pointer",
                    fontSize: 12,
                    color: uiPalette.black,
                  }}
                >
                  Вставити шаблон
                </button>
              </div>

              <textarea
                rows={3}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder="Введіть повідомлення..."
                style={{
                  width: "100%",
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  borderRadius: 14,
                  padding: "10px 12px",
                  resize: "vertical",
                  background: "#fbfcff",
                  boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <div style={{ fontSize: 12, color: theme.textLight }}>
                  Надсилання виконується через `/api/send-test-telegram` для чатів з `@username`.
                </div>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendLoading}
                  style={{
                    border: "none",
                    borderRadius: 12,
                    padding: "9px 14px",
                    background: sendLoading ? theme.textLight : "linear-gradient(180deg, #eb3440 0%, #e30613 100%)",
                    color: "#fff",
                    cursor: sendLoading ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    boxShadow: sendLoading ? "none" : "0 8px 18px rgba(227, 6, 19, 0.28)",
                  }}
                >
                  {sendLoading ? "Надсилання..." : "Надіслати"}
                </button>
              </div>

              {sendError && <div style={{ color: theme.danger, fontSize: 12, marginTop: 6 }}>{sendError}</div>}
              {sendInfo && <div style={{ color: theme.primary, fontSize: 12, marginTop: 6 }}>{sendInfo}</div>}
            </div>
          )}
        </div>

        <div style={{ ...shellCard, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.textMain, marginBottom: 12, letterSpacing: "-0.2px" }}>
            Шаблони повідомлень (UI)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 9, marginBottom: 10 }}>
            {TEMPLATE_OPTIONS.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setSelectedTemplateId(tpl.id);
                  setTemplateDraft(tpl.text);
                }}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${selectedTemplateId === tpl.id ? "rgba(99, 102, 241, 0.35)" : "rgba(15, 23, 42, 0.09)"}`,
                  background: selectedTemplateId === tpl.id ? "rgba(99, 102, 241, 0.08)" : "#fbfcff",
                  textAlign: "left",
                  padding: "9px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={templateDraft}
            onChange={(e) => setTemplateDraft(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid rgba(15, 23, 42, 0.12)",
              borderRadius: 12,
              padding: "9px 10px",
              resize: "vertical",
              background: "#fbfcff",
            }}
          />
          <div style={{ color: theme.textLight, fontSize: 12, marginTop: 6 }}>
            Шаблон можна вставити у нижню панель і надіслати кнопкою “Надіслати”.
          </div>
        </div>
      </div>
    </div>
  );
}
