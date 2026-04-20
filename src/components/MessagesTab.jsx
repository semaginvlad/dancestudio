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
  background: "#ffffff",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
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
    <div style={{ display: "grid", gridTemplateColumns: "370px 1fr", gap: 18 }}>
      <div style={{ ...shellCard, padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: theme.textMain, letterSpacing: "-0.2px" }}>
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
                border: `1px solid ${quickFilter === f.id ? "rgba(99, 102, 241, 0.35)" : "rgba(15, 23, 42, 0.1)"}`,
                background: quickFilter === f.id ? "rgba(99, 102, 241, 0.08)" : "#ffffff",
                color: quickFilter === f.id ? "#4f46e5" : theme.textMain,
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 610, overflow: "auto", paddingRight: 2 }}>
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
                    border: `1px solid ${active ? "rgba(99, 102, 241, 0.28)" : "rgba(15, 23, 42, 0.08)"}`,
                    background: active ? "rgba(99, 102, 241, 0.05)" : "#ffffff",
                    padding: 10,
                    boxShadow: active ? "0 6px 18px rgba(99, 102, 241, 0.08)" : "0 4px 12px rgba(15, 23, 42, 0.04)",
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
                    <div style={{ color: dialog.matchedStudent ? theme.primary : theme.textLight, fontSize: 12, marginTop: 4 }}>
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
                        border: "1px solid rgba(15, 23, 42, 0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: isFavorite ? "#fff9ee" : "#fff",
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
                        border: "1px solid rgba(15, 23, 42, 0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: needsReply ? "#fff1f1" : "#fff",
                        color: needsReply ? theme.danger : theme.textMain,
                      }}
                    >
                      {needsReply ? "Потрібна відповідь" : "Без мітки"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartLink(dialog.id)}
                      style={{
                        border: "1px solid rgba(15, 23, 42, 0.1)",
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
                          border: "1px solid rgba(15, 23, 42, 0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                          padding: "4px 8px",
                          cursor: linkSaving ? "not-allowed" : "pointer",
                          background: "#fff",
                          color: theme.danger,
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

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 18 }}>
        <div style={{ ...shellCard, padding: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 10, letterSpacing: "-0.2px" }}>
            {selectedDialog ? `Чат: ${selectedDialog.title}` : "Оберіть діалог"}
          </div>

          {metaSyncError && (
            <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{metaSyncError}</div>
          )}

          {crmData ? (
            <div style={{ marginBottom: 14, border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: 14, padding: 12, background: "#f8faff", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMain, marginBottom: 8, letterSpacing: "-0.1px" }}>
                CRM по учениці: {getDisplayName(crmData.student)}
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, display: "grid", gap: 5, lineHeight: 1.35 }}>
                <div><strong>Групи:</strong> {crmData.groups.length ? crmData.groups.map((g) => g.name).join(", ") : "—"}</div>
                <div><strong>Напрямок:</strong> {crmData.direction?.name || "—"}</div>
                <div><strong>Статус абонемента:</strong> {crmData.sub?.status || "—"}</div>
                <div><strong>Залишилось занять:</strong> {crmData.remainingTrainings ?? "—"}</div>
                <div><strong>Кінець абонемента:</strong> {crmData.sub?.endDate || "—"}</div>
                <div><strong>Останнє відвідування:</strong> {crmData.lastAttendanceDate || "—"}</div>
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
                    {m.date ? new Date(m.date).toLocaleString("uk-UA") : "—"}
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
                    border: "1px solid rgba(15, 23, 42, 0.1)",
                    borderRadius: 10,
                    padding: "5px 10px",
                    background: "#f8faff",
                    cursor: "pointer",
                    fontSize: 12,
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
                    background: sendLoading ? theme.textLight : "linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#fff",
                    cursor: sendLoading ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    boxShadow: sendLoading ? "none" : "0 8px 18px rgba(79, 70, 229, 0.25)",
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
