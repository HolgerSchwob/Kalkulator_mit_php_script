import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════
//  CONFIG — zentral, von Cursor aus anpassen / extern importieren
// ═══════════════════════════════════════════════════════
export const DELIVERY_CONFIG = {
  production: {
    standard: { days: 5, label: "Standard",       price: null       },
    express:  { days: 2, label: "Expressproduktion", price: "Aufpreis" },
  },
  shipping: {
    pickup:   { days: 0, label: "Selbstabholung"  },
    standard: { days: 3, label: "Standardversand" },
    express:  { days: 1, label: "Expressversand"  },
  },
  dataCheckBuffer: 1,     // Werktage Datenpuffer
  orderCutoffHour: 14,    // Tagesschluss Auftragsannahme
  // → via Google Calendar API befüllen
  closedDays: [
    "2026-04-03","2026-04-06","2026-05-01",
    "2026-05-14","2026-05-25",
    "2026-12-24","2026-12-25","2026-12-26","2026-12-31",
    "2027-01-01",
  ],
};

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
const isWeekend  = d => d.getDay() === 0 || d.getDay() === 6;
const isHoliday  = d => DELIVERY_CONFIG.closedDays.includes(d.toISOString().slice(0,10));
const isWorkday  = d => !isWeekend(d) && !isHoliday(d);
const today0     = () => { const t = new Date(); t.setHours(0,0,0,0); return t; };
const sameDay    = (a,b) => a && b && a.toDateString() === b.toDateString();
const fmtShort   = d => d.toLocaleDateString("de-DE", { day:"2-digit", month:"short" });
const fmtFull    = d => d.toLocaleDateString("de-DE", { weekday:"short", day:"2-digit", month:"short" });

function addWorkdays(date, n) {
  let d = new Date(date), added = 0;
  const dir = n >= 0 ? 1 : -1;
  while (added < Math.abs(n)) {
    d.setDate(d.getDate() + dir);
    if (isWorkday(d)) added++;
  }
  return d;
}

function workdaysBetween(a, b) {
  if (b < a) return 0;
  let count = 0, d = new Date(a);
  d.setDate(d.getDate() + 1);
  while (d <= b) { if (isWorkday(d)) count++; d.setDate(d.getDate() + 1); }
  return count;
}

// ═══════════════════════════════════════════════════════
//  CORE CALC
// ═══════════════════════════════════════════════════════
function calcRoute(deliveryDate, pk, sk) {
  const C    = DELIVERY_CONFIG;
  const prod = C.production[pk].days;
  const ship = C.shipping[sk].days;
  const total = prod + ship + C.dataCheckBuffer;

  const orderDeadline   = addWorkdays(deliveryDate, -total);
  const productionStart = addWorkdays(orderDeadline,  C.dataCheckBuffer);
  const productionEnd   = addWorkdays(productionStart, prod);
  const shippedOn       = ship > 0 ? addWorkdays(productionEnd, 1) : null;

  return { orderDeadline, productionStart, productionEnd, shippedOn, total, prod, ship };
}

function getAlternatives(deliveryDate) {
  const today = today0();
  const C     = DELIVERY_CONFIG;
  const out   = [];

  for (const [pk] of Object.entries(C.production)) {
    for (const [sk] of Object.entries(C.shipping)) {
      const r = calcRoute(deliveryDate, pk, sk);
      if (r.orderDeadline >= today) {
        const daysLeft = workdaysBetween(today, r.orderDeadline);
        out.push({ pk, sk, r, daysLeft });
      }
    }
  }
  return out.sort((a,b) => a.r.total - b.r.total);
}

function getStatus(deliveryDate, pk, sk) {
  if (!deliveryDate) return { type: "idle" };
  const today = today0();
  const r     = calcRoute(deliveryDate, pk, sk);
  const days  = workdaysBetween(today, r.orderDeadline);

  if (r.orderDeadline < today) return { type: "impossible", alts: getAlternatives(deliveryDate) };
  if (days === 0)              return { type: "today",    r, days };
  if (days === 1)              return { type: "tomorrow", r, days };
  return                              { type: "ok",       r, days };
}

