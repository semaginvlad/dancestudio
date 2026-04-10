// src/DashboardTab.jsx
import { DIRECTIONS } from "./utils";
import { cardSt } from "./ui";

export default function DashboardTab({ analytics, activeSubsCount, warnSubsCount, notificationsCount }) {
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:30}}>
        {[{l:"Учениць",v:analytics.totalStudents,s:`${analytics.activeStudents} активних`,c:"#0A84FF"},
          {l:"Абонементів",v:activeSubsCount,s:`${warnSubsCount} закінч.`,c:"#30D158"},
          {l:"Дохід",v:`${analytics.totalRev.toLocaleString()}₴`,s:`${analytics.unpaid.toLocaleString()}₴ неопл.`,c:"#FF9F0A"},
          {l:"Сповіщення",v:notificationsCount,s:"непрочит.",c:"#FF453A"}].map((c,i)=>(
          <div key={i} style={{...cardSt, display: "flex", flexDirection: "column", gap: 6}}>
            <div style={{fontSize:13,color:"#8E8E93",textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 600}}>{c.l}</div>
            <div style={{fontSize:32,fontWeight:800,color:c.c}}>{c.v}</div>
            <div style={{fontSize:13,color:"#8E8E93", fontWeight: 500}}>{c.s}</div>
          </div>
        ))}
      </div>
      
      <h3 style={{color:"#fff",fontSize:18,marginBottom:16, fontWeight: 700}}>Глибока аналітика 🧠</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:30}}>
        <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2C1A35)"}}>
          <div style={{fontSize:13,color:"#E58EED",textTransform:"uppercase", fontWeight: 600}}>LTV (Середній чек)</div>
          <div style={{fontSize:28,fontWeight:800,color:"#fff",margin:"8px 0"}}>{analytics.avgLTV.toLocaleString()} ₴</div>
          <div style={{fontSize:13,color:"#8E8E93"}}>З однієї учениці за весь час</div>
        </div>
        <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #352115)"}}>
          <div style={{fontSize:13,color:"#FF9F0A",textTransform:"uppercase", fontWeight: 600}}>Конверсія з пробного</div>
          <div style={{fontSize:28,fontWeight:800,color:"#fff",margin:"8px 0"}}>{analytics.conversionRate} %</div>
          <div style={{fontSize:13,color:"#8E8E93"}}>Купили повний абонемент</div>
        </div>
      </div>

      <h3 style={{color:"#fff",fontSize:18,marginBottom:16, fontWeight: 700}}>За напрямками</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
        {DIRECTIONS.map(d=>{const data=analytics.byDir[d.id]||{students:0};return(
          <div key={d.id} style={{...cardSt, padding: "18px 24px"}}>
            <div style={{fontSize:13,fontWeight:700,color:d.color, marginBottom: 8}}>{d.name}</div>
            <div style={{fontSize:24,fontWeight:800,color:"#fff"}}>{data.students} <span style={{fontSize: 14, color: "#8E8E93", fontWeight: 500}}>уч.</span></div>
          </div>
        )})}
      </div>
    </div>
  );
}
