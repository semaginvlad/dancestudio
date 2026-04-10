// src/ui.jsx
import { DIRECTIONS } from "./utils";

// Кольорова палітра в стилі референсів
const bgDark = "#121212";      // Глибокий чорний фон
const cardDark = "#1C1C1E";    // Колір карток (як в iOS)
const inputDark = "#2C2C2E";   // Колір інпутів
const textPrimary = "#FFFFFF";
const textSecondary = "#8E8E93";
const accentOrange = "#FF453A"; // Яскравий помаранчевий як на 1-му скріні

export const inputSt = { 
  width: "100%", 
  padding: "16px 20px", 
  background: inputDark, 
  border: "none", 
  borderRadius: 16, 
  color: textPrimary, 
  fontSize: 15, 
  outline: "none", 
  boxSizing: "border-box", 
  fontFamily: "inherit",
  transition: "all 0.2s"
};

export const btnP = { 
  padding: "14px 24px", 
  background: accentOrange, 
  color: "#fff", 
  border: "none", 
  borderRadius: 18, 
  fontSize: 15, 
  fontWeight: 600, 
  cursor: "pointer", 
  fontFamily: "inherit", 
  boxShadow: "0 4px 14px rgba(255, 69, 58, 0.3)",
  transition: "transform 0.1s, opacity 0.2s" 
};

export const btnS = { 
  padding: "14px 24px", 
  background: inputDark, 
  color: textPrimary, 
  border: "none", 
  borderRadius: 18, 
  fontSize: 15, 
  fontWeight: 600, 
  cursor: "pointer", 
  fontFamily: "inherit"
};

export const cardSt = { 
  background: cardDark, 
  borderRadius: 28, // Велике заокруглення "Bento"
  padding: "24px", 
  border: "none"
};

export function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,.7)", backdropFilter: "blur(5px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background: cardDark, borderRadius: 32, padding: "32px", width: wide ? 700 : 500, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 24}}>
          <h3 style={{margin:0, fontSize:22, color:"#fff", fontWeight: 700}}>{title}</h3>
          <button onClick={onClose} style={{background:"#2C2C2E", borderRadius: "50%", width: 36, height: 36, border:"none", color:"#8E8E93", fontSize:18, cursor:"pointer", display: "flex", alignItems: "center", justifyContent: "center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({label, children}){
  return(
    <div style={{marginBottom: 16}}>
      <label style={{display:"block", fontSize:12, color: textSecondary, marginBottom: 8, fontWeight: 500, marginLeft: 4}}>{label}</label>
      {children}
    </div>
  );
}

export function Badge({color, children}){
  return (
    <span style={{padding:"6px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color: color, whiteSpace:"nowrap"}}>
      {children}
    </span>
  );
}

export function Pill({active, onClick, children, color}){
  return (
    <button onClick={onClick} style={{
      padding: "10px 20px", 
      borderRadius: 100, // Повністю круглі "пігулки"
      fontSize: 14, 
      fontWeight: 600, 
      cursor: "pointer", 
      background: active ? (color || accentOrange) : inputDark, 
      color: active ? "#fff" : textSecondary, 
      border: "none", 
      fontFamily: "inherit", 
      transition: "all .2s"
    }}>
      {children}
    </button>
  );
}

export function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt, width:"auto", minWidth:200, cursor: "pointer", appearance: "none"}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Усі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