// ═══════════════════════════════════════════════════════
//  DESIGN
// ═══════════════════════════════════════════════════════
const T = {
  bg:      "#0D0C0A",
  panel:   "#131210",
  border:  "#1E1C17",
  borderHi:"#2C2924",
  text:    "#E6DED0",
  muted:   "#635B50",
  faint:   "#1A1815",
  gold:    "#C4AA78",
  red:     "#D95C5C",
  amber:   "#D48C2A",
  green:   "#4BB86E",
  blue:    "#5090D8",
};

// ═══════════════════════════════════════════════════════
//  TOGGLE BUTTONS
// ═══════════════════════════════════════════════════════
function Seg({ options, value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6 }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            flex:1, background: on ? T.gold+"18" : "transparent",
            border:`1px solid ${on ? T.gold+"77" : T.border}`,
            borderRadius:8, padding:"9px 8px", cursor:"pointer",
            transition:"all 0.15s", display:"flex", flexDirection:"column",
            alignItems:"center", gap:4,
          }}>
            <span style={{fontSize:17}}>{o.icon}</span>
            <span style={{fontSize:10, color: on ? T.gold : T.muted,
              fontFamily:"'DM Mono',monospace", letterSpacing:"0.05em"}}>{o.label}</span>
            <span style={{fontSize:9, color: on ? T.gold+"99" : T.faint,
              fontFamily:"'DM Mono',monospace"}}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════
const HL = {
  orderDeadline:   T.red,
  productionStart: T.amber,
  productionEnd:   T.green,
  shippedOn:       T.blue,
};

function Calendar({ selected, onSelect, hlDates }) {
  const today = today0();
  const [vy, setVy] = useState(today.getFullYear());
  const [vm, setVm] = useState(today.getMonth());

  const firstDay = new Date(vy, vm, 1);
  const offset   = (firstDay.getDay() + 6) % 7;
  const daysInM  = new Date(vy, vm+1, 0).getDate();
  const cells    = [
    ...Array(offset).fill(null),
    ...Array.from({length: daysInM}, (_,i) => new Date(vy, vm, i+1)),
  ];

  const mon = new Date(vy, vm, 1).toLocaleDateString("de-DE", {month:"long", year:"numeric"});
  const prevM = () => { if(vm===0){setVm(11);setVy(y=>y-1);}else setVm(m=>m-1); };
  const nextM = () => { if(vm===11){setVm(0);setVy(y=>y+1);}else setVm(m=>m+1); };

  const rangeStart = hlDates?.orderDeadline;
  const rangeEnd   = selected;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={prevM} style={nbtn}>‹</button>
        <span style={{fontSize:11,letterSpacing:"0.1em",color:T.gold,
          textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>{mon}</span>
        <button onClick={nextM} style={nbtn}>›</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
        {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:9,color:T.muted,
            fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",paddingBottom:5}}>{d}</div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((day,i)=>{
          if(!day) return <div key={i}/>;
          const past   = day < today;
          const we     = isWeekend(day);
          const hol    = isHoliday(day);
          const unavail= past||we||hol;
          const sel    = sameDay(day,selected);

          const hlEntry= hlDates && Object.entries(hlDates).find(([,d])=>d&&sameDay(day,d));
          const hlKey  = hlEntry?.[0];
          const hlCol  = hlKey ? HL[hlKey] : null;

          const inRange= !unavail && rangeStart && rangeEnd
            && day>rangeStart && day<rangeEnd;

          let bg="transparent", col=unavail?T.faint:T.text, bord="1px solid transparent";
          if(sel)     { bg=T.gold; col="#0D0C0A"; bord=`1px solid ${T.gold}`; }
          else if(hlCol){ bg=hlCol+"1E"; col=hlCol; bord=`1px solid ${hlCol}44`; }
          else if(inRange){ bg=T.gold+"0C"; }
          if((we||hol)&&!sel) col=T.faint;

          return (
            <button key={i} disabled={unavail} onClick={()=>onSelect(day)} style={{
              background:bg, border:bord, borderRadius:6,
              padding:"5px 0", cursor:unavail?"default":"pointer",
              color:col, fontSize:11, fontFamily:"'DM Mono',monospace",
              transition:"all 0.1s", position:"relative", textAlign:"center",
            }}>
              {day.getDate()}
              {hol&&!we&&<span style={{position:"absolute",top:2,right:2,
                width:3,height:3,borderRadius:"50%",background:T.red,display:"block"}}/>}
              {hlCol&&!sel&&<span style={{position:"absolute",bottom:2,left:"50%",
                transform:"translateX(-50%)",width:3,height:3,
                borderRadius:"50%",background:hlCol,display:"block"}}/>}
            </button>
          );
        })}
      </div>

      <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
        {[{c:T.red,l:"Eingang"},{c:T.amber,l:"Prod. Start"},{c:T.green,l:"Fertig"},{c:T.blue,l:"Versand"}]
          .map(({c,l})=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4,
              fontSize:9,color:T.muted,fontFamily:"'DM Mono',monospace"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:c,display:"inline-block"}}/>
              {l}
            </div>
          ))}
      </div>
    </div>
  );
}

