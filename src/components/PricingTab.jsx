import React, { useEffect, useRef, useState } from "react";
import { btnP, inputSt, theme } from "../shared/constants";
import { individualTrainingRateKey, mergeCatalogIntoPriceDrafts, mergeIndividualTrainingRatesIntoDrafts } from "../pricingDrafts";

export default function PricingTab({ prices, onSave, individualTrainingRates = [], onSaveIndividualTrainingRate, trainers = [], trainerFinancialSettings = [], onSaveTrainerFinancialSetting }) {
  const [drafts, setDrafts] = useState({});
  const dirtyCodesRef = useRef(new Set());
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [matrixDrafts, setMatrixDrafts] = useState({});
  const matrixDirtyKeysRef = useRef(new Set());
  const [trainerDrafts, setTrainerDrafts] = useState({});

  useEffect(() => {
    setDrafts((current) => mergeCatalogIntoPriceDrafts(prices, current, dirtyCodesRef.current));
  }, [prices]);

  useEffect(() => {
    setMatrixDrafts((current) => mergeIndividualTrainingRatesIntoDrafts(individualTrainingRates, current, matrixDirtyKeysRef.current));
  }, [individualTrainingRates]);

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

  const saveMatrixRate = async (room, range) => {
    const key = individualTrainingRateKey(room.roomId, range.peopleRangeCode);
    const rate = Number(matrixDrafts[key]);
    if (!Number.isInteger(rate) || rate < 0) {
      setMessage("Тариф має бути цілим невід’ємним числом.");
      return;
    }
    setSaving(`matrix:${key}`);
    setMessage("");
    matrixDirtyKeysRef.current.delete(key);
    try {
      const savedRate = await onSaveIndividualTrainingRate(room.roomId, range.peopleRangeCode, rate);
      setMatrixDrafts((current) => ({ ...current, [key]: String(savedRate ?? rate) }));
      setMessage(`Тариф ${range.peopleRangeLabel} для «${room.roomName}» збережено.`);
    } catch (error) {
      matrixDirtyKeysRef.current.add(key);
      setMessage(error?.message || "Не вдалося зберегти тариф.");
    } finally {
      setSaving("");
    }
  };

  const matrixRooms = Array.from(new Map(individualTrainingRates.map((row) => [String(row.roomId), row])).values());
  const matrixRanges = Array.from(new Map(individualTrainingRates.map((row) => [row.peopleRangeCode, row])).values());

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
      <h3 style={{ margin: "28px 0 6px", color: theme.textMain }}>Тарифи індивідуальних тренувань</h3>
      <p style={{ margin: "0 0 12px", color: theme.textMuted }}>Внутрішня погодинна ставка за залом і діапазоном людей. Резерв залу залишається безкоштовним.</p>
      <div style={{ overflowX: "auto", border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.card }}>
        <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
          <thead><tr><th style={{ padding: 12, textAlign: "left" }}>Кількість людей</th>{matrixRooms.map((room) => <th key={room.roomId} style={{ padding: 12 }}>{room.roomName}</th>)}</tr></thead>
          <tbody>{matrixRanges.map((range) => <tr key={range.peopleRangeCode}>
            <th style={{ padding: 12, textAlign: "left" }}>{range.peopleRangeLabel}</th>
            {matrixRooms.map((room) => { const key = individualTrainingRateKey(room.roomId, range.peopleRangeCode); const isSavingCell = saving === `matrix:${key}`; return <td key={key} style={{ padding: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input aria-label={`${range.peopleRangeLabel}, ${room.roomName}, грн / год`} type="number" min="0" step="1" disabled={isSavingCell} value={matrixDrafts[key] ?? ""} onChange={(event) => { matrixDirtyKeysRef.current.add(key); setMatrixDrafts((current) => ({ ...current, [key]: event.target.value })); }} style={{ ...inputSt, minWidth: 92, width: "100%" }} />
                <button type="button" style={{ ...btnP, padding: "8px 10px" }} disabled={isSavingCell} onClick={() => saveMatrixRate(room, range)}>{isSavingCell ? "…" : "✓"}</button>
              </div>
            </td>; })}
          </tr>)}</tbody>
        </table>
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
