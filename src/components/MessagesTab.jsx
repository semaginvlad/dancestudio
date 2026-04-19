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
  background: "#fffdf7",
  border: "1px solid rgba(8, 8, 8, 0.09)",
  borderRadius: 22,
  boxShadow: "0 20px 40px rgba(8, 8, 8, 0.06)",
};

const palette = {
  red: "#cb2d3e",
  black: "#111111",
  sky: "#dff4ff",
  cream: "#fffaf0",
};

function normalizeTelegramUsername(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
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

export default function MessagesTab({ students = [], groups = [], subs = [], attn = [], selectedStudentId = "", onSelectStudent }) {
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

  const rankedAndFilteredDialogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = dialogsWithStudents.filter((dialog) => {
      const isLinked = Boolean(dialog.matchedStudent);

      if (quickFilter === "linked" && !isLinked) return false;
      if (quickFilter === "unlinked" && isLinked) return false;

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
      const aLinked = a.matchedStudent ? 1 : 0;
      const bLinked = b.matchedStudent ? 1 : 0;

      if (aLinked !== bLinked) return bLinked - aLinked;

      const aFav = favoriteChats[a.id] ? 1 : 0;
      const bFav = favoriteChats[b.id] ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;

      return String(a.title || "").localeCompare(String(b.title || ""), "uk");
    });
  }, [dialogsWithStudents, searchQuery, quickFilter, favoriteChats]);

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

        items.forEach((item) => {
          const chatId = String(item.chat_id);
          nextFav[chatId] = Boolean(item.is_favorite);
          nextNeed[chatId] = Boolean(item.needs_reply);
          nextNote[chatId] = item.internal_note || "";
        });

        setFavoriteChats((prev) => ({ ...prev, ...nextFav }));
        setNeedsReplyChats((prev) => ({ ...prev, ...nextNeed }));
        setChatNotes((prev) => ({ ...prev, ...nextNote }));
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

  const persistChatMeta = async (chatId, patch) => {
    const safeChatId = String(chatId || "");
    if (!safeChatId) return;

    const payload = {
      chatId: safeChatId,
      isFavorite: patch.isFavorite ?? Boolean(favoriteChats[safeChatId]),
      needsReply: patch.needsReply ?? Boolean(needsReplyChats[safeChatId]),
      internalNote: patch.internalNote ?? (chatNotes[safeChatId] || ""),
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


  const groupById = useMemo(() => Object.fromEntries((groups || []).map((g) => [g.id, g])), [groups]);
  const directionById = useMemo(() => Object.fromEntries(DIRECTIONS.map((d) => [d.id, d])), []);

  const crmData = useMemo(() => {
    const student = selectedDialog?.matchedStudent;
    if (!student) return null;

    const studentSubs = (subs || []).filter((sub) => sub.studentId === student.id);
    const linkedGroups = studentSubs
      .map((sub) => groupById[sub.groupId])
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
  }, [selectedDialog, subs, groupById, directionById, attn]);

  const selectedChatNote = selectedDialog ? chatNotes[selectedDialog.id] || "" : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 22, alignItems: "start" }}>
      <div style={{ ...shellCard, padding: 18, position: "sticky", top: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: palette.black, letterSpacing: "0.02em", textTransform: "uppercase" }}>
          Діалоги Telegram
        </div>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Пошук: title, username, учениця..."
          style={{
            width: "100%",
            border: "1px solid rgba(17, 17, 17, 0.12)",
            borderRadius: 14,
            padding: "12px 13px",
            marginBottom: 14,
            outline: "none",
            background: "#ffffff",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
            fontSize: 13,
          }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setQuickFilter(f.id)}
              style={{
                borderRadius: 9999,
                border: `1px solid ${quickFilter === f.id ? "rgba(203, 45, 62, 0.45)" : "rgba(17, 17, 17, 0.16)"}`,
                background: quickFilter === f.id ? "rgba(203, 45, 62, 0.08)" : "rgba(255,255,255,0.88)",
                color: quickFilter === f.id ? palette.red : palette.black,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.02em",
                padding: "6px 12px",
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 640, overflow: "auto", paddingRight: 2 }}>
            {rankedAndFilteredDialogs.map((dialog) => {
              const active = String(selectedChatId) === String(dialog.id);
              const isFavorite = Boolean(favoriteChats[dialog.id]);
              const needsReply = Boolean(needsReplyChats[dialog.id]);
              const isLinking = String(linkDialogId) === String(dialog.id);

              return (
                <div
                  key={dialog.id}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${active ? "rgba(203, 45, 62, 0.38)" : "rgba(17, 17, 17, 0.12)"}`,
                    background: active ? "linear-gradient(180deg, #fff7f7 0%, #ffffff 100%)" : "#ffffff",
                    padding: 12,
                    boxShadow: active ? "0 10px 26px rgba(203, 45, 62, 0.12)" : "0 8px 18px rgba(17, 17, 17, 0.05)",
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
                    <div style={{ color: palette.black, fontSize: 14, fontWeight: 700, letterSpacing: "0.01em" }}>
                      {dialog.title || "Без назви"}
                    </div>
                    <div style={{ color: "#5c5c5c", fontSize: 11, marginTop: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>
                      {dialog.username || `chatId: ${dialog.id}`}
                    </div>
                    <div style={{ color: dialog.matchedStudent ? "#0b5d7e" : "#8f8f8f", fontSize: 12, marginTop: 6 }}>
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
                        border: "1px solid rgba(17, 17, 17, 0.12)",
                        borderRadius: 999,
                        fontSize: 12,
                        padding: "4px 10px",
                        cursor: "pointer",
                        background: isFavorite ? "#fff1d9" : "#fff",
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
                        border: "1px solid rgba(17, 17, 17, 0.12)",
                        borderRadius: 999,
                        fontSize: 12,
                        padding: "4px 10px",
                        cursor: "pointer",
                        background: needsReply ? "rgba(203, 45, 62, 0.1)" : "#fff",
                        color: needsReply ? palette.red : palette.black,
                      }}
                    >
                      {needsReply ? "Потрібна відповідь" : "Без мітки"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartLink(dialog.id)}
                      style={{
                        border: "1px solid rgba(17, 17, 17, 0.12)",
                        borderRadius: 999,
                        fontSize: 12,
                        padding: "4px 10px",
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
                          border: "1px solid rgba(17, 17, 17, 0.12)",
                          borderRadius: 999,
                          fontSize: 12,
                          padding: "4px 10px",
                          cursor: linkSaving ? "not-allowed" : "pointer",
                          background: "#fff",
                          color: palette.red,
                        }}
                      >
                        Відв’язати
                      </button>
                    )}
                  </div>

                  {isLinking && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(17, 17, 17, 0.12)", borderRadius: 14, background: palette.cream }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: palette.black }}>
                        Прив’язка чату до учениці
                      </div>
                      <input
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        placeholder="Пошук учениці..."
                        style={{
                          width: "100%",
                          border: "1px solid rgba(17, 17, 17, 0.12)",
                          borderRadius: 10,
                          padding: "8px 10px",
                          marginBottom: 8,
                          background: "#fff",
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
                              border: "1px solid rgba(17, 17, 17, 0.1)",
                              borderRadius: 10,
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
                            color: "#737373",
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

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 22 }}>
        <div style={{ ...shellCard, padding: 24, background: "linear-gradient(180deg, #fffefb 0%, #ffffff 48%, #fbfeff 100%)" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.black, marginBottom: 12, letterSpacing: "0.01em" }}>
            {selectedDialog ? `Чат: ${selectedDialog.title}` : "Оберіть діалог"}
          </div>

          {metaSyncError && (
            <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{metaSyncError}</div>
          )}

          {crmData ? (
            <div style={{ marginBottom: 14, border: "1px solid rgba(17, 17, 17, 0.12)", borderRadius: 16, padding: 14, background: "linear-gradient(180deg, #f3fbff 0%, #fffdf7 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#5a5a5a", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                CRM по учениці: {getDisplayName(crmData.student)}
              </div>
              <div style={{ fontSize: 12, color: "#454545", display: "grid", gap: 6, lineHeight: 1.45 }}>
                <div><strong>Групи:</strong> {crmData.groups.length ? crmData.groups.map((g) => g.name).join(", ") : "—"}</div>
                <div><strong>Напрямок:</strong> {crmData.direction?.name || "—"}</div>
                <div><strong>Статус абонемента:</strong> {crmData.sub?.status || "—"}</div>
                <div><strong>Залишилось занять:</strong> {crmData.remainingTrainings ?? "—"}</div>
                <div><strong>Кінець абонемента:</strong> {crmData.sub?.endDate || "—"}</div>
                <div><strong>Останнє відвідування:</strong> {crmData.lastAttendanceDate || "—"}</div>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14, border: "1px dashed rgba(17, 17, 17, 0.28)", borderRadius: 14, padding: 12, color: "#666", fontSize: 13, background: "#fffef8" }}>
              Чат не прив’язаний до учениці — CRM-дані недоступні.
            </div>
          )}

          {selectedDialog && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", color: "#666", fontSize: 11, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
                  border: "1px solid rgba(17, 17, 17, 0.13)",
                  borderRadius: 14,
                  padding: "10px 11px",
                  resize: "vertical",
                  background: "#fff",
                }}
              />
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 380, overflow: "auto", paddingRight: 6 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.out ? "flex-end" : "flex-start",
                    maxWidth: "78%",
                    padding: "11px 14px",
                    borderRadius: m.out ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                    border: `1px solid ${m.out ? "rgba(203, 45, 62, 0.24)" : "rgba(17, 17, 17, 0.12)"}`,
                    background: m.out ? "linear-gradient(180deg, #fff1f3 0%, #ffe8ed 100%)" : "linear-gradient(180deg, #f2fbff 0%, #ffffff 100%)",
                    boxShadow: "0 8px 18px rgba(17, 17, 17, 0.06)",
                  }}
                >
                  <div style={{ color: palette.black, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    {m.text || "(без тексту)"}
                  </div>
                  <div style={{ color: "#6f6f6f", fontSize: 10, marginTop: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {m.date ? new Date(m.date).toLocaleString("uk-UA") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedDialog && (
            <div style={{ borderTop: "1px solid rgba(17, 17, 17, 0.12)", marginTop: 16, paddingTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#5b5b5b", letterSpacing: "0.06em", textTransform: "uppercase" }}>Повідомлення</div>
                <button
                  type="button"
                  onClick={handleInsertTemplateToComposer}
                  style={{
                    border: "1px solid rgba(17, 17, 17, 0.12)",
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: palette.sky,
                    cursor: "pointer",
                    fontSize: 12,
                    color: palette.black,
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
                  border: "1px solid rgba(17, 17, 17, 0.14)",
                  borderRadius: 16,
                  padding: "11px 13px",
                  resize: "vertical",
                  background: "#fff",
                  boxShadow: "inset 0 1px 2px rgba(17, 17, 17, 0.04)",
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#707070", maxWidth: "70%" }}>
                  Надсилання виконується через `/api/send-test-telegram` для чатів з `@username`.
                </div>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendLoading}
                  style={{
                    border: "none",
                    borderRadius: 14,
                    padding: "10px 16px",
                    background: sendLoading ? "#9b9b9b" : "linear-gradient(180deg, #cb2d3e 0%, #9b1c2a 100%)",
                    color: "#fff",
                    cursor: sendLoading ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    boxShadow: sendLoading ? "none" : "0 10px 20px rgba(203, 45, 62, 0.3)",
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

        <div style={{ ...shellCard, padding: 18, background: "linear-gradient(180deg, #ffffff 0%, #f7fcff 100%)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#5b5b5b", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Шаблони повідомлень (UI)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            {TEMPLATE_OPTIONS.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setSelectedTemplateId(tpl.id);
                  setTemplateDraft(tpl.text);
                }}
                style={{
                  borderRadius: 14,
                  border: `1px solid ${selectedTemplateId === tpl.id ? "rgba(203, 45, 62, 0.42)" : "rgba(17, 17, 17, 0.12)"}`,
                  background: selectedTemplateId === tpl.id ? "linear-gradient(180deg, #fff1f3 0%, #fff8f9 100%)" : "#fff",
                  textAlign: "left",
                  padding: "10px 11px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  color: palette.black,
                  boxShadow: selectedTemplateId === tpl.id ? "0 8px 18px rgba(203, 45, 62, 0.12)" : "none",
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
              border: "1px solid rgba(17, 17, 17, 0.14)",
              borderRadius: 14,
              padding: "10px 11px",
              resize: "vertical",
              background: "#ffffff",
            }}
          />
          <div style={{ color: "#707070", fontSize: 11, marginTop: 7, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Шаблон можна вставити у нижню панель і надіслати кнопкою “Надіслати”.
          </div>
        </div>
      </div>
    </div>
  );
}
