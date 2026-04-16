import React, { useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { getDisplayName } from "../shared/utils";
import { Badge } from "./UI";

export default function ProAnalyticsTab({ proAnalytics }) {
  const [ltvPeriod, setLtvPeriod] = useState(1);
  
  if (!proAnalytics) return <div style={{padding: 40, textAlign: "center", color: theme.textMuted}}>Завантаження аналітики...</div>;
  
  const topSpenders = proAnalytics.topSpenders[ltvPeriod] || [];

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      <div style={cardSt}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12}}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary}}>🏆 Топ клієнтів за прибутком</h3>
          <div style={{display: 'flex', gap: 6, background: theme.input, padding: 4, borderRadius: 100}}>
            {[1, 3, 6, 12].map(m => (
              <button key={m} onClick={() => setLtvPeriod(m)} style={{padding: '6px 16px', borderRadius: 100, border: 'none', background: ltvPeriod === m ? theme.primary : 'transparent', color: ltvPeriod === m ? '#fff' : theme.textMuted, fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: '0.2s'}}>{m} міс.</button>
            ))}
          </div>
        </div>
        {topSpenders.length === 0 ? <div style={{color: theme.textLight, padding: 20}}>Немає даних за цей період</div> : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {topSpenders.map((item, i) => (
              <div key={item.student.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: theme.bg, borderRadius: 16}}>
                <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
                  <div style={{width: 32, height: 32, borderRadius: '50%', background: i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':theme.input, color: i<3?'#fff':theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14}}>{i+1}</div>
                  <div style={{fontWeight: 700, color: theme.textMain, fontSize: 16}}>{getDisplayName(item.student)}</div>
                </div>
                <div style={{fontWeight: 800, color: theme.success, fontSize: 18}}>{item.total.toLocaleString()} ₴</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24}}>
        <div style={{...cardSt, border: `2px solid ${theme.warning}40`}}>
          <h3 style={{margin: 0, fontSize: 18, color: theme.warning, marginBottom: 16}}>📈 Кому вигідно більший абонемент</h3>
          <div style={{fontSize: 13, color: theme.textMuted, marginBottom: 20}}>Ці учениці ходять дуже часто, але купують малі абонементи. Запропонуй їм {8} або {12} занять.</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {proAnalytics.upsellCandidates.length === 0 ? <div style={{color: theme.textLight}}>Немає кандидатів наразі</div> : 
              proAnalytics.upsellCandidates.map((item, i) => (
                <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                  <div style={{fontSize: 12, color: theme.textMuted, marginBottom: 4}}>{item.group.name}</div>
                  <div style={{fontWeight: 700, color: theme.textMain}}>{getDisplayName(item.student)}</div>
                  <div style={{fontSize: 13, color: theme.textMuted, marginTop: 4}}>{item.reason}</div>
                  <div style={{marginTop: 10}}><Badge color={theme.warning}>Запропонувати: {item.suggest}</Badge></div>
                </div>
              ))
            }
          </div>
        </div>

        <div style={{...cardSt, border: `2px solid ${theme.danger}40`}}>
          <h3 style={{margin: 0, fontSize: 18, color: theme.danger, marginBottom: 16}}>🚨 Ризик втрати клієнта (Не були &gt; 10 днів)</h3>
          <div style={{fontSize: 13, color: theme.textMuted, marginBottom: 20}}>У цих дівчат закінчується абонемент (залишилось 0-1 заняття), і вони давно не були. Напиши їм!</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {proAnalytics.churnRisk.length === 0 ? <div style={{color: theme.textLight}}>Усі ходять стабільно!</div> : 
              proAnalytics.churnRisk.map((item, i) => (
                <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                  <div>
                    <div style={{fontSize: 12, color: theme.textMuted, marginBottom: 4}}>{item.group.name}</div>
                    <div style={{fontWeight: 700, color: theme.textMain}}>{getDisplayName(item.student)}</div>
                    <div style={{fontSize: 12, color: theme.danger, marginTop: 4}}>Не була {item.daysSinceLast} днів</div>
                  </div>
                  {item.student.telegram && <a href={`https://t.me/${item.student.telegram.replace('@','')}`} target="_blank" rel="noreferrer" style={{padding: '8px 12px', background: `${theme.danger}15`, color: theme.danger, borderRadius: 10, textDecoration: 'none', fontSize: 12, fontWeight: 700}}>Написати</a>}
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24}}>
        <div style={cardSt}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary, marginBottom: 20}}>🔥 Найпопулярніші дні (за 30 днів)</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {proAnalytics.popularDays.map((item, i) => (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <div style={{width: 40, fontWeight: 800, color: theme.textMuted}}>{item.day}</div>
                <div style={{flex: 1, background: theme.input, borderRadius: 8, height: 24, overflow: 'hidden'}}>
                  <div style={{width: `${Math.max(0, (item.count / (proAnalytics.popularDays[0]?.count || 1)) * 100)}%`, background: theme.primary, height: '100%', borderRadius: 8}}></div>
                </div>
                <div style={{fontWeight: 700, color: theme.textMain, width: 30, textAlign: 'right'}}>{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardSt}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary, marginBottom: 20}}>⭐ Лідери відвідуваності по групах (за 30 днів)</h3>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12}}>
            {proAnalytics.bestAttenders.map((item, i) => (
              <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 600, marginBottom: 8}}>{item.group.name}</div>
                <div style={{fontWeight: 800, color: theme.textMain, fontSize: 15}}>{getDisplayName(item.student)}</div>
                <div style={{fontSize: 13, color: theme.primary, marginTop: 4, fontWeight: 700}}>{item.count} занять</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. ГОЛОВНИЙ ДОДАТОК
