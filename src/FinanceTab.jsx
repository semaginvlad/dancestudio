// src/FinanceTab.jsx
import { DIRECTIONS } from "./utils";
import { cardSt, inputSt, btnS, Badge, GroupSelect } from "./ui";

export default function FinanceTab({ 
  analytics, groups, dirMap, 
  finFilterDir, setFinFilterDir, 
  finFilterGroup, setFinFilterGroup, 
  finSortBy, setFinSortBy, 
  finSortOrder, setFinSortOrder, 
  setFinanceDetailItem 
}) {
  let finData = [...analytics.splits];
  if (finFilterDir !== "all") finData = finData.filter(s => s.group.directionId === finFilterDir);
  if (finFilterGroup !== "all") finData = finData.filter(s => s.group.id === finFilterGroup);
  
  finData.sort((a, b) => {
    let valA = finSortBy === "name" ? a.group.name : a[finSortBy];
    let valB = finSortBy === "name" ? b.group.name : b[finSortBy];
    if (valA < valB) return finSortOrder === "asc" ? -1 : 1;
    if (valA > valB) return finSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:30}}>
        <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #14281D)"}}>
          <div style={{fontSize:13,color:"#30D158",textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 600}}>Загалом оплачено</div>
          <div style={{fontSize:36,fontWeight:800,color:"#30D158", marginTop: 8}}>{analytics.totalRev.toLocaleString()} ₴</div>
        </div>
        <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2D1516)"}}>
          <div style={{fontSize:13,color:"#FF453A",textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 600}}>Борги учениць</div>
          <div style={{fontSize:36,fontWeight:800,color:"#FF453A", marginTop: 8}}>{analytics.unpaid.toLocaleString()} ₴</div>
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap", background: "#1C1C1E", padding: 16, borderRadius: 20}}>
        <div style={{flex: 1, display: "flex", gap: 10, minWidth: 300, flexWrap: "wrap"}}>
          <select style={{...inputSt, width: "auto"}} value={finFilterDir} onChange={e=>{setFinFilterDir(e.target.value); setFinFilterGroup("all");}}>
            <option value="all">Всі напрямки</option>
            {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <GroupSelect groups={groups} value={finFilterGroup} onChange={setFinFilterGroup} filterDir={finFilterDir} allowAll={true} />
        </div>
        <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
          <select style={{...inputSt, width: "auto"}} value={finSortBy} onChange={e=>setFinSortBy(e.target.value)}>
            <option value="total">За доходом</option>
            <option value="trainer">За ЗП тренера</option>
            <option value="studio">За доходом студії</option>
            <option value="name">За назвою</option>
          </select>
          <button style={{...btnS, padding: "0 16px", fontSize: 16}} onClick={()=>setFinSortOrder(p=>p==="desc"?"asc":"desc")}>
            {finSortOrder === "desc" ? "⬇" : "⬆"}
          </button>
        </div>
      </div>

      <h3 style={{color:"#fff",fontSize:18,marginBottom:16, fontWeight: 700}}>Деталізація по групах ({finData.length})</h3>
      
      {finData.length === 0 ? <div style={{color:"#8E8E93",padding:40,textAlign:"center"}}>За цими фільтрами немає оплат</div> :
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {finData.map(sp => {
          const dir = dirMap[sp.group.directionId];
          const trainerPct = sp.group.trainerPct;
          const studioPct = 100 - trainerPct;
          
          return (
            <div key={sp.group.id} style={{background: "#1C1C1E", borderRadius: 24, padding: "24px", display: "flex", flexDirection: "column", gap: 20}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12}}>
                <div>
                  <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 6}}>
                    <span style={{color:"#fff",fontWeight:700, fontSize: 18}}>{sp.group.name}</span>
                    <Badge color={dir?.color||"#888"}>{dir?.name}</Badge>
                  </div>
                  <div style={{fontSize: 14, color: "#8E8E93", fontWeight: 500}}>Оплачених абонементів: <strong style={{color: "#fff"}}>{sp.subs.length}</strong></div>
                </div>
                <div style={{textAlign: "right"}}>
                  <div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 600}}>Загальний збір</div>
                  <div style={{fontSize: 26, fontWeight: 800, color: "#fff"}}>{sp.total.toLocaleString()} ₴</div>
                </div>
              </div>
              <div style={{height: 8, width: "100%", display: "flex", borderRadius: 100, overflow: "hidden"}}>
                <div style={{width: `${trainerPct}%`, background: "#0A84FF"}} title="Тренер"></div>
                <div style={{width: `${studioPct}%`, background: "#30D158"}} title="Студія"></div>
              </div>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12}}>
                <div style={{display: "flex", gap: 32}}>
                  <div>
                    <div style={{fontSize:12,color:"#8E8E93", fontWeight: 600}}>Тренер ({trainerPct}%)</div>
                    <div style={{fontSize:20,fontWeight:700,color:"#0A84FF", marginTop: 4}}>{sp.trainer.toLocaleString()} ₴</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,color:"#8E8E93", fontWeight: 600}}>Студія ({studioPct}%)</div>
                    <div style={{fontSize:20,fontWeight:700,color:"#30D158", marginTop: 4}}>{sp.studio.toLocaleString()} ₴</div>
                  </div>
                </div>
                <button style={{...btnS, padding: "12px 20px", background: "#2C2C2E"}} onClick={() => setFinanceDetailItem(sp)}>
                  🧾 Детальний звіт
                </button>
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  );
}
