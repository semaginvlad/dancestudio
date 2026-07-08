import React from "react";

const bannerStyle = {
  position: "fixed",
  left: "50%",
  bottom: "calc(16px + env(safe-area-inset-bottom))",
  transform: "translateX(-50%)",
  zIndex: 9999,
  width: "min(560px, calc(100vw - 24px))",
  padding: "12px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(16, 24, 39, 0.96)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.35)",
  color: "#f8fafc",
  backdropFilter: "blur(14px)",
};

const contentStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 900,
  lineHeight: 1.2,
};

const descriptionStyle = {
  margin: "3px 0 0",
  color: "#cbd5e1",
  fontSize: 12,
  lineHeight: 1.35,
};

const actionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const updateButtonStyle = {
  border: 0,
  borderRadius: 999,
  padding: "9px 14px",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(255,255,255,0.12)",
};

const laterButtonStyle = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 999,
  padding: "9px 12px",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  fontWeight: 800,
  cursor: "pointer",
};

export default function AppUpdateBanner({ onUpdate, onDismiss, updating = false }) {
  return (
    <div role="status" aria-live="polite" style={bannerStyle}>
      <div style={contentStyle}>
        <div>
          <h2 style={titleStyle}>Доступне оновлення додатку</h2>
          <p style={descriptionStyle}>Оновіть CRM, щоб отримати останні зміни.</p>
        </div>
        <div style={actionsStyle}>
          <button type="button" style={laterButtonStyle} onClick={onDismiss} disabled={updating}>
            Пізніше
          </button>
          <button type="button" style={updateButtonStyle} onClick={onUpdate} disabled={updating}>
            {updating ? "Оновлення…" : "Оновити"}
          </button>
        </div>
      </div>
    </div>
  );
}
