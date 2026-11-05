import React, { useEffect, useRef, useState } from "react";
import { btnP, inputSt, theme } from "../shared/constants";
import { mergeCatalogIntoPriceDrafts, mergeRoomRatesIntoDrafts, mergeTariffsIntoDrafts } from "../pricingDrafts";

export default function PricingTab({ prices, onSave, studioRooms = [], onSaveStudioRoomHourlyRate, bookingTariffs = [], onSaveBookingTariff, trainers = [], trainerFinancialSettings = [], onSaveTrainerFinancialSetting }) {
  const [drafts, setDrafts] = useState({});
  const dirtyCodesRef = useRef(new Set());
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [tariffDrafts, setTariffDrafts] = useState({});
  const tariffDirtyCodesRef = useRef(new Set());
  const [roomRateDrafts, setRoomRateDrafts] = useState({});
  const roomRateDirtyIdsRef = useRef(new Set());
  const [trainerDrafts, setTrainerDrafts] = useState({});

  useEffect(() => {
    setDrafts((current) => mergeCatalogIntoPriceDrafts(prices, current, dirtyCodesRef.current));
  }, [prices]);

  useEffect(() => {
    setTariffDrafts((current) => mergeTariffsIntoDrafts(bookingTariffs, current, tariffDirtyCodesRef.current));
  }, [bookingTariffs]);

  useEffect(() => {
    setRoomRateDrafts((current) => mergeRoomRatesIntoDrafts(studioRooms, current, roomRateDirtyIdsRef.current));
  }, [studioRooms]);

  useEffect(() => {
    const byTrainer = Object.fromEntries(trainerFinancialSettings.map((row) => [String(row.trainerId), row]));
    setTrainerDrafts(Object.fromEntries(trainers.map((trainer) => [String(trainer.id), {
      individualIncomeEnabled: !!byTrainer[String(trainer.id)]?.individualIncomeEnabled,
      trainerShareUah: Number(byTrainer[String(trainer.id)]?.trainerShareUah || 0),
    }])));
  }, [trainers, trainerFinancialSettings]);

  const save = async (row) => {
    const value = Number(drafts[row.serviceCode]);
    if (!Number.isInteger(value) || value < 0) {
      setMessage("Ціна має бути цілим невід’ємним числом.");
      return;
    }
    setSaving(row.serviceCode);
    setMessage("");
    dirtyCodesRef.current.delete(row.serviceCode);
    try {
      const saved = await onSave(row.serviceCode, value);
      setDrafts((current) => ({ ...current, [row.serviceCode]: String(saved?.priceUah ?? value) }));
      setMessage(`«${row.serviceName}» збережено.`);
    } catch (error) {
      dirtyCodesRef.current.add(row.serviceCode);
      setMessage(error?.message || "Не вдалося зберегти ціну.");
    } finally {
      setSaving("");
    }
  };

  const saveTariff = async (code) => {
    const draft = tariffDrafts[code];
    if (!draft || !draft.label?.trim() || !Number.isInteger(Number(draft.price)) || Number(draft.price) < 0) {
      setMessage("Перевірте назву та невід’ємну цілу ціну тарифу.");
      return;
    }
    setSaving(`tariff:${code}`);
    tariffDirtyCodesRef.current.delete(code);
    try {
      const saved = await onSaveBookingTariff(code, draft);
      setTariffDrafts((current) => ({ ...current, [code]: { ...(saved || draft) } }));
      setMessage(`Тариф «${draft.label}» збережено.`);
    } catch (error) { tariffDirtyCodesRef.current.add(code); setMessage(error?.message || "Не вдалося зберегти тариф."); }
    finally { setSaving(""); }
  };

  const saveRoomRate = async (room) => {
    const id = String(room.id);
    const rate = Number(roomRateDrafts[id]);
    if (!Number.isInteger(rate) || rate < 0) {
      setMessage("Погодинна ставка має бути цілим невід’ємним числом.");
      return;
    }
    setSaving(`room:${id}`);
    setMessage("");
    roomRateDirtyIdsRef.current.delete(id);
    try {
      const savedRate = await onSaveStudioRoomHourlyRate(id, rate);
      setRoomRateDrafts((current) => ({ ...current, [id]: String(savedRate ?? rate) }));
      setMessage(`Ставку для «${room.name}» збережено.`);
    } catch (error) {
      roomRateDirtyIdsRef.current.add(id);
      setMessage(error?.message || "Не вдалося зберегти погодинну ставку.");
    } finally {
      setSaving("");
    }
  };

  const saveTrainerSetting = async (trainerId) => {
    const draft = trainerDrafts[trainerId];
    const share = Number(draft?.trainerShareUah);
    if (!Number.isFinite(share) || share < 0) { setMessage("Частка тренера має бути невід’ємною сумою."); return; }
    setSaving(`trainer:${trainerId}`);
    try {
      await onSaveTrainerFinancialSetting(trainerId, { ...draft, trainerShareUah: share });
      setMessage("Налаштування індивідуального доходу збережено.");
    } catch (error) { setMessage(error?.message || "Не вдалося зберегти налаштування тренера."); }
    finally { setSaving(""); }
  };

  return (
    <section style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 6px", color: theme.textMain }}>Ціни</h2>
      <p style={{ margin: "0 0 18px", color: theme.textMuted }}>Актуальний прайс для нових оплат та абонементів.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {(prices || []).map((row) => (
          <div key={row.serviceCode} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(120px, 180px) auto", gap: 12, alignItems: "center", padding: 14, borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.card }}>
            <label htmlFor={`price-${row.serviceCode}`} style={{ color: theme.textMain, fontWeight: 700 }}>{row.serviceName}</label>
            <div style={{ position: "relative" }}>
              <input id={`price-${row.serviceCode}`} type="number" min="0" step="1" value={drafts[row.serviceCode] ?? ""} onChange={(event) => {
                const value = event.target.value;
                dirtyCodesRef.current.add(row.serviceCode);
                setDrafts((current) => ({ ...current, [row.serviceCode]: value }));
              }} style={{ ...inputSt, paddingRight: 44, width: "100%", boxSizing: "border-box" }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: theme.textMuted }}>грн</span>
            </div>
            <button type="button" style={btnP} disabled={saving === row.serviceCode} onClick={() => save(row)}>{saving === row.serviceCode ? "Збереження…" : "Зберегти"}</button>
          </div>
        ))}
      </div>
      <h3 style={{ margin: "28px 0 6px", color: theme.textMain }}>Погодинна вартість залів</h3>
      <p style={{ margin: "0 0 12px", color: theme.textMuted }}>Ставка конкретного залу для нових бронювань.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {studioRooms.map((room) => { const id = String(room.id); return (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(140px, 190px) auto", gap: 12, alignItems: "center", padding: 14, borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.card }}>
            <label htmlFor={`room-rate-${id}`} style={{ color: theme.textMain, fontWeight: 700 }}>{room.name}</label>
            <div style={{ position: "relative" }}>
              <input id={`room-rate-${id}`} aria-label={`${room.name}, грн / год`} type="number" min="0" step="1" value={roomRateDrafts[id] ?? ""} onChange={(event) => {
                roomRateDirtyIdsRef.current.add(id);
                setRoomRateDrafts((current) => ({ ...current, [id]: event.target.value }));
              }} style={{ ...inputSt, paddingRight: 82, width: "100%", boxSizing: "border-box" }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: theme.textMuted }}>грн / год</span>
            </div>
            <button type="button" style={btnP} disabled={saving === `room:${id}`} onClick={() => saveRoomRate(room)}>{saving === `room:${id}` ? "Збереження…" : "Зберегти"}</button>
          </div>
        ); })}
      </div>
      <h3 style={{ margin: "28px 0 6px", color: theme.textMain }}>Типи резерву / ціни</h3>
      <p style={{ margin: "0 0 12px", color: theme.textMuted }}>Серверні тарифи бронювання. Неактивні типи залишаються в історії.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {bookingTariffs.map((row) => { const code = row.code || row.id; const draft = tariffDrafts[code] || row; return (
          <div key={code} style={{ padding: 14, borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.card, display: "grid", gap: 8 }}>
            <input aria-label={`Назва тарифу ${code}`} style={inputSt} value={draft.label || ""} onChange={(event) => { tariffDirtyCodesRef.current.add(code); setTariffDrafts((current) => ({ ...current, [code]: { ...draft, label: event.target.value } })); }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(90px,1fr))", gap: 8 }}>
              <input aria-label="Ціна" type="number" min="0" step="1" style={inputSt} value={draft.price ?? ""} onChange={(event) => { tariffDirtyCodesRef.current.add(code); setTariffDrafts((current) => ({ ...current, [code]: { ...draft, price: Number(event.target.value) } })); }} />
              <input aria-label="Мінімум людей" type="number" min="1" style={inputSt} value={draft.peopleMin ?? ""} onChange={(event) => { tariffDirtyCodesRef.current.add(code); setTariffDrafts((current) => ({ ...current, [code]: { ...draft, peopleMin: event.target.value === "" ? null : Number(event.target.value) } })); }} />
              <input aria-label="Максимум людей" type="number" min="1" style={inputSt} value={draft.peopleMax ?? ""} onChange={(event) => { tariffDirtyCodesRef.current.add(code); setTariffDrafts((current) => ({ ...current, [code]: { ...draft, peopleMax: event.target.value === "" ? null : Number(event.target.value) } })); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <label><input type="checkbox" checked={draft.isActive !== false} onChange={(event) => { tariffDirtyCodesRef.current.add(code); setTariffDrafts((current) => ({ ...current, [code]: { ...draft, isActive: event.target.checked } })); }} /> Активний</label>
              <button type="button" style={btnP} disabled={saving === `tariff:${code}`} onClick={() => saveTariff(code)}>Зберегти</button>
            </div>
          </div>
        ); })}
      </div>
      <h3 style={{ margin: "28px 0 6px", color: theme.textMain }}>Індивідуальні тренування</h3>
      <p style={{ margin: "0 0 12px", color: theme.textMuted }}>За замовчуванням дохід вимкнений, частка тренера — 0 грн.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {trainers.map((trainer) => { const id = String(trainer.id); const draft = trainerDrafts[id] || { individualIncomeEnabled: false, trainerShareUah: 0 }; return (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) auto minmax(110px,150px) auto", gap: 10, alignItems: "center", padding: 12, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.card }}>
            <b>{trainer.name || [trainer.firstName, trainer.lastName].filter(Boolean).join(" ") || trainer.email}</b>
            <label><input type="checkbox" checked={draft.individualIncomeEnabled} onChange={(event) => setTrainerDrafts((current) => ({ ...current, [id]: { ...draft, individualIncomeEnabled: event.target.checked } }))} /> Увімкнено</label>
            <input aria-label="Частка тренера, грн" type="number" min="0" step="0.01" style={inputSt} value={draft.trainerShareUah} onChange={(event) => setTrainerDrafts((current) => ({ ...current, [id]: { ...draft, trainerShareUah: event.target.value } }))} />
            <button type="button" style={btnP} disabled={saving === `trainer:${id}`} onClick={() => saveTrainerSetting(id)}>Зберегти</button>
          </div>
        ); })}
      </div>
      {message && <div role="status" style={{ marginTop: 14, color: theme.textMuted }}>{message}</div>}
    </section>
  );
}
