import React, { useEffect, useState } from "react";
import { theme, DIRECTIONS, PLAN_TYPES, PAY_METHODS, inputSt, btnP, btnS } from "../shared/constants";
import { addMonth, today } from "../shared/utils";
import { Field, GroupSelect, Pill, StudentSelectWithSearch } from "./UI";

export function StudentForm({ initial, onDone, onCancel, studentGrps, groups }) {
  const nameParts = initial?.name ? initial.name.split(' ') : [];
  const initialFirstName = initial?.first_name || nameParts[1] || "";
  const initialLastName = initial?.last_name || nameParts[0] || "";

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initial?.phone || "");
  const [telegram, setTelegram] = useState(initial?.telegram || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [msgTpl, setMsgTpl] = useState(initial?.messageTemplate || initial?.message_template || "");
  const [selGrps, setSelGrps] = useState(() => initial?.id ? studentGrps.filter(sg => sg.studentId === initial.id).map(sg => sg.groupId) : []);

  const toggleGrp = (gid) => setSelGrps(p => p.includes(gid) ? p.filter(g => g !== gid) : [...p, gid]);

  return (
    <div>
      <div className="student-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Прізвище *"><input style={inputSt} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Петренко" /></Field>
        <Field label="Ім'я *"><input style={inputSt} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Олена" /></Field>
      </div>
      <Field label="Телефон"><input style={inputSt} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380..." /></Field>
      <Field label="Telegram"><input style={inputSt} value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="@username" /></Field>
      <Field label="Групи / напрямки">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, background: theme.card, padding: 20, borderRadius: 20, border: `1px solid ${theme.border}` }}>
          {DIRECTIONS.map(d => (
            <div key={d.id}>
              <div style={{ fontSize: 13, color: d.color, fontWeight: 600, marginBottom: 10 }}>{d.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {groups.filter(g => g.directionId === d.id).map(g => (
                  <Pill key={g.id} active={selGrps.includes(g.id)} color={d.color} onClick={() => toggleGrp(g.id)}>{g.name}</Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="Шаблон повідомлення">
        <textarea style={{ ...inputSt, height: 'auto', padding: '16px 20px', minHeight: 80, resize: "vertical" }} value={msgTpl} onChange={e => setMsgTpl(e.target.value)} placeholder="Привіт, {ім'я}! Абонемент у {група} ({напрямок}) закінчився..." />
        <div style={{ fontSize: 12, color: theme.textLight, marginTop: 8 }}>Змінні: {"{ім'я}"}, {"{група}"}, {"{напрямок}"}</div>
      </Field>
      <Field label="Нотатки">
        <textarea style={{ ...inputSt, height: 'auto', padding: '16px 20px', minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
      <div className="student-form-actions" style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24, position: "sticky", bottom: 0, background: theme.card, paddingTop: 12, paddingBottom: "calc(8px + env(safe-area-inset-bottom))", zIndex: 2 }}>
        <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, opacity: (firstName.trim() || lastName.trim()) ? 1 : .4 }} onClick={() => {
          if (!firstName.trim() && !lastName.trim()) return;
          onDone({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            name: [lastName.trim(), firstName.trim()].filter(Boolean).join(' '),
            phone, telegram, notes, message_template: msgTpl, selectedGroups: selGrps
          });
        }}>
          {initial ? "Зберегти зміни" : "Додати ученицю"}
        </button>
      </div>
    </div>
  );
}

export function SubForm({ initial, onDone, onCancel, students, groups, studentGrps, subs = [] }) {
  const [studentId, setStudentId] = useState(initial?.studentId || "");
  const [groupId, setGroupId] = useState(initial?.groupId || "");
  const [planType, setPlanType] = useState(initial?.planType || "8pack");
  const [startDate, setStartDate] = useState(initial?.startDate || today());
  const [amount, setAmount] = useState(initial?.amount || 1500);
  const [paid] = useState(initial?.paid ?? true);
  const [payMethod, setPayMethod] = useState(initial?.payMethod || "card");
  const [discountPct, setDiscountPct] = useState(Number(initial?.discountPct || 0));
  const [discountSource, setDiscountSource] = useState(initial?.discountSource || "studio");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [retrospectiveMode, setRetrospectiveMode] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // 🆕 Перемикач активації
  // За замовч. true = активувати одразу (стандартний випадок: оплата + відвідування в один день)
  // false = передоплата, активується від першої галочки в журналі
  const [activateNow, setActivateNow] = useState(
    initial?.activationDate ? true : !initial  // для існуючих: дивимось чи activation_date є. для нових: true.
  );
  const autoEndDate = addMonth(startDate || today());
  const inferredInitialAutoEndDate = addMonth(initial?.startDate || today());
  const hasInitialManualEndDate = !!(initial?.endDate && initial.endDate !== inferredInitialAutoEndDate);
  const [isEndDateManualOverride, setIsEndDateManualOverride] = useState(hasInitialManualEndDate);
  const [manualEndDate, setManualEndDate] = useState(initial?.endDate || autoEndDate);
  const [manualActivationDate, setManualActivationDate] = useState(initial?.activationDate || "");
  const [manualTotalTrainings, setManualTotalTrainings] = useState(initial?.totalTrainings || 8);
  const [manualUsedTrainings, setManualUsedTrainings] = useState(initial?.usedTrainings || 0);

  const plan = PLAN_TYPES.find(p => p.id === planType);
  const isEditingExisting = Boolean(initial?.id);
  const isLegacyPlanType = !["4pack", "8pack", "12pack"].includes(planType);
  const selectablePlanTypes = PLAN_TYPES.filter((p) => ["4pack", "8pack", "12pack"].includes(p.id));
  const visiblePlanTypes = isEditingExisting && isLegacyPlanType
    ? [PLAN_TYPES.find((p) => p.id === planType), ...selectablePlanTypes].filter(Boolean)
    : selectablePlanTypes;
  const [basePrice, setBasePrice] = useState(Number(initial?.basePrice ?? (plan?.price || 0)));

  // 🆕 Обчислюємо дату закінчення залежно від активації
  const selectedEndDate = isEndDateManualOverride ? manualEndDate : autoEndDate;
  const selectedActivationDate = retrospectiveMode
    ? (manualActivationDate || null)
    : (activateNow ? startDate : null);
  const selectedTotalTrainings = retrospectiveMode ? manualTotalTrainings : (plan?.trainings || 8);
  const selectedUsedTrainings = retrospectiveMode ? manualUsedTrainings : (initial?.usedTrainings || 0);

  const overlaps = subs.filter((s) => {
    if (!studentId || !groupId) return false;
    if (initial?.id && s.id === initial.id) return false;
    if (s.studentId !== studentId || s.groupId !== groupId) return false;

    const aStart = startDate || "0000-00-00";
    const aEnd = selectedEndDate || "9999-12-31";
    const bStart = s.startDate || "0000-00-00";
    const bEnd = s.endDate || addMonth(s.startDate || today());
    return !(aEnd < bStart || aStart > bEnd);
  });

  // 🔧 Перераховуємо amount при зміні planType АБО discountPct (і при редагуванні теж)
  useEffect(() => {
    const p = PLAN_TYPES.find((x) => x.id === planType);
    if (!p) return;
    const nextBase = Number(p.price || 0);
    setBasePrice(nextBase);
    setAmount(nextBase - Math.round((nextBase * Number(discountPct || 0)) / 100));
  }, [planType, discountPct]);

  useEffect(() => {
    if (!isEndDateManualOverride) setManualEndDate(autoEndDate);
  }, [autoEndDate, isEndDateManualOverride]);

  return (
    <div>
      <Field label="Учениця *"><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></Field>
      <Field label="Група *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <Field label="Тип Абонемента">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {visiblePlanTypes.map((p) => {
            const isActive = planType === p.id;
            const isLegacyOption = !["4pack", "8pack", "12pack"].includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanType(p.id)}
                style={{
                  border: `1px solid ${isActive ? theme.primary : theme.border}`,
                  background: isActive ? `${theme.primary}15` : theme.card,
                  borderRadius: 16,
                  padding: "12px 10px",
                  textAlign: "left",
                  cursor: "pointer",
                  minHeight: 88,
                }}
              >
                <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, color: isActive ? theme.primary : theme.textMain }}>
                  {String(p.trainings || "").replace(/[^\d]/g, "") || "•"}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{isLegacyOption ? p.name : "заняття"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: theme.textMain }}>{p.price}₴</div>
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Дата покупки">
          <input style={{ ...inputSt, cursor: "pointer", height: "52px" }} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()} />
        </Field>
        <Field label="Кінець (вручну)">
          <input
            style={{ ...inputSt, cursor: "pointer", height: "52px" }}
            type="date"
            value={manualEndDate}
            onChange={e => {
              const newDate = e.target.value;
              setManualEndDate(newDate);
              setIsEndDateManualOverride(newDate !== autoEndDate);
            }}
            onClick={e => e.target.showPicker && e.target.showPicker()}
          />
        </Field>
      </div>

      {!!overlaps.length && (
        <div style={{ marginBottom: 12, fontSize: 13, color: theme.warning, background: "#fff7ed", border: `1px solid ${theme.warning}55`, borderRadius: 12, padding: "10px 12px" }}>
          ⚠ Є перетин з {overlaps.length} абонемент(ами) цієї учениці у цій групі.
          {!retrospectiveMode ? " Вимкни перетин або увімкни «Ретроспективне внесення»." : " У ретроспективному режимі це дозволено."}
        </div>
      )}

      <div style={{ marginBottom: 16, border: `1px solid ${theme.border}`, borderRadius: 18, background: theme.card }}>
        <button type="button" onClick={() => setShowAdvancedSettings(prev => !prev)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", border: "none", background: "transparent", color: theme.textMain, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <span>Додаткові налаштування</span>
          <span style={{ color: theme.textMuted, fontSize: 14 }}>{showAdvancedSettings ? "▲" : "▼"}</span>
        </button>

        {showAdvancedSettings && (
          <div style={{ padding: "0 16px 16px" }}>
            <Field label="">
              <label style={{ display: "flex", alignItems: "center", gap: 12, color: theme.textMain, cursor: "pointer", fontSize: 14, fontWeight: 600, background: theme.input, padding: "14px 18px", borderRadius: 14 }}>
                <input type="checkbox" checked={retrospectiveMode} onChange={e => setRetrospectiveMode(e.target.checked)} style={{ width: 18, height: 18 }} />
                Ретроспективне внесення
              </label>
            </Field>
            {!retrospectiveMode && <Field label="">
              <div style={{ background: activateNow ? theme.card : "#FFF9F0", border: `1px solid ${activateNow ? theme.border : theme.warning + "40"}`, borderRadius: 20, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontSize: 14, fontWeight: 600, color: theme.textMain }}>
                  <input type="checkbox" checked={activateNow} onChange={e => setActivateNow(e.target.checked)} style={{ width: 20, height: 20 }} />
                  Активувати одразу (від дати покупки)
                </label>
              </div>
            </Field>}
            {retrospectiveMode && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <Field label="Activation Date (вручну)"><input style={{ ...inputSt, cursor: "pointer", height: "52px" }} type="date" value={manualActivationDate} onChange={e => setManualActivationDate(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()} /></Field>
                <Field label="К-сть тренувань"><input style={inputSt} type="number" min={1} value={manualTotalTrainings} onChange={e => setManualTotalTrainings(Math.max(1, +e.target.value || 1))} /></Field>
                <Field label="Використано тренувань"><input style={inputSt} type="number" min={0} value={manualUsedTrainings} onChange={e => setManualUsedTrainings(Math.max(0, +e.target.value || 0))} /></Field>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Знижка (%)"><input style={inputSt} type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value)))} /></Field>
              <Field label="Знижка за рахунок">
                <div style={{ display: "flex", gap: 6, background: theme.input, padding: 6, borderRadius: 100 }}>
                  <Pill active={discountSource === "studio"} onClick={() => setDiscountSource("studio")}>Студії</Pill>
                  <Pill active={discountSource === "trainer"} onClick={() => setDiscountSource("trainer")}>Тренера</Pill>
                  <Pill active={discountSource === "split"} onClick={() => setDiscountSource("split")}>50/50</Pill>
                </div>
              </Field>
            </div>
            {discountSource && Number(discountPct) === 0 && <div style={{ fontSize: 12, color: theme.warning, marginTop: 8 }}>⚠ Обрано сторону знижки, але знижка % = 0. Перевірте, чи потрібно вказати знижку.</div>}
            <Field label="Нотатки"><textarea style={{ ...inputSt, height: "auto", padding: "16px 20px", minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Сума до сплати (грн)">
          <input style={{ ...inputSt, color: theme.success, fontWeight: 700, fontSize: 20 }} type="number" min={0} value={amount} onChange={e => setAmount(+e.target.value)} />
        </Field>
        <Field label="Базова ціна (грн)">
          <input style={inputSt} type="number" min={0} value={basePrice} onChange={e => setBasePrice(Math.max(0, +e.target.value || 0))} />
        </Field>
        <Field label="Метод оплати">
          <div style={{ display: "flex", gap: 8 }}>
            {PAY_METHODS.map(m => (
              <Pill key={m.id} active={payMethod === m.id} onClick={() => setPayMethod(m.id)}>{m.name}</Pill>
            ))}
          </div>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24, position: "sticky", bottom: 0, background: theme.card, paddingTop: 12, paddingBottom: "calc(8px + env(safe-area-inset-bottom))", zIndex: 2 }}>
        <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, opacity: studentId && groupId ? 1 : .4 }} onClick={() => {
          if (!studentId || !groupId) return;
          if (selectedUsedTrainings > selectedTotalTrainings) {
            alert("Використані тренування не можуть перевищувати загальну кількість.");
            return;
          }
          if (overlaps.length && !retrospectiveMode) {
            alert("Є перетин дат з іншим абонементом. Для історичних абонементів увімкни «Ретроспективне внесення».");
            return;
          }
          if (overlaps.length && retrospectiveMode) {
            const ok = window.confirm("Увага: знайдено перетин з іншими абонементами. Зберегти ретроспективний абонемент?");
            if (!ok) return;
          }
          onDone({
            studentId, groupId, planType, startDate,
            endDate: selectedEndDate,
            // Звичайний режим: activationDate від поточної логіки.
            // Ретроспективний режим: повністю ручне введення.
            activationDate: selectedActivationDate,
            totalTrainings: selectedTotalTrainings,
            usedTrainings: selectedUsedTrainings,
            amount, paid: initial?.id ? paid : true, payMethod, discountPct, discountSource,
            basePrice, notes,
            notificationSent: initial?.notificationSent || false
          });
        }}>
          {initial?.id ? "Зберегти зміни" : "Створити абонемент"}
        </button>
      </div>
    </div>
  );
}

export function TrialBookingForm({ initial, onDone, onCancel, students, groups, studentGrps }) {
  const [mode, setMode] = useState(initial?.studentId ? "existing" : "new");
  const [studentId, setStudentId] = useState(initial?.studentId || "");
  const [groupId, setGroupId] = useState(initial?.groupId || "");
  const [trialDate, setTrialDate] = useState(initial?.trialDate || today());
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [telegram, setTelegram] = useState(initial?.telegram || "");
  const [instagram, setInstagram] = useState(initial?.instagram || "");
  const [contact, setContact] = useState(initial?.contact || "");
  const [note, setNote] = useState(initial?.note || "");
  const [source, setSource] = useState(initial?.source || "");
  const selectedStudent = students.find((st) => String(st.id) === String(studentId));
  const displayName = [selectedStudent?.last_name, selectedStudent?.first_name].filter(Boolean).join(" ") || selectedStudent?.name || "";
  const safeName = (name.trim() || (mode === "existing" ? displayName : "")).trim();
  const isReady = Boolean(safeName && groupId && trialDate);
  const submitLabel = initial?.id ? "Зберегти" : "Створити запис";

  useEffect(() => {
    if (mode === "existing" && selectedStudent && !name.trim()) setName(displayName);
  }, [displayName, mode, name, selectedStudent]);

  return (
    <div className="trial-booking-form">
      <Field label="Тип запису">
        <div className="trial-booking-mode-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...btnS, opacity: mode === "new" ? 1 : 0.7 }} onClick={() => setMode("new")}>Новий контакт</button>
          <button type="button" style={{ ...btnS, opacity: mode === "existing" ? 1 : 0.7 }} onClick={() => setMode("existing")}>Існуюча учениця</button>
        </div>
      </Field>

      {mode === "existing" && (
        <Field label="Учениця *">
          <StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} />
        </Field>
      )}

      <Field label="Ім'я *"><input style={inputSt} value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "existing" ? displayName || "Ім'я для запису" : "Олена"} /></Field>
      <div className="trial-booking-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Телефон"><input style={inputSt} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." /></Field>
        <Field label="Telegram"><input style={inputSt} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" /></Field>
      </div>
      <div className="trial-booking-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Instagram"><input style={inputSt} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" /></Field>
        <Field label="Інший контакт"><input style={inputSt} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="будь-який контакт" /></Field>
      </div>

      <div className="trial-booking-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Група *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
        <Field label="Дата пробного *"><input type="date" style={inputSt} value={trialDate} onChange={(e) => setTrialDate(e.target.value)} /></Field>
      </div>
      <Field label="Джерело"><input style={inputSt} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Instagram, Telegram, рекомендація..." /></Field>
      <Field label="Нотатка"><textarea style={{ ...inputSt, height: "auto", padding: "16px 20px", minHeight: 70, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="trial-booking-help" style={{ color: theme.textLight, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>
        Новий контакт створює тільки запис на пробне: без учениці, student_groups, attendance або абонемента.
      </div>
      <div className="trial-booking-actions" style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, opacity: isReady ? 1 : .4 }} onClick={() => {
          if (!isReady) return;
          onDone({
            studentId: mode === "existing" ? studentId : null,
            name: safeName,
            phone: phone.trim(),
            telegram: telegram.trim(),
            instagram: instagram.trim(),
            contact: contact.trim(),
            groupId,
            trialDate,
            status: initial?.status || "new",
            note: note.trim(),
            source: source.trim(),
          });
        }}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function WaitlistForm({ initial, onDone, onCancel, students, groups, studentGrps, directionsList = DIRECTIONS }) {
  const isEditing = Boolean(initial?.id);
  const lockedMode = initial?.studentId ? "existing" : "new";
  const [mode, setMode] = useState(isEditing ? lockedMode : "existing");
  const [studentId, setStudentId] = useState(initial?.studentId || "");
  const [directionId, setDirectionId] = useState(initial?.directionId || "");
  const [groupId, setGroupId] = useState(initial?.groupId || "");
  const [name, setName] = useState(initial?.name || "");
  const [contact, setContact] = useState(initial?.contact || "");
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);
  const filteredGroups = directionId ? groups.filter((g) => String(g.directionId) === String(directionId)) : [];
  const handleDirectionChange = (nextDirectionId) => {
    setDirectionId(nextDirectionId);
    const selectedGroup = groups.find((g) => String(g.id) === String(groupId));
    if (selectedGroup && String(selectedGroup.directionId) !== String(nextDirectionId)) setGroupId("");
  };
  const canSubmit = (mode === "existing" ? studentId : name.trim()) && directionId;
  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    const values = {
      studentId: mode === "existing" ? studentId : null,
      directionId,
      groupId: groupId || null,
      name: name.trim(),
      contact: contact.trim(),
      note: note.trim(),
    };
    if (!isEditing) Object.assign(values, { dateAdded: today(), status: "waiting" });
    setSaving(true);
    try {
      await onDone(values);
    } catch {
      // The modal owner reports persistence errors; keep the form open for retry.
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="waitlist-form">
      <Field label="Тип контакту">
        <div className="waitlist-segmented" style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={isEditing} aria-pressed={mode === "existing"} style={{ ...btnS, opacity: mode === "existing" ? 1 : 0.7 }} onClick={() => setMode("existing")}>Існуюча учениця</button>
          <button type="button" disabled={isEditing} aria-pressed={mode === "new"} style={{ ...btnS, opacity: mode === "new" ? 1 : 0.7 }} onClick={() => setMode("new")}>Новий контакт</button>
        </div>
      </Field>
      {mode === "existing" ? (
        <Field label="Учениця *"><div aria-disabled={isEditing} style={isEditing ? { pointerEvents: "none", opacity: 0.75 } : undefined}><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></div></Field>
      ) : (
        <>
          <Field label="Ім'я *"><input style={inputSt} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Контакт / Instagram"><input style={inputSt} value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        </>
      )}
      <Field label="Напрямок *">
        <select style={{ ...inputSt, cursor: "pointer" }} value={directionId} onChange={(e) => handleDirectionChange(e.target.value)}>
          <option value="">Оберіть напрямок...</option>
          {directionsList.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
        </select>
      </Field>
      <Field label="В яку групу чекає?">
        <select style={{ ...inputSt, cursor: "pointer" }} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!directionId}>
          <option value="">{directionId ? "Будь-яка група цього напрямку" : "Спочатку оберіть напрямок"}</option>
          {filteredGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </Field>
      <Field label="Нотатка"><input style={inputSt} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="waitlist-actions" style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" style={btnS} disabled={saving} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, background: theme.warning, opacity: canSubmit && !saving ? 1 : .4 }} disabled={!canSubmit || saving} onClick={handleSubmit}>
          {saving ? "Збереження…" : isEditing ? "Зберегти" : "Додати в резерв"}
        </button>
      </div>
    </div>
  )
}