const nbtn = {
  background:"transparent", border:`1px solid ${T.border}`,
  borderRadius:6, color:T.gold, cursor:"pointer",
  width:28, height:28, fontSize:16,
  display:"flex", alignItems:"center", justifyContent:"center",
};

// ═══════════════════════════════════════════════════════
//  TIMELINE
// ═══════════════════════════════════════════════════════
function Timeline({ r, deliveryDate, sk }) {
  const steps = [
    { label:"Auftragseingang",  date:r.orderDeadline,   color:T.red   },
    { label:"Prod. Start",      date:r.productionStart, color:T.amber },
    { label:"Prod. Ende",       date:r.productionEnd,   color:T.green },
    ...(r.shippedOn ? [{label:"Versand", date:r.shippedOn, color:T.blue}] : []),
    { label: sk==="pickup"?"Abholung":"Lieferung", date:deliveryDate, color:T.gold },
  ];

  return (
    <div style={{position:"relative", marginBottom:20}}>
      <div style={{position:"absolute",top:10,left:"4%",right:"4%",height:1,
        background:`linear-gradient(to right,${T.red},${T.gold})`,opacity:0.2}}/>
      <div style={{display:"flex",justifyContent:"space-between",position:"relative"}}>
        {steps.map((s,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",
            flex:1, maxWidth: i===0||i===steps.length-1 ? 72 : undefined}}>
            <div style={{width:20,height:20,borderRadius:"50%",
              border:`2px solid ${s.color}`,background:s.color+"1E",
              display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:s.color}}/>
            </div>
            <div style={{textAlign:"center",marginTop:5}}>
              <div style={{fontSize:10,color:s.color,fontFamily:"'DM Mono',monospace",
                whiteSpace:"nowrap"}}>{fmtShort(s.date)}</div>
              <div style={{fontSize:8,color:T.muted,fontFamily:"'DM Mono',monospace",
                marginTop:1,whiteSpace:"nowrap"}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  DATE CARD
// ═══════════════════════════════════════════════════════
function DateCard({ label, date, dateEnd, color }) {
  return (
    <div style={{background:T.faint, border:`1px solid ${T.border}`,
      borderRadius:8, padding:"10px 12px", borderLeft:`2px solid ${color}`}}>
      <div style={{fontSize:9,color:T.muted,fontFamily:"'DM Mono',monospace",
        letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <div style={{fontSize:18,fontFamily:"'DM Serif Display',serif",color,lineHeight:1.1}}>
        {fmtShort(date)}
      </div>
      {dateEnd && <div style={{fontSize:9,color:T.muted,fontFamily:"'DM Mono',monospace",marginTop:2}}>
        bis {fmtShort(dateEnd)}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  RIGHT PANEL
// ═══════════════════════════════════════════════════════
function ResultPanel({ status, deliveryDate, pk, sk, onApplyAlt }) {
  const C = DELIVERY_CONFIG;

  // IDLE
  if (status.type === "idle") return (
    <div style={{height:"100%",minHeight:280,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",textAlign:"center",gap:10}}>
      <div style={{width:52,height:52,borderRadius:"50%",
        border:`1px dashed ${T.border}`,display:"flex",
        alignItems:"center",justifyContent:"center",fontSize:20}}>📅</div>
      <div style={{fontSize:11,color:T.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
        Wunschtermin im<br/>Kalender wählen
      </div>
    </div>
  );

  // IMPOSSIBLE
  if (status.type === "impossible") return (
    <div style={{animation:"popIn 0.2s ease"}}>
      <div style={{background:T.red+"0F",border:`1px solid ${T.red}33`,
        borderRadius:10,padding:"12px 14px",marginBottom:14,
        display:"flex",gap:10,alignItems:"flex-start"}}>
        <span style={{color:T.red,fontSize:18,lineHeight:1,flexShrink:0}}>✕</span>
        <div>
          <div style={{fontSize:13,color:T.red,fontFamily:"'DM Serif Display',serif",marginBottom:3}}>
            Termin nicht erreichbar
          </div>
          <div style={{fontSize:10,color:T.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.6}}>
            {fmtFull(deliveryDate)} ist mit der aktuellen Konfiguration nicht machbar.
          </div>
        </div>
      </div>

      <div style={{fontSize:9,letterSpacing:"0.13em",color:T.muted,textTransform:"uppercase",
        fontFamily:"'DM Mono',monospace",marginBottom:8}}>Mögliche Alternativen</div>

      {status.alts.length === 0 ? (
        <div style={{fontSize:11,color:T.muted,fontFamily:"'DM Mono',monospace",
          padding:"16px",textAlign:"center",border:`1px dashed ${T.border}`,borderRadius:8}}>
          Kein Termin erreichbar.<br/>Bitte direkt kontaktieren.
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {status.alts.map(alt=>{
            const isExpProd  = alt.pk==="express";
            const isExpShip  = alt.sk==="express";
            const isPickup   = alt.sk==="pickup";
            const urgentLabel= alt.daysLeft===0?"🔥 Heute" : alt.daysLeft===1?"⏰ Morgen" : `${alt.daysLeft} Werktage`;
            return (
              <button key={alt.pk+alt.sk} onClick={()=>onApplyAlt(alt.pk,alt.sk)}
                style={{background:T.faint,border:`1px solid ${T.borderHi}`,
                  borderRadius:8,padding:"11px 13px",cursor:"pointer",textAlign:"left",
                  transition:"border-color 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold+"55"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=T.borderHi}
              >
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",gap:5,marginBottom:5}}>
                      {isExpProd && <span style={{fontSize:9,border:`1px solid ${T.amber}55`,
                        borderRadius:99,padding:"2px 8px",color:T.amber,
                        fontFamily:"'DM Mono',monospace"}}>⚡ Expressproduktion</span>}
                      <span style={{fontSize:9,border:`1px solid ${T.border}`,
                        borderRadius:99,padding:"2px 8px",color:T.muted,
                        fontFamily:"'DM Mono',monospace"}}>
                        {isPickup?"↗ Abholung":isExpShip?"🚀 Expressversand":"📦 Standardversand"}
                      </span>
                    </div>
                    <div style={{fontSize:10,color:T.muted,fontFamily:"'DM Mono',monospace"}}>
                      Deadline: <span style={{color:alt.daysLeft<=1?T.amber:T.text}}>{urgentLabel}</span>
                      {" · "}{alt.r.total} WT gesamt
                    </div>
                  </div>
                  <span style={{fontSize:10,color:T.gold,fontFamily:"'DM Mono',monospace",
                    flexShrink:0,marginLeft:8}}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // OK / TODAY / TOMORROW
  const { r, days, type } = status;
  const urgency = {
    today:    { c:T.amber, icon:"◉", text:`Heute bestellen — bis ${C.orderCutoffHour}:00 Uhr` },
    tomorrow: { c:T.amber, icon:"◎", text:"Deadline morgen früh" },
    ok:       { c:T.green, icon:"○", text:`Noch ${days} Werktage bis Deadline` },
  }[type];

  const cards = [
    { label:"Auftragseingang bis",        date:r.orderDeadline,   color:T.red   },
    { label:"Produktion",                 date:r.productionStart, dateEnd:r.productionEnd, color:T.amber },
    ...(r.shippedOn ? [{label:"Versand",  date:r.shippedOn,        color:T.blue}] : []),
    { label: sk==="pickup"?"Abholbereit":"Lieferung", date:deliveryDate, color:T.gold },
  ];

  return (
    <div style={{animation:"popIn 0.2s ease"}}>
      {/* Urgency */}
      <div style={{display:"flex",alignItems:"center",gap:10,
        background:urgency.c+"0E",border:`1px solid ${urgency.c}2A`,
        borderRadius:8,padding:"9px 13px",marginBottom:16}}>
        <span style={{color:urgency.c,fontSize:14}}>{urgency.icon}</span>
        <span style={{fontSize:11,color:urgency.c,fontFamily:"'DM Mono',monospace"}}>
          {urgency.text}
        </span>
      </div>

      {/* Timeline */}
      <Timeline r={r} deliveryDate={deliveryDate} sk={sk}/>

      {/* Date cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
        {cards.map(c=><DateCard key={c.label} {...c}/>)}
      </div>

      {/* Tags */}
      <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
        {[
          { l:`${C.production[pk].days}T Produktion`, c: pk==="express"?T.amber:T.muted },
          { l: sk==="pickup"?"Abholung":`${C.shipping[sk].days}T Versand`, c: sk==="express"?T.blue:T.muted },
          { l:`${r.total} WT gesamt`, c:T.muted },
        ].map(({l,c})=>(
          <span key={l} style={{fontSize:9,border:`1px solid ${c}44`,background:c+"0E",
            borderRadius:99,padding:"3px 9px",color:c,fontFamily:"'DM Mono',monospace",
            letterSpacing:"0.07em"}}>{l}</span>
        ))}
      </div>

      <button style={{width:"100%",background:T.gold,color:"#0D0C0A",
        border:"none",borderRadius:8,padding:"11px",
        fontSize:11,fontFamily:"'DM Mono',monospace",
        fontWeight:600,letterSpacing:"0.1em",cursor:"pointer"}}>
        Jetzt Anfragen →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  ROOT  — modal-ready
// ═══════════════════════════════════════════════════════
export default function DeliveryCalculator({ asModal=false, onClose }) {
  const C = DELIVERY_CONFIG;
  const [deliveryDate, setDeliveryDate] = useState(null);
  const [pk, setPk] = useState("standard");
  const [sk, setSk] = useState("standard");

  const status = useMemo(() => getStatus(deliveryDate, pk, sk), [deliveryDate, pk, sk]);

  const hlDates = (status.type !== "idle" && status.type !== "impossible")
    ? { orderDeadline:status.r.orderDeadline, productionStart:status.r.productionStart,
        productionEnd:status.r.productionEnd, shippedOn:status.r.shippedOn }
    : null;

  const prodOpts = Object.entries(C.production).map(([k,v])=>({
    key:k, label:v.label, icon:k==="express"?"⚡":"🖨",
    sub:`${v.days} Werktage${v.price?" · "+v.price:""}`,
  }));
  const shipOpts = Object.entries(C.shipping).map(([k,v])=>({
    key:k, label:v.label,
    icon:k==="pickup"?"↗":k==="express"?"🚀":"📦",
    sub:v.days===0?"ab Werk":`${v.days} Werktag${v.days>1?"e":""}`,
  }));

  const inner = (
    <div style={{ background:T.bg, color:T.text,
      fontFamily:"'DM Mono',monospace",
      borderRadius: asModal?14:0,
      width:"100%", maxWidth:800,
      ...(asModal ? {boxShadow:"0 40px 100px #00000099",overflow:"hidden"} : {minHeight:"100vh"}),
    }}>
      {/* ── Header ── */}
      <div style={{padding:"16px 22px 13px",borderBottom:`1px solid ${T.border}`,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:9,letterSpacing:"0.2em",color:T.muted,marginBottom:3}}>
            LIEFERZEITENRECHNER
          </div>
          <div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:T.text}}>
            Wann muss ich bestellen?
          </div>
        </div>
        {asModal && onClose && (
          <button onClick={onClose} style={{background:T.panel,border:`1px solid ${T.border}`,
            borderRadius:6,color:T.muted,cursor:"pointer",
            width:30,height:30,fontSize:17,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{padding:22,display:"grid",
        gridTemplateColumns:"minmax(250px,1fr) minmax(250px,1fr)",gap:22}}>

        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div>
            <div style={{fontSize:9,letterSpacing:"0.13em",color:T.muted,
              textTransform:"uppercase",marginBottom:8}}>Produktionsart</div>
            <Seg options={prodOpts} value={pk} onChange={setPk}/>
          </div>
          <div>
            <div style={{fontSize:9,letterSpacing:"0.13em",color:T.muted,
              textTransform:"uppercase",marginBottom:8}}>Versandart</div>
            <Seg options={shipOpts} value={sk} onChange={setSk}/>
          </div>
          <div style={{height:1,background:T.border}}/>
          <div>
            <div style={{fontSize:9,letterSpacing:"0.13em",color:T.muted,
              textTransform:"uppercase",marginBottom:10}}>Wunschlieferdatum</div>
            <Calendar selected={deliveryDate} onSelect={setDeliveryDate} hlDates={hlDates}/>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{borderLeft:`1px solid ${T.border}`,paddingLeft:22}}>
          <ResultPanel status={status} deliveryDate={deliveryDate}
            pk={pk} sk={sk} onApplyAlt={(np,ns)=>{setPk(np);setSk(ns);}}/>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{padding:"9px 22px 14px",borderTop:`1px solid ${T.border}`,
        display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:9,color:T.muted,fontFamily:"'DM Mono',monospace"}}>
          Annahme täglich bis {C.orderCutoffHour}:00 Uhr · Schließzeiten via Google Calendar
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[{c:T.red,l:"Eingang"},{c:T.amber,l:"Produktion"},
            {c:T.green,l:"Fertig"},{c:T.blue,l:"Versand"},{c:T.gold,l:"Lieferung"}]
            .map(({c,l})=>(
              <div key={l} style={{fontSize:9,color:T.muted,fontFamily:"'DM Mono',monospace",
                display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:c,display:"inline-block"}}/>
                {l}
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  if (asModal) return (
    <div style={{position:"fixed",inset:0,background:"#00000088",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:9999,padding:20,backdropFilter:"blur(6px)"}}>
      {inner}
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.bg};}
        @keyframes popIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        button{font-family:inherit;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${T.faint};border-radius:4px;}
        @media(max-width:580px){
          .two-col{grid-template-columns:1fr !important;}
          .right-col{border-left:none !important;padding-left:0 !important;
            border-top:1px solid ${T.border};padding-top:20px !important;}
        }
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",padding:20,background:T.bg}}>
        {inner}
      </div>
    </>
  );
}

/*
─────────────────────────────────────────────────────────
  USAGE IN CURSOR

  Standalone:
    import DeliveryCalculator from "./lieferzeiten-kalkulator";
    <DeliveryCalculator />

  Als Modal:
    <DeliveryCalculator asModal={true} onClose={() => setOpen(false)} />

  Config zur Laufzeit anpassen:
    import { DELIVERY_CONFIG } from "./lieferzeiten-kalkulator";
    DELIVERY_CONFIG.production.express.days = 1;
    DELIVERY_CONFIG.orderCutoffHour = 12;

  Google Calendar Schließtage (API-Beispiel):
    const events = await fetchGoogleCalendarEvents(CALENDAR_ID);
    DELIVERY_CONFIG.closedDays = events.map(e => e.date);
─────────────────────────────────────────────────────────
*/
