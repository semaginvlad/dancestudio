// src/ui.jsx
import { DIRECTIONS } from "./utils";

export const inputSt = { width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #30363d",borderRadius:8,color:"#e6edf3",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit" };
export const btnP = { padding:"10px 20px",background:"#E84855",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" };
export const btnS = { padding:"10px 20px",background:"#21262d",color:"#c9d1d9",border:"1px solid #30363d",borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit" };
export const cardSt = { background:"#161b22",borderRadius:10,padding:"14px 18px" };

export function Modal({open,onClose,title,children,wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1a1a2e",borderRadius:14,padding:"24px 28px",width:wide?700:500,maxWidth:"96vw",maxHeight:"88vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{margin:0,fontSize:18,color:"#fff"}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#666",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({label,children}){
  return(<div style={{marginBottom:12}}><label style={{display:"block",fontSize:11,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:.8}}>{label}</label>{children}</div>);
}

export function Badge({color,children}){
  return <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:`${color}22`,color,border:`1px solid ${color}33`,whiteSpace:"nowrap"}}>{children}</span>;
}

export function Pill({active,onClick,children,color}){
  return <button onClick={onClick} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:active?(color||"#E84855"):"#21262d",color:active?"#fff":"#8892b0",border:`1px solid ${active?"transparent":"#30363d"}`,fontFamily:"inherit",transition:"all .15s"}}>{children}</button>;
}

export function GroupSelect({groups,value,onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt,width:"auto",minWidth:200}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Всі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
