import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";

const styles = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 16,
    alignItems: "stretch",
  },
  card: {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 560,
    display: "flex",
    flexDirection: "column",
  },
  panelHead: {
    padding: "14px 16px",
    borderBottom: `1px solid ${theme.border}`,
    fontWeight: 700,
    color: theme.textMain,
    background: "#fff",
  },
  list: {
    overflowY: "auto",
    flex: 1,
  },
  dialogRow: (active) => ({
    width: "100%",
    textAlign: "left",
    border: "none",
    borderBottom: `1px solid ${theme.bg}`,
    padding: "12px 14px",
    background: active ? `${theme.primary}12` : "#fff",
    cursor: "pointer",
  }),
  msgList: {
    overflowY: "auto",
    flex: 1,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#fff",
  },
  bubble: (isOut) => ({
    alignSelf: isOut ? "flex-end" : "flex-start",
    maxWidth: "78%",
    padding: "10px 12px",
    borderRadius: 12,
    background: isOut ? `${theme.primary}15` : theme.input,
    color: theme.textMain,
    border: `1px solid ${isOut ? `${theme.primary}22` : theme.border}`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  }),
  meta: {
    marginTop: 6,
    fontSize: 11,
    color: theme.textLight,
  },
  helper: {
    padding: 16,
    color: theme.textMuted,
    fontSize: 14,
  },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MessagesTab({ selectedStudentId, selectedStudent }) {
  const [dialogs, setDialogs] = useState([]);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [dialogsError, setDialogsError] = useState("");

  const [selectedDialogId, setSelectedDialogId] = useState("");
  const [selectedDialogTitle, setSelectedDialogTitle] = useState("");

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDialogs = async () => {
      setDialogsLoading(true);
      setDialogsError("");

      try {
        const res = await fetch("/api/telegram-list-dialogs");
        const json = await res.json();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Не вдалося завантажити діалоги");
        }

        const nextDialogs = Array.isArray(json.dialogs) ? json.dialogs : [];
        if (cancelled) return;

        setDialogs(nextDialogs);
        if (nextDialogs.length > 0) {
          setSelectedDialogId((prev) => prev || nextDialogs[0].id);
          setSelectedDialogTitle((prev) => prev || nextDialogs[0].title || "Чат");
        }
      } catch (err) {
        if (cancelled) return;
        setDialogsError(err?.message || "Помилка завантаження діалогів");
      } finally {
        if (!cancelled) setDialogsLoading(false);
      }
    };

    loadDialogs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDialogId) return;

    let cancelled = false;

    const loadMessages = async () => {
      setMessagesLoading(true);
      setMessagesError("");

      try {
        const params = new URLSearchParams({
          chatId: selectedDialogId,
          limit: "60",
        });
        const res = await fetch(`/api/telegram-chat-messages?${params.toString()}`);
        const json = await res.json();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Не вдалося завантажити повідомлення");
        }

        if (cancelled) return;
        const next = Array.isArray(json.messages) ? json.messages : [];
        setMessages(next);
        setSelectedDialogTitle(json?.chat?.title || "Чат");
      } catch (err) {
        if (cancelled) return;
        setMessagesError(err?.message || "Помилка завантаження повідомлень");
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [selectedDialogId]);

  const studentHint = useMemo(() => {
    if (!selectedStudentId) return null;
    if (!selectedStudent) return `ID учениці: ${selectedStudentId}`;
    return `${selectedStudent.name || "Учениця"} (${selectedStudentId})`;
  }, [selectedStudent, selectedStudentId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {studentHint && (
        <div style={{ ...styles.helper, background: `${theme.warning}15`, borderRadius: 14, border: `1px solid ${theme.warning}40` }}>
          Обрана учениця: <strong>{studentHint}</strong>
        </div>
      )}

      <div style={styles.wrap}>
        <section style={styles.card}>
          <div style={styles.panelHead}>Telegram діалоги</div>
          <div style={styles.list}>
            {dialogsLoading && <div style={styles.helper}>Завантаження діалогів…</div>}
            {!dialogsLoading && dialogsError && <div style={{ ...styles.helper, color: theme.danger }}>{dialogsError}</div>}
            {!dialogsLoading && !dialogsError && dialogs.length === 0 && <div style={styles.helper}>Діалогів поки немає.</div>}

            {!dialogsLoading && !dialogsError && dialogs.map((dialog) => (
              <button
                key={dialog.id}
                style={styles.dialogRow(selectedDialogId === dialog.id)}
                onClick={() => {
                  setSelectedDialogId(dialog.id);
                  setSelectedDialogTitle(dialog.title || "Чат");
                }}
              >
                <div style={{ fontWeight: 700, color: theme.textMain }}>{dialog.title || "Без назви"}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: theme.textLight }}>{dialog.username || `id: ${dialog.id}`}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.panelHead}>{selectedDialogTitle || "Повідомлення"}</div>
          <div style={styles.msgList}>
            {!selectedDialogId && <div style={styles.helper}>Оберіть діалог зліва.</div>}
            {selectedDialogId && messagesLoading && <div style={styles.helper}>Завантаження повідомлень…</div>}
            {selectedDialogId && !messagesLoading && messagesError && <div style={{ ...styles.helper, color: theme.danger }}>{messagesError}</div>}
            {selectedDialogId && !messagesLoading && !messagesError && messages.length === 0 && (
              <div style={styles.helper}>У цьому чаті ще немає повідомлень.</div>
            )}

            {selectedDialogId && !messagesLoading && !messagesError && messages.map((msg) => (
              <div key={msg.id} style={styles.bubble(Boolean(msg.out))}>
                {msg.text || <span style={{ color: theme.textLight }}>[без тексту]</span>}
                <div style={styles.meta}>{fmtDate(msg.date)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
