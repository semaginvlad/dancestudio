import React, { useMemo, useState } from "react";
import { theme, DIRECTIONS, inputSt } from "../shared/constants";
import { getDisplayName } from "../shared/utils";
import { getInternalGroupLabel } from "../shared/groupLabels";

export function Modal({open, onClose, title, children, wide, variant}){
  if(!open) return null;
  const isStudentsMobile = variant === "students-mobile";
  const isTrialBookingMobile = variant === "trial-booking-mobile";
  const isPaymentsMobile = variant === "payments-mobile";
  const isAdminMobile = variant === "admin-mobile";
  return(
    <div className={`ds-modal-overlay${isStudentsMobile ? " ds-modal-overlay--students-mobile" : ""}${isTrialBookingMobile ? " ds-modal-overlay--trial-booking-mobile" : ""}${isPaymentsMobile ? " ds-modal-overlay--payments-mobile" : ""}${isAdminMobile ? " ds-modal-overlay--admin-mobile" : ""}`} style={{position:"fixed", inset:0, background:"rgba(31, 31, 31, 0.4)", backdropFilter:"blur(4px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <style>{`
        @media (max-width: 768px) {
          .ds-modal-overlay--trial-booking-mobile { align-items: flex-end !important; padding: max(10px, env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) !important; overflow: hidden !important; }
          .ds-modal-overlay--trial-booking-mobile .ds-modal-panel { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important; max-height: min(88dvh, calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important; border-radius: 18px 18px 0 0 !important; }
          .ds-modal-overlay--trial-booking-mobile .ds-modal-header { padding: 11px 14px 9px !important; flex-shrink: 0; }
          .ds-modal-overlay--trial-booking-mobile .ds-modal-header h3 { font-size: 17px !important; line-height: 1.15 !important; }
          .ds-modal-overlay--trial-booking-mobile .ds-modal-header button { width: 38px !important; height: 38px !important; font-size: 16px !important; }
          .ds-modal-overlay--trial-booking-mobile .ds-modal-body { padding: 10px 12px 0 !important; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form { display: grid; gap: 0; min-width: 0; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form > div { min-width: 0; margin-bottom: 10px !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form label { margin-bottom: 5px !important; font-size: 11px !important; letter-spacing: 0.35px !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form input, .ds-modal-overlay--trial-booking-mobile .trial-booking-form select, .ds-modal-overlay--trial-booking-mobile .trial-booking-form textarea, .ds-modal-overlay--trial-booking-mobile .trial-booking-form [style*="cursor: pointer"] { width: 100% !important; min-width: 0 !important; max-width: 100% !important; height: 42px !important; min-height: 42px !important; padding: 0 12px !important; font-size: 14px !important; border-radius: 13px !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form textarea { height: auto !important; min-height: 54px !important; padding: 10px 12px !important; resize: vertical; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-form-row { grid-template-columns: 1fr !important; gap: 0 !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-mode-actions { gap: 6px !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-mode-actions button { min-height: 40px !important; padding: 0 10px !important; flex: 1 1 130px; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-help { font-size: 11px !important; line-height: 1.3 !important; margin-top: 0 !important; margin-bottom: 8px !important; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-actions { position: sticky; bottom: 0; margin: 0 -12px !important; padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px)) !important; background: ${theme.card}; border-top: 1px solid ${theme.border}; display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px !important; z-index: 2; }
          .ds-modal-overlay--trial-booking-mobile .trial-booking-actions button { min-width: 0; min-height: 46px !important; padding: 0 10px !important; white-space: normal; line-height: 1.15; }
          .ds-modal-overlay--students-mobile { align-items: flex-end !important; padding: max(8px, env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px)) !important; overflow: hidden !important; }
          .ds-modal-overlay--students-mobile .ds-modal-panel { width: calc(100vw - 16px) !important; max-width: none !important; max-height: min(92dvh, calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important; border-radius: 20px 20px 0 0 !important; }
          .ds-modal-overlay--students-mobile .ds-modal-header { padding: 14px 16px 12px !important; flex-shrink: 0; }
          .ds-modal-overlay--students-mobile .ds-modal-header h3 { font-size: 18px !important; }
          .ds-modal-overlay--students-mobile .ds-modal-body { padding: 12px 16px calc(18px + env(safe-area-inset-bottom, 0px)) !important; -webkit-overflow-scrolling: touch; }
          .ds-modal-overlay--students-mobile .student-form-grid, .ds-modal-overlay--students-mobile .student-form-actions { grid-template-columns: 1fr !important; flex-direction: column-reverse !important; align-items: stretch !important; }
          .ds-modal-overlay--students-mobile .student-form-actions button { min-height: 44px !important; width: 100%; }
          .ds-modal-overlay--payments-mobile { align-items: flex-end !important; padding: max(8px, env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px)) !important; overflow: hidden !important; }
          .ds-modal-overlay--payments-mobile .ds-modal-panel { width: calc(100vw - 16px) !important; max-width: none !important; max-height: min(94dvh, calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important; border-radius: 20px 20px 0 0 !important; }
          .ds-modal-overlay--payments-mobile .ds-modal-header { padding: 14px 16px 12px !important; flex-shrink: 0; }
          .ds-modal-overlay--payments-mobile .ds-modal-header h3 { font-size: 18px !important; }
          .ds-modal-overlay--payments-mobile .ds-modal-body { padding: 12px 16px calc(18px + env(safe-area-inset-bottom, 0px)) !important; -webkit-overflow-scrolling: touch; }
          .ds-modal-overlay--payments-mobile form, .ds-modal-overlay--payments-mobile .sub-form-grid, .ds-modal-overlay--payments-mobile .sub-form-actions { grid-template-columns: 1fr !important; flex-direction: column-reverse !important; align-items: stretch !important; }
          .ds-modal-overlay--payments-mobile input, .ds-modal-overlay--payments-mobile select, .ds-modal-overlay--payments-mobile textarea { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
          .ds-modal-overlay--payments-mobile button { min-height: 44px; }
          .ds-modal-overlay--admin-mobile { align-items: flex-end !important; padding: max(8px, env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px)) !important; overflow: hidden !important; }
          .ds-modal-overlay--admin-mobile .ds-modal-panel { width: calc(100vw - 16px) !important; max-width: none !important; max-height: min(94dvh, calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important; border-radius: 20px 20px 0 0 !important; }
          .ds-modal-overlay--admin-mobile .ds-modal-header { padding: 14px 16px 12px !important; flex-shrink: 0; }
          .ds-modal-overlay--admin-mobile .ds-modal-body { padding: 12px 16px calc(18px + env(safe-area-inset-bottom, 0px)) !important; -webkit-overflow-scrolling: touch; }
          .ds-modal-overlay--admin-mobile form, .ds-modal-overlay--admin-mobile [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          .ds-modal-overlay--admin-mobile input, .ds-modal-overlay--admin-mobile select, .ds-modal-overlay--admin-mobile textarea { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
          .ds-modal-overlay--admin-mobile button { min-height: 44px; }
        }
      `}</style>
      <div className="ds-modal-panel" onClick={e=>e.stopPropagation()} style={{background:theme.card, borderRadius:32, width:wide?800:500, maxWidth:"100%", maxHeight:"min(90dvh, 90vh)", overflow:"hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.1)", display:"flex", flexDirection:"column"}}>
        <div className="ds-modal-header" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"24px 32px 16px", borderBottom:`1px solid ${theme.border}`}}>
          <h3 style={{margin:0, fontSize:22, color:theme.textMain, fontWeight:700}}>{title}</h3>
          <button type="button" onClick={onClose} style={{background:theme.input, borderRadius:"50%", width:40, height:40, border:"none", color:theme.textMuted, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 18}}>✕</button>
        </div>
        <div className="ds-modal-body" style={{overflowY:"auto", overflowX:"hidden", minHeight:0, padding:"16px 32px calc(24px + env(safe-area-inset-bottom))"}}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({label, children}){
  return(
    <div style={{marginBottom:18}}>
      <label style={{display:"block", fontSize:12, color:theme.textMuted, marginBottom:8, fontWeight:600, letterSpacing:0.5}}>{label}</label>
      {children}
    </div>
  );
}

export function Badge({color, children}){
  return <span style={{padding:"6px 12px", borderRadius:100, fontSize:12, fontWeight:600, background:`${color}15`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

export function Pill({active, onClick, children, color}){
  return <button type="button" onClick={onClick} style={{padding:"10px 20px", borderRadius:100, fontSize:14, fontWeight:600, cursor:"pointer", background:active?(color||theme.primary):theme.input, color:active?"#fff":theme.textMuted, border:"none", fontFamily:"inherit", transition:"all 0.2s"}}>{children}</button>;
}

export function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt, width:"auto", minWidth:200, cursor:"pointer"}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Усі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{getInternalGroupLabel(g)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function StudentSelectWithSearch({ students, value, onChange, studentGrps, groups }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedStudents = useMemo(() => [...students].sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b),"uk")), [students]);
  const filtered = useMemo(() => sortedStudents.filter(s => getDisplayName(s).toLowerCase().includes(search.toLowerCase())), [sortedStudents, search]);

  const grouped = useMemo(() => {
    const res = {};
    filtered.forEach(s => {
       const sg = studentGrps.find(x => x.studentId === s.id);
       const g = sg ? groups.find(x => x.id === sg.groupId) : null;
       const dirName = g ? (DIRECTIONS.find(d => d.id === g.directionId)?.name || "Інше") : "Без групи / Архів";
       if(!res[dirName]) res[dirName] = [];
       res[dirName].push(s);
    });
    return res;
  }, [filtered, studentGrps, groups]);

  const selectedSt = students.find(s => s.id === value);

  return (
    <div style={{position: 'relative'}}>
      {open && <div style={{position: 'fixed', inset: 0, zIndex: 9}} onClick={() => setOpen(false)}></div>}
      <div onClick={() => setOpen(!open)} style={{...inputSt, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: theme.card, border: `1px solid ${theme.border}`, position: 'relative', zIndex: 10}}>
        {selectedSt ? getDisplayName(selectedSt) : "Оберіть ученицю..."}
        <span style={{fontSize: 10, color: theme.textLight}}>▼</span>
      </div>
      {open && (
        <div style={{position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 11, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, marginTop: 4, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", maxHeight: 350, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <div style={{padding: 12, borderBottom: `1px solid ${theme.border}`, background: theme.bg}}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук за прізвищем..." style={{...inputSt, height: 44, padding: "0 16px"}} />
          </div>
          <div style={{overflowY: 'auto', flex: 1, padding: "8px 0"}}>
            {Object.keys(grouped).length === 0 ? <div style={{padding: 16, color: theme.textLight, textAlign: 'center'}}>Нікого не знайдено</div> : 
              Object.entries(grouped).map(([dir, sts]) => (
                <div key={dir}>
                  <div style={{padding: "8px 16px", fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, background: theme.bg}}>{dir}</div>
                  {sts.map(s => (
                    <div key={s.id} onClick={() => { onChange(s.id); setOpen(false); setSearch(""); }} style={{padding: "12px 16px", cursor: "pointer", background: value === s.id ? `${theme.primary}15` : "transparent", color: value === s.id ? theme.primary : theme.textMain, fontWeight: value === s.id ? 700 : 500, transition: '0.1s', borderBottom: `1px solid ${theme.bg}`}}>
                      {getDisplayName(s)}
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 4. ФОРМИ
