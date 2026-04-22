import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";

const card = {
  border: "1px solid #d7dfeb",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

export default function TrainersTab({
  trainers = [],
  setTrainers,
  trainerGroups = [],
  setTrainerGroups,
  groups = [],
  students = [],
  studentGrps = [],
  subs = [],
  attn = [],
}) {
  const [selectedTrainerId, setSelectedTrainerId] = useState(trainers[0]?.id || "");
  const [draft, setDraft] = useState({ name: "", phone: "", telegram: "", notes: "", isActive: true });
  const [saving, setSaving] = useState(false);

  const selectedTrainer = useMemo(() => trainers.find((t) => t.id === selectedTrainerId) || null, [trainers, selectedTrainerId]);

  useEffect(() => {
    if (!selectedTrainerId && trainers[0]?.id) {
      setSelectedTrainerId(trainers[0].id);
      setDraft({
        name: trainers[0].name || "",
        phone: trainers[0].phone || "",
        telegram: trainers[0].telegram || "",
        notes: trainers[0].notes || "",
        isActive: trainers[0].isActive !== false,
      });
    }
  }, [selectedTrainerId, trainers]);

  const trainerGroupIds = useMemo(
    () => trainerGroups.filter((tg) => tg.trainerId === selectedTrainerId).map((tg) => tg.groupId),
    [trainerGroups, selectedTrainerId]
  );

  const metrics = useMemo(() => {
    if (!selectedTrainerId) return null;
    const groupSet = new Set(trainerGroupIds.map(String));
    const studentIds = new Set(
      studentGrps.filter((sg) => groupSet.has(String(sg.groupId))).map((sg) => String(sg.studentId))
    );
    const activeSubs = subs.filter((s) => groupSet.has(String(s.groupId)) && s.status !== "expired");

    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const trialCount = attn.filter((a) => groupSet.has(String(a.groupId)) && (a.entryType === "trial" || a.guestType === "trial") && String(a.date || "").startsWith(month)).length;
    const singleCount = attn.filter((a) => groupSet.has(String(a.groupId)) && (a.entryType === "single" || a.guestType === "single") && String(a.date || "").startsWith(month)).length;

    const noActiveSub = Array.from(studentIds).filter((studentId) => !activeSubs.some((s) => String(s.studentId) === String(studentId))).length;

    return {
      groups: groupSet.size,
      students: studentIds.size,
      activeSubs: activeSubs.length,
      trials: trialCount,
      singles: singleCount,
      noActiveSub,
      month,
    };
  }, [attn, selectedTrainerId, studentGrps, subs, trainerGroupIds]);

  const beginCreate = () => {
    setSelectedTrainerId("");
    setDraft({ name: "", phone: "", telegram: "", notes: "", isActive: true });
  };

  const beginEdit = () => {
    if (!selectedTrainer) return;
    setDraft({
      name: selectedTrainer.name || "",
      phone: selectedTrainer.phone || "",
      telegram: selectedTrainer.telegram || "",
      notes: selectedTrainer.notes || "",
      isActive: selectedTrainer.isActive !== false,
    });
  };

  const saveTrainer = async () => {
    if (!draft.name.trim()) {
      alert("Вкажи ім'я тренера");
      return;
    }
    setSaving(true);
    try {
      if (selectedTrainer) {
        const updated = await db.updateTrainer(selectedTrainer.id, draft);
        setTrainers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await db.insertTrainer(draft);
        setTrainers((prev) => [created, ...prev]);
        setSelectedTrainerId(created.id);
      }
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти тренера");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = async (groupId, checked) => {
    if (!selectedTrainerId) return;
    try {
      if (checked) {
        const row = await db.upsertTrainerGroup(selectedTrainerId, groupId);
        setTrainerGroups((prev) => {
          if (prev.some((x) => x.trainerId === row.trainerId && x.groupId === row.groupId)) return prev;
          return [...prev, row];
        });
      } else {
        await db.deleteTrainerGroup(selectedTrainerId, groupId);
        setTrainerGroups((prev) => prev.filter((x) => !(x.trainerId === selectedTrainerId && x.groupId === groupId)));
      }
    } catch (e) {
      alert(e?.message || "Не вдалося оновити прив'язку груп");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 16 }}>
      <div style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>Тренери</div>
          <button type="button" onClick={beginCreate} style={{ border: "1px solid #cfd8e5", borderRadius: 10, background: "#f7f9fc", padding: "6px 9px", cursor: "pointer" }}>+ Додати</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 560, overflow: "auto", paddingRight: 2 }}>
          {trainers.map((t) => (
            <button key={t.id} type="button" onClick={() => setSelectedTrainerId(t.id)} style={{ textAlign: "left", border: `1px solid ${selectedTrainerId === t.id ? "#4e7cd1" : "#d3dbe8"}`, borderRadius: 12, background: selectedTrainerId === t.id ? "#edf4ff" : "#fff", padding: "9px 10px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, color: "#1f2a3d" }}>{t.name || "Без імені"}</div>
              <div style={{ fontSize: 11, color: t.isActive ? "#228b59" : "#8a97aa" }}>{t.isActive ? "Активний" : "Неактивний"}</div>
            </button>
          ))}
          {!trainers.length && <div style={{ fontSize: 12, color: "#7d8ba1" }}>Поки немає тренерів.</div>}
        </div>
      </div>

      <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedTrainer?.name || "Новий тренер"}</div>
            {selectedTrainer && <div style={{ fontSize: 12, color: "#6f7e94" }}>ID: {selectedTrainer.id}</div>}
          </div>
          {selectedTrainer && <button type="button" onClick={beginEdit} style={{ border: "1px solid #cfd8e5", borderRadius: 10, background: "#f7f9fc", padding: "7px 10px", cursor: "pointer" }}>Редагувати</button>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 10 }}>
          <input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Ім'я" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
          <input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
          <input value={draft.telegram} onChange={(e) => setDraft((p) => ({ ...p, telegram: e.target.value }))} placeholder="Telegram" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))} /> Активний
          </label>
        </div>
        <textarea value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Нотатки" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px", resize: "vertical" }} />
        <div><button type="button" disabled={saving} onClick={saveTrainer} style={{ border: "none", borderRadius: 10, background: "#3568c6", color: "#fff", padding: "9px 14px", cursor: "pointer", fontWeight: 700 }}>{saving ? "Збереження..." : "Зберегти тренера"}</button></div>

        {selectedTrainer && (
          <>
            <div style={{ borderTop: "1px solid #e1e7f0", paddingTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Прив'язані групи</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 6 }}>
                {groups.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #dde5f0", borderRadius: 9, padding: "6px 8px" }}>
                    <input type="checkbox" checked={trainerGroupIds.includes(g.id)} onChange={(e) => toggleGroup(g.id, e.target.checked)} />
                    <span style={{ fontSize: 12 }}>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e1e7f0", paddingTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>MVP summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 8 }}>
                {[
                  ["Груп", metrics?.groups],
                  ["Учениць", metrics?.students],
                  ["Активні абон.", metrics?.activeSubs],
                  ["Пробні", metrics?.trials],
                  ["Разові", metrics?.singles],
                  ["Без активного", metrics?.noActiveSub],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: "1px solid #dbe3ef", borderRadius: 10, padding: "7px 8px", background: "#f8fbff" }}>
                    <div style={{ fontSize: 11, color: "#7c8ca4" }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#203457" }}>{value ?? 0}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#76859b" }}>Пробні/разові — за календарний місяць {metrics?.month || "—"}.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
