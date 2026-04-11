const COLORS = {
  latina:     { bg: '#FAECE7', tx: '#993C1D' },
  bachata:    { bg: '#E1F5EE', tx: '#0F6E56' },
  heels:      { bg: '#EEEDFE', tx: '#534AB7' },
  dancehall:  { bg: '#FAEEDA', tx: '#854F0B' },
  jazz:       { bg: '#EAF3DE', tx: '#3B6D11' },
  kpop:       { bg: '#FBEAF0', tx: '#993556' },
  vagitni:    { bg: '#E6F1FB', tx: '#185FA5' },
  individual: { bg: '#F1EFE8', tx: '#5F5E5A' },
  cleaning:   { bg: '#EFEFEF', tx: '#AAAAAA' },
};

const LEGEND = [
  { style: 'latina',     label: 'Латина' },
  { style: 'bachata',    label: 'Бачата' },
  { style: 'heels',      label: 'High heels' },
  { style: 'dancehall',  label: 'Dancehall' },
  { style: 'jazz',       label: 'Jazz-funk' },
  { style: 'kpop',       label: 'K-pop' },
  { style: 'vagitni',    label: 'Вагітні' },
  { style: 'cleaning',   label: 'Прибирання' },
];

// Тижневий розклад — редагуй тут якщо змінюється графік
const SCHEDULE = {
  'Пн': [
    { s: '08:30', e: '09:45', t: 'Прибирання',       st: 'cleaning' },
    { s: '10:00', e: '11:00', t: 'Латина pro',        st: 'latina' },
    { s: '11:00', e: '12:00', t: 'Бачата mix',        st: 'bachata' },
    { s: '13:00', e: '15:15', t: 'Прибирання',        st: 'cleaning' },
    { s: '16:50', e: '17:50', t: 'Латина base',       st: 'latina' },
    { s: '18:00', e: '19:00', t: 'Латина pro',        st: 'latina' },
    { s: '19:10', e: '20:10', t: 'Латина pro',        st: 'latina' },
    { s: '20:20', e: '21:20', t: 'Прибирання',        st: 'cleaning' },
  ],
  'Вт': [
    { s: '09:50', e: '10:50', t: 'Латина base',       st: 'latina' },
    { s: '11:00', e: '12:00', t: 'Бачата base',       st: 'bachata' },
    { s: '17:00', e: '18:00', t: 'Dancehall base',    st: 'dancehall' },
    { s: '18:05', e: '19:05', t: 'Бачата base',    st: 'bachata' },
    { s: '19:15', e: '20:15', t: 'High heels mix',    st: 'heels' },
    { s: '20:20', e: '21:20', t: 'High heels',        st: 'heels' },
  ],
  'Ср': [
    { s: '08:00', e: '09:00', t: 'Прибирання',        st: 'cleaning' },
    { s: '10:00', e: '11:00', t: 'Латина pro',        st: 'latina' },
    { s: '14:00', e: '16:20', t: 'Прибирання',        st: 'cleaning' },
    { s: '18:00', e: '19:00', t: 'Латина pro',        st: 'latina' },
    { s: '19:10', e: '20:10', t: 'Латина pro',        st: 'latina' },
    { s: '20:15', e: '21:15', t: 'Прибирання',        st: 'cleaning' },
  ],
  'Чт': [
    { s: '09:50', e: '10:50', t: 'Латина base',       st: 'latina' },
    { s: '11:00', e: '12:00', t: 'Бачата base',       st: 'bachata' },
    { s: '17:00', e: '18:00', t: 'Dancehall',         st: 'dancehall' },
    { s: '18:05', e: '19:05', t: 'Бачата base',    st: 'bachata' },
    { s: '19:15', e: '20:15', t: 'High heels mix',    st: 'heels' },
    { s: '20:20', e: '21:20', t: 'High heels base',   st: 'heels' },
  ],
  'Пт': [
    { s: '08:00', e: '09:00', t: 'Прибирання',        st: 'cleaning' },
    { s: '10:00', e: '11:00', t: 'Латина pro',        st: 'latina' },
    { s: '11:00', e: '12:00', t: 'Бачата',            st: 'bachata' },
    { s: '13:15', e: '15:30', t: 'Прибирання',        st: 'cleaning' },
    { s: '16:50', e: '17:50', t: 'Латина base',       st: 'latina' },
    { s: '18:00', e: '19:00', t: 'Латина pro',        st: 'latina' },
    { s: '19:10', e: '20:10', t: 'Латина pro',        st: 'latina' },
    { s: '20:15', e: '21:15', t: 'Прибирання',        st: 'cleaning' },
  ],
  'Сб': [
    { s: '14:00', e: '15:00', t: 'Jazz-funk mix',     st: 'jazz' },
    { s: '15:00', e: '16:00', t: 'K-pop',             st: 'kpop' },
  ],
  'Нд': [
    { s: '10:15', e: '12:00', t: 'Вагітні',           st: 'vagitni' },
    { s: '14:00', e: '15:00', t: 'Jazz-funk mix',     st: 'jazz' },
    { s: '15:00', e: '16:00', t: 'K-pop',             st: 'kpop' },
  ],
};

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const START_HOUR = 8;
const END_HOUR = 21.5;
const PX_PER_HOUR = 54;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR;

