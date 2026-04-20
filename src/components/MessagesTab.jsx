import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
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

export default function MessagesTab({ students = [], selectedStudentId = "", onSelectStudent }) {
  const [dialogs, setDialogs] = useState([]);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [dialogsError, setDialogsError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");

  const [selectedChatId, setSelectedChatId] = useState("");

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  const [favoriteChats, setFavoriteChats] = useState({});
  const [needsReplyChats, setNeedsReplyChats] = useState({});
  const [chatNotes, setChatNotes] = useState({});

  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_OPTIONS[0].id);
  const [templateDraft, setTemplateDraft] = useState(TEMPLATE_OPTIONS[0].text);

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

  const dialogsWithStudents = useMemo(() => {
    return dialogs.map((dialog) => {
      const matchedStudent = students.find(
        (s) => normalizeTelegramUsername(s.telegram) === normalizeTelegramUsername(dialog.username),
      ) || null;

      return {
        ...dialog,
        matchedStudent,
      };
    });
  }, [dialogs, students]);

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
  }, [selectedChatId]);

  const selectedDialog = useMemo(
    () => dialogsWithStudents.find((d) => String(d.id) === String(selectedChatId)) || null,
    [dialogsWithStudents, selectedChatId],
  );

  const handleSelectDialog = (dialog) => {
    setSelectedChatId(String(dialog.id));
    if (dialog.matchedStudent?.id) {
      onSelectStudent?.(dialog.matchedStudent.id);
    }
  };

  const selectedChatNote = selectedDialog ? chatNotes[selectedDialog.id] || "" : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
      <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: theme.textMain }}>
          Діалоги Telegram
        </div>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Пошук: title, username, учениця..."
          style={{
            width: "100%",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 10,
            outline: "none",
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
                border: `1px solid ${quickFilter === f.id ? theme.primary : theme.border}`,
                background: quickFilter === f.id ? "#eef2ff" : "#fff",
                color: quickFilter === f.id ? theme.primary : theme.textMain,
                fontWeight: 600,
                fontSize: 12,
                padding: "6px 10px",
                cursor: "pointer",
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 610, overflow: "auto" }}>
            {rankedAndFilteredDialogs.map((dialog) => {
              const active = String(selectedChatId) === String(dialog.id);
              const isFavorite = Boolean(favoriteChats[dialog.id]);
              const needsReply = Boolean(needsReplyChats[dialog.id]);

              return (
                <div
                  key={dialog.id}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                    background: active ? "#eef2ff" : "#fff",
                    padding: 8,
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
                      padding: 2,
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

                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setFavoriteChats((prev) => ({ ...prev, [dialog.id]: !prev[dialog.id] }))}
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: isFavorite ? "#fff7e6" : "#fff",
                      }}
                    >
                      {isFavorite ? "★ Pin" : "☆ Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNeedsReplyChats((prev) => ({ ...prev, [dialog.id]: !prev[dialog.id] }))}
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        cursor: "pointer",
                        background: needsReply ? "#ffecec" : "#fff",
                        color: needsReply ? theme.danger : theme.textMain,
                      }}
                    >
                      {needsReply ? "Потрібна відповідь" : "Без мітки"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>
            {selectedDialog ? `Чат: ${selectedDialog.title}` : "Оберіть діалог"}
          </div>

          {selectedDialog?.matchedStudent && (
            <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 10 }}>
              Учениця: {getDisplayName(selectedDialog.matchedStudent)}
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
                placeholder="Коротка нотатка по діалогу..."
                rows={2}
                style={{
                  width: "100%",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: "8px 10px",
                  resize: "vertical",
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 430, overflow: "auto", paddingRight: 6 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.out ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: m.out ? "#eef2ff" : theme.bg,
                  }}
                >
                  <div style={{ color: theme.textMain, fontSize: 14, whiteSpace: "pre-wrap" }}>
                    {m.text || "(без тексту)"}
                  </div>
                  <div style={{ color: theme.textLight, fontSize: 11, marginTop: 6 }}>
                    {m.date ? new Date(m.date).toLocaleString("uk-UA") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.textMain, marginBottom: 10 }}>
            Шаблони повідомлень (UI)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 10 }}>
            {TEMPLATE_OPTIONS.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setSelectedTemplateId(tpl.id);
                  setTemplateDraft(tpl.text);
                }}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${selectedTemplateId === tpl.id ? theme.primary : theme.border}`,
                  background: selectedTemplateId === tpl.id ? "#eef2ff" : "#fff",
                  textAlign: "left",
                  padding: "8px 10px",
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
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "8px 10px",
              resize: "vertical",
            }}
          />
          <div style={{ color: theme.textLight, fontSize: 12, marginTop: 6 }}>
            Тільки UI-заготовка. Відправка повідомлень не реалізована.
          </div>
        </div>
      </div>
    </div>
  );
}
