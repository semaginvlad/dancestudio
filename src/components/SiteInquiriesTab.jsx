import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { btnP, btnS, cardSt, inputSt, theme } from "../shared/constants";
import {
  canEditSiteInquiry,
  filterSiteInquiries,
  getSiteInquiryContactLinks,
  SITE_INQUIRY_EDITABLE_STATUSES,
  SITE_INQUIRY_STATUS_LABELS,
  SITE_INQUIRY_STATUSES,
} from "../shared/siteInquiries";

const fmtDate = (value, withTime = true) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const statusTone = (status) => {
  if (status === "new") return { color: "#fff", background: theme.primary };
  if (status === "in_progress") return { color: "#fff", background: theme.warning };
  if (status === "spam") return { color: "#fff", background: theme.danger };
  if (status.startsWith("converted_")) return { color: "#fff", background: theme.success };
  return { color: theme.textMuted, background: theme.input };
};

const ContactLink = ({ href, children }) => href ? (
  <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ ...btnS, minHeight: 34, padding: "6px 10px", textDecoration: "none", fontSize: 12 }}>
    {children}
  </a>
) : null;

export default function SiteInquiriesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [statusDraft, setStatusDraft] = useState("new");
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await db.fetchSiteInquiries();
      setRows(data);
      setSelectedId((current) => current && data.some((row) => row.id === current) ? current : null);
    } catch (loadError) {
      setError(loadError?.message || String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const newCount = rows.filter((row) => row.status === "new").length;
  const filteredRows = useMemo(() => {
    return filterSiteInquiries(rows, { status: statusFilter, search });
  }, [rows, search, statusFilter]);

  const selected = rows.find((row) => row.id === selectedId) || null;

  const openDetails = (row) => {
    setSelectedId(row.id);
    setStatusDraft(row.status);
    setNoteDraft(row.adminNote || "");
    setError("");
  };

  const save = async () => {
    if (!selected || !canEditSiteInquiry(selected)) return;
    setSaving(true);
    setError("");
    try {
      const updated = await db.updateSiteInquiry(selected.id, {
        status: statusDraft,
        adminNote: noteDraft,
      });
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setStatusDraft(updated.status);
      setNoteDraft(updated.adminNote || "");
    } catch (saveError) {
      setError(saveError?.message || String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="site-inquiries-tab" style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <style>{`
        .site-inquiries-toolbar { display:grid; grid-template-columns:minmax(220px,1fr) 220px auto; gap:8px; }
        .site-inquiries-grid { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(320px,.85fr); gap:12px; align-items:start; }
        .site-inquiry-row { display:grid; grid-template-columns:112px 132px minmax(150px,1fr) minmax(170px,1fr) minmax(130px,.8fr); gap:10px; align-items:center; }
        .site-inquiry-row > * { min-width:0; }
        @media (max-width: 900px) {
          .site-inquiries-grid { grid-template-columns:1fr; }
          .site-inquiries-details { position:fixed; inset:76px 8px calc(8px + env(safe-area-inset-bottom,0px)); z-index:1002; overflow:auto; box-shadow:0 24px 54px rgba(0,0,0,.38); }
        }
        @media (max-width: 768px) {
          .site-inquiries-toolbar { grid-template-columns:1fr 1fr; }
          .site-inquiries-toolbar input { grid-column:1 / -1; }
          .site-inquiry-row { grid-template-columns:1fr auto; gap:5px 8px; }
          .site-inquiry-row .inq-date { grid-column:1; font-size:11px; }
          .site-inquiry-row .inq-status { grid-column:2; grid-row:1 / span 2; }
          .site-inquiry-row .inq-person { grid-column:1; }
          .site-inquiry-row .inq-contact, .site-inquiry-row .inq-direction { grid-column:1 / -1; font-size:12px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: theme.secondary }}>Запити з сайту</h2>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>Окрема CRM-черга майбутніх заявок</div>
        </div>
        <span style={{ borderRadius: 999, padding: "7px 12px", fontWeight: 900, color: newCount ? "#fff" : theme.textMuted, background: newCount ? theme.danger : theme.input }}>
          Нові: {newCount}
        </span>
      </div>

      <div className="site-inquiries-toolbar">
        <input style={inputSt} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук: імʼя, контакт, напрям, коментар" />
        <select style={inputSt} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Усі статуси</option>
          {SITE_INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{SITE_INQUIRY_STATUS_LABELS[status]}</option>)}
        </select>
        <button type="button" style={btnS} onClick={load} disabled={loading}>{loading ? "Оновлення…" : "Оновити"}</button>
      </div>

      {error && <div role="alert" style={{ ...cardSt, padding: 12, borderColor: theme.danger, color: theme.danger }}>{error}</div>}

      <div className="site-inquiries-grid">
        <div style={{ display: "grid", gap: 8 }}>
          {loading && !rows.length ? <div style={{ ...cardSt, padding: 22, color: theme.textMuted }}>Завантаження запитів…</div> : null}
          {!loading && !filteredRows.length ? <div style={{ ...cardSt, padding: 22, color: theme.textMuted }}>Запитів за цими умовами немає.</div> : null}
          {filteredRows.map((row) => {
            const contacts = [row.phone, row.telegram, row.instagram, row.email].filter(Boolean).join(" · ") || "—";
            return (
              <button key={row.id} type="button" className="site-inquiry-row" onClick={() => openDetails(row)} style={{ ...cardSt, padding: 11, width: "100%", textAlign: "left", cursor: "pointer", color: theme.textMain, border: `1px solid ${selectedId === row.id ? theme.primary : theme.border}` }}>
                <span className="inq-date" style={{ color: theme.textMuted, fontSize: 12 }}>{fmtDate(row.createdAt)}</span>
                <span className="inq-status" style={{ ...statusTone(row.status), borderRadius: 999, padding: "5px 8px", fontSize: 11, fontWeight: 900, textAlign: "center" }}>{SITE_INQUIRY_STATUS_LABELS[row.status]}</span>
                <span className="inq-person" style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                <span className="inq-contact" style={{ color: theme.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>{contacts}</span>
                <span className="inq-direction" style={{ color: theme.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>{row.directionName || row.groupName || "Без напрямку"}</span>
              </button>
            );
          })}
        </div>

        {selected && (() => {
          const links = getSiteInquiryContactLinks(selected);
          const editable = canEditSiteInquiry(selected);
          return (
            <aside className="site-inquiries-details" style={{ ...cardSt, padding: 16, display: "grid", gap: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div><div style={{ fontSize: 19, fontWeight: 900 }}>{selected.name}</div><div style={{ color: theme.textMuted, fontSize: 12 }}>{fmtDate(selected.createdAt)}</div></div>
                <button type="button" style={{ ...btnS, minHeight: 34, padding: "5px 10px" }} onClick={() => setSelectedId(null)}>Закрити</button>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <ContactLink href={links.phone}>📞 {selected.phone}</ContactLink>
                <ContactLink href={links.email}>✉️ {selected.email}</ContactLink>
                <ContactLink href={links.telegram}>Telegram</ContactLink>
                <ContactLink href={links.instagram}>Instagram</ContactLink>
              </div>

              <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
                <div><b>Напрям:</b> {selected.directionName || "—"}</div>
                <div><b>Група:</b> {selected.groupName || "—"}</div>
                <div><b>Тренер:</b> {selected.trainerName || "—"}</div>
                <div><b>Бажаний контакт:</b> {selected.preferredContact}</div>
                <div><b>Коментар:</b><div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: theme.textMuted }}>{selected.comment || "—"}</div></div>
                <div><b>Джерело:</b> {selected.source}{selected.sourcePage ? ` · ${selected.sourcePage}` : ""}</div>
                {selected.submissionCount > 1 && <div><b>Повторних надсилань:</b> {selected.submissionCount}</div>}
              </div>

              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>
                Статус
                <select style={inputSt} value={statusDraft} disabled={!editable} onChange={(event) => setStatusDraft(event.target.value)}>
                  {(editable ? SITE_INQUIRY_EDITABLE_STATUSES : [selected.status]).map((status) => <option key={status} value={status}>{SITE_INQUIRY_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>
                Нотатка адміністратора
                <textarea style={{ ...inputSt, minHeight: 100, resize: "vertical" }} maxLength={4000} value={noteDraft} disabled={!editable} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Внутрішня нотатка" />
              </label>
              <button type="button" style={{ ...btnP, opacity: editable ? 1 : 0.6 }} disabled={!editable || saving} onClick={save}>{saving ? "Збереження…" : "Зберегти"}</button>

              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: theme.textMuted, marginBottom: 7 }}>Конвертація — наступний етап</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}>
                  {["У резерв", "На пробне", "Створити ученицю"].map((label) => <button key={label} type="button" style={{ ...btnS, minHeight: 38, padding: 6, fontSize: 11, opacity: 0.5, cursor: "not-allowed" }} disabled title="Буде підключено на наступному етапі">{label}</button>)}
                </div>
              </div>
            </aside>
          );
        })()}
      </div>
    </section>
  );
}