function pt(t) {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

export default function StudioSchedule() {
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;

  return (
    <div style={s.wrap}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ ...s.grid, minWidth: 560 }}>

          <div style={s.timeHeader} />
          {DAYS.map((day, i) => (
            <div key={day} style={{
              ...s.dayHeader,
              ...(i === todayIndex ? s.dayHeaderToday : {}),
            }}>
              {day}
            </div>
          ))}

          <div style={{ ...s.timeCol, height: TOTAL_HEIGHT }}>
            {Array.from({ length: Math.ceil(END_HOUR) - START_HOUR + 1 }, (_, i) => (
              <div key={i} style={{ ...s.timeLabel, top: i * PX_PER_HOUR }}>
                {START_HOUR + i}:00
              </div>
            ))}
          </div>

          {DAYS.map((day, i) => (
            <div key={day} style={{
              ...s.dayCol,
              height: TOTAL_HEIGHT,
              ...(i === todayIndex ? s.dayColToday : {}),
            }}>
              {Array.from({ length: Math.ceil(END_HOUR) - START_HOUR + 1 }, (_, hi) => (
                <div key={hi} style={{ ...s.hourLine, top: hi * PX_PER_HOUR }} />
              ))}
              {Array.from({ length: Math.ceil(END_HOUR) - START_HOUR }, (_, hi) => (
                <div key={'h' + hi} style={{ ...s.halfLine, top: (hi + 0.5) * PX_PER_HOUR }} />
              ))}
              {(SCHEDULE[day] || []).map((ev, ei) => {
                const sh = pt(ev.s);
                const eh = pt(ev.e);
                const top = Math.max(0, (sh - START_HOUR) * PX_PER_HOUR);
                const height = Math.max(16, (Math.min(eh, END_HOUR) - Math.max(sh, START_HOUR)) * PX_PER_HOUR - 2);
                const col = COLORS[ev.st];
                return (
                  <div key={ei} style={{
                    ...s.event,
                    top, height,
                    background: col.bg,
                    color: col.tx,
                  }}>
                    <div style={s.eventTitle}>{ev.t}</div>
                    {height > 28 && (
                      <div style={s.eventTime}>{ev.s}–{ev.e}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={s.legend}>
        {LEGEND.map(({ style, label }) => (
          <div key={style} style={s.legendItem}>
            <div style={{
              ...s.legendDot,
              background: COLORS[style].bg,
              outline: `1px solid ${COLORS[style].tx}`,
            }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap:           { fontFamily: 'system-ui, sans-serif' },
  grid:           { display: 'grid', gridTemplateColumns: '38px repeat(7, minmax(0, 1fr))', borderTop: '1px solid #eee' },
  timeHeader:     { borderBottom: '1px solid #eee' },
  dayHeader:      { textAlign: 'center', padding: '8px 2px', fontSize: 13, fontWeight: 500, color: '#888', borderBottom: '1px solid #eee', borderLeft: '1px solid #eee' },
  dayHeaderToday: { color: '#3b82f6' },
  timeCol:        { position: 'relative', borderRight: '1px solid #eee' },
  timeLabel:      { position: 'absolute', right: 4, fontSize: 10, color: '#ccc', transform: 'translateY(-50%)', whiteSpace: 'nowrap' },
  dayCol:         { position: 'relative', borderLeft: '1px solid #eee' },
  dayColToday:    { background: '#fafbff' },
  hourLine:       { position: 'absolute', left: 0, right: 0, borderTop: '1px solid #f0f0f0', pointerEvents: 'none' },
  halfLine:       { position: 'absolute', left: 0, right: 0, borderTop: '1px dashed #f5f5f5', pointerEvents: 'none' },
  event:          { position: 'absolute', left: 2, right: 2, borderRadius: 3, padding: '2px 4px', fontSize: 10, lineHeight: 1.3, overflow: 'hidden', boxSizing: 'border-box' },
  eventTitle:     { fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  eventTime:      { fontSize: 9, opacity: 0.75, marginTop: 1 },
  legend:         { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14, paddingTop: 12, borderTop: '1px solid #eee' },
  legendItem:     { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' },
  legendDot:      { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
};
