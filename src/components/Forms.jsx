import React, { useEffect, useState } from "react";
import { theme, DIRECTIONS, PLAN_TYPES, PAY_METHODS, inputSt, btnP, btnS } from "../shared/constants";
import { addMonth, today, fmt } from "../shared/utils";
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
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

export function SubForm({ initial, onDone, onCancel, students, groups, studentGrps }) {
  const [studentId, setStudentId] = useState(initial?.studentId || "");
  const [groupId, setGroupId] = useState(initial?.groupId || "");
  const [planType, setPlanType] = useState(initial?.planType || "8pack");
  const [startDate, setStartDate] = useState(initial?.startDate || today());
  const [amount, setAmount] = useState(initial?.amount || 1500);
  const [paid, setPaid] = useState(initial?.paid ?? false);
  const [payMethod, setPayMethod] = useState(initial?.payMethod || "card");
  const [discountPct, setDiscountPct] = useState(initial?.discountPct || 0);
  const [discountSource, setDiscountSource] = useState(initial?.discountSource || "studio");
  const [notes, setNotes] = useState(initial?.notes || "");

  // 🆕 Перемикач активації
  // За замовч. true = активувати одразу (стандартний випадок: оплата + відвідування в один день)
  // false = передоплата, активується від першої галочки в журналі
  const [activateNow, setActivateNow] = useState(
    initial?.activationDate ? true : !initial  // для існуючих: дивимось чи activation_date є. для нових: true.
  );

  const plan = PLAN_TYPES.find(p => p.id === planType);
  const basePrice = plan?.price || 0;

  // 🆕 Обчислюємо дату закінчення залежно від активації
  const endDate = activateNow ? addMonth(startDate) : addMonth(startDate);
  // (візуально це однаково — бо якщо не активувати, кінець буде перерахований при першій галочці)

  // 🔧 Перераховуємо amount при зміні planType АБО discountPct (і при редагуванні теж)
  useEffect(() => {
    const p = PLAN_TYPES.find(p => p.id === planType);
    if (p) setAmount(p.price - Math.round(p.price * discountPct / 100));
  }, [planType, discountPct]);

  return (
    <div>
      <Field label="Учениця *"><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></Field>
      <Field label="Група *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <Field label="Тип Абонемента">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", background: theme.card, padding: 16, borderRadius: 20, border: `1px solid ${theme.border}` }}>
          {PLAN_TYPES.map(p => (
            <Pill key={p.id} active={planType === p.id} onClick={() => setPlanType(p.id)}>{p.name} — {p.price}₴</Pill>
          ))}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Дата покупки">
          <input style={{ ...inputSt, cursor: "pointer", height: "52px" }} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()} />
        </Field>
        <Field label={activateNow ? "Кінець (від дати покупки)" : "Кінець (розрахується від першого заняття)"}>
          <div style={{ ...inputSt, background: theme.bg, color: theme.textLight, cursor: "not-allowed", display: "flex", alignItems: "center", height: "52px" }}>
            {activateNow ? fmt(endDate) : "—"}
          </div>
        </Field>
      </div>

      {/* 🆕 Перемикач "Активувати одразу" */}
      <Field label="">
        <div style={{
          background: activateNow ? theme.card : "#FFF9F0",
          border: `1px solid ${activateNow ? theme.border : theme.warning + "40"}`,
          borderRadius: 20,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontSize: 14, fontWeight: 600, color: theme.textMain }}>
            <input type="checkbox" checked={activateNow} onChange={e => setActivateNow(e.target.checked)} style={{ width: 20, height: 20 }} />
            Активувати одразу (від дати покупки)
          </label>
          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, paddingLeft: 32 }}>
            {activateNow
              ? "Абонемент починає діяти з дати покупки. Кінець: 1 місяць від неї. Це стандартний випадок, коли учениця платить і відвідує тренування в той же день."
              : "⚠ Передоплата: абонемент почне діяти від першого відвідування (галочки в журналі). Використовуй, коли учениця купила завчасно, а ходити буде пізніше."
            }
          </div>
        </div>
      </Field>

      <div style={{ background: theme.card, borderRadius: 24, padding: "24px", marginBottom: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Знижка (%)">
            <input style={inputSt} type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value)))} />
          </Field>
          <Field label="Знижка за рахунок">
            <div style={{ display: "flex", gap: 6, background: theme.input, padding: 6, borderRadius: 100 }}>
              <Pill active={discountSource === "studio"} onClick={() => setDiscountSource("studio")}>Студії</Pill>
              <Pill active={discountSource === "trainer"} onClick={() => setDiscountSource("trainer")}>Тренера</Pill>
              <Pill active={discountSource === "split"} onClick={() => setDiscountSource("split")}>50/50</Pill>
            </div>
          </Field>
        </div>
        {discountPct > 0 && (
          <div style={{ fontSize: 14, color: theme.warning, marginTop: 12, fontWeight: 500 }}>
            Початкова ціна: {basePrice}₴ → Знижка -{Math.round(basePrice * discountPct / 100)}₴ → <strong style={{ color: theme.success, fontSize: 18 }}>До сплати: {basePrice - Math.round(basePrice * discountPct / 100)}₴</strong>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Сума до сплати (грн)">
          <input style={{ ...inputSt, color: theme.success, fontWeight: 700, fontSize: 20 }} type="number" min={0} value={amount} onChange={e => setAmount(+e.target.value)} />
        </Field>
        <Field label="Метод оплати">
          <div style={{ display: "flex", gap: 8 }}>
            {PAY_METHODS.map(m => (
              <Pill key={m.id} active={payMethod === m.id} onClick={() => setPayMethod(m.id)}>{m.name}</Pill>
            ))}
          </div>
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 12, color: theme.textMain, cursor: "pointer", fontSize: 16, fontWeight: 600, marginBottom: 24, background: theme.input, padding: "20px 24px", borderRadius: 20 }}>
        <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} style={{ width: 22, height: 22 }} />
        Оплачено
      </label>
      <Field label="Нотатки">
        <textarea style={{ ...inputSt, height: 'auto', padding: '16px 20px', minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, opacity: studentId && groupId ? 1 : .4 }} onClick={() => {
          if (!studentId || !groupId) return;
          onDone({
            studentId, groupId, planType, startDate,
            endDate: activateNow ? addMonth(startDate) : addMonth(startDate),
            // 🆕 activationDate: якщо "активувати одразу" — ставимо startDate;
            // якщо передоплата — залишаємо null (перерахується при першій галочці)
            activationDate: activateNow ? startDate : null,
            totalTrainings: (plan?.trainings || 8),
            usedTrainings: initial?.usedTrainings || 0,
            amount, paid, payMethod, discountPct, discountSource,
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

export function WaitlistForm({ onDone, onCancel, students, groups, studentGrps }) {
  const [studentId, setStudentId] = useState("");
  const [groupId, setGroupId] = useState("");
  return (
    <div>
      <Field label="Учениця *"><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></Field>
      <Field label="В яку групу чекає? *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
        <button type="button" style={{ ...btnP, background: theme.warning, opacity: studentId && groupId ? 1 : .4 }} onClick={() => {
          if (studentId && groupId) onDone({ studentId, groupId, dateAdded: today() })
        }}>
          Додати в резерв
        </button>
      </div>
    </div>
  )
}
