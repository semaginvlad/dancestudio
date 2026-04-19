import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
import { getDisplayName } from "../shared/utils";

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

  const [selectedChatId, setSelectedChatId] = useState("");

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

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

  useEffect(() => {
    if (!dialogs.length || !selectedStudentId || selectedChatId) {
      return;
    }

    const student = students.find((s) => s.id === selectedStudentId);
    const username = normalizeTelegramUsername(student?.telegram);

    if (!username) return;

    const matchedDialog = dialogs.find(
      (d) => normalizeTelegramUsername(d.username) === username,
    );

    if (matchedDialog?.id) {
      setSelectedChatId(String(matchedDialog.id));
    }
  }, [dialogs, selectedStudentId, selectedChatId, students]);

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
    () => dialogs.find((d) => String(d.id) === String(selectedChatId)) || null,
    [dialogs, selectedChatId],
  );

  const handleSelectDialog = (dialog) => {
    setSelectedChatId(String(dialog.id));

    const matchedStudent = students.find(
      (s) => normalizeTelegramUsername(s.telegram) === normalizeTelegramUsername(dialog.username),
    );

    if (matchedStudent?.id) {
      onSelectStudent?.(matchedStudent.id);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
      <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: theme.textMain }}>
          Діалоги Telegram
        </div>

        {dialogsLoading && <div style={{ color: theme.textMuted }}>Завантаження діалогів…</div>}
        {!dialogsLoading && dialogsError && <div style={{ color: theme.danger }}>{dialogsError}</div>}
        {!dialogsLoading && !dialogsError && dialogs.length === 0 && (
          <div style={{ color: theme.textMuted }}>Немає доступних діалогів.</div>
        )}

        {!dialogsLoading && !dialogsError && dialogs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto" }}>
            {dialogs.map((d) => {
              const active = String(selectedChatId) === String(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectDialog(d)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                    background: active ? "#eef2ff" : "#fff",
                    cursor: "pointer",
                    color: theme.textMain,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <div>{d.title || "Без назви"}</div>
                  <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                    {d.username || `chatId: ${d.id}`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>
          {selectedDialog ? `Чат: ${selectedDialog.title}` : "Оберіть діалог"}
        </div>

        {selectedStudentId && (
          <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
            Учениця: {getDisplayName(students.find((s) => s.id === selectedStudentId) || {})}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 560, overflow: "auto", paddingRight: 6 }}>
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
    </div>
  );
}
