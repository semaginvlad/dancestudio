import React from "react";
import { theme } from "../shared/constants";
import { getDisplayName } from "../shared/utils";

export default function MessagesTab({ students = [], selectedStudentId = "", onSelectStudent }) {
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
      <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: theme.textMain }}>
          Повідомлення / Чати
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto" }}>
          {students.map((st) => {
            const active = selectedStudentId === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectStudent?.(st.id)}
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
                {getDisplayName(st)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>
          {selectedStudent ? `Чат: ${getDisplayName(selectedStudent)}` : "Оберіть ученицю"}
        </div>
        <div style={{ color: theme.textMuted, fontSize: 14 }}>
          Поки що немає інтеграції з Telegram API. Тут буде список чатів, історія і відправка повідомлень.
        </div>
      </div>
    </div>
  );
}
