import { useState, useEffect, useCallback, useRef, Fragment } from "react";

const SUPABASE_URL = "https://vpodgzbpkqhkmhlvefnu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwb2RnemJwa3Foa21obHZlZm51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NzAzMTEsImV4cCI6MjA4ODM0NjMxMX0.ve16_iu5Gsv47Au3AInU5-jTvoY3rACEtan6WdcmV9E";
const hdrs = {"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Prefer":"return=representation"};
const SB = p => SUPABASE_URL+"/rest/v1/"+p;
const scoped = (shop,id) => shop+"::"+id;

async function sbGet(table,shop,id){try{const r=await fetch(SB(table)+"?id=eq."+encodeURIComponent(scoped(shop,id)),{headers:hdrs});const d=await r.json();return d&&d.length>0?d[0].data:null;}catch{return null;}}
async function sbUpsert(table,shop,id,data){try{await fetch(SB(table),{method:"POST",headers:{...hdrs,"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({id:scoped(shop,id),data})});}catch{}}
async function sbGetAll(table,shop){try{const r=await fetch(SB(table)+"?id=like."+encodeURIComponent(shop+"::")+"*&order=created_at.desc",{headers:hdrs});const d=await r.json();return Array.isArray(d)?d.map(r=>r.data):[];}catch{return[];}}
async function sbInsert(table,shop,data){try{await fetch(SB(table),{method:"POST",headers:hdrs,body:JSON.stringify({id:scoped(shop,data.id),data})});}catch{}}
async function sbUpdate(table,shop,id,data){try{await fetch(SB(table),{method:"POST",headers:{...hdrs,"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({id:scoped(shop,id),data})});}catch{}}
async function sbGetAllProducts(shop){try{const r=await fetch(SB("products")+"?id=like."+encodeURIComponent(shop+"::")+"*&order=created_at.asc",{headers:hdrs});const d=await r.json();return Array.isArray(d)?d.map(r=>r.data):[];}catch{return[];}}
async function sbInsertProduct(shop,prod){try{await fetch(SB("products"),{method:"POST",headers:hdrs,body:JSON.stringify({id:scoped(shop,prod.id),data:prod})});}catch{}}
async function sbUpdateProduct(shop,prod){try{await fetch(SB("products"),{method:"POST",headers:{...hdrs,"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({id:scoped(shop,prod.id),data:prod})});}catch{}}
async function sbDeleteProduct(shop,id){try{await fetch(SB("products")+"?id=eq."+encodeURIComponent(scoped(shop,id)),{method:"DELETE",headers:hdrs});}catch{}}

async function getNextInvoiceNo(shop){
  const fy=getFinYear(),seqId=shop+"::"+fy;
  try{
    const r1=await fetch(SB("invoice_seq")+"?id=eq."+encodeURIComponent(seqId),{headers:hdrs});
    const existing=await r1.json();let nextSeq;
    if(existing&&existing.length>0){nextSeq=existing[0].seq+1;await fetch(SB("invoice_seq")+"?id=eq."+encodeURIComponent(seqId),{method:"PATCH",headers:{...hdrs,"Prefer":"return=representation"},body:JSON.stringify({seq:nextSeq})});}
    else{nextSeq=1;await fetch(SB("invoice_seq"),{method:"POST",headers:{...hdrs,"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({id:seqId,seq:nextSeq})});}
    return fy+"/"+String(nextSeq).padStart(3,"0");
  }catch{return fy+"/T"+Date.now().toString(36).toUpperCase();}
}

const PAYMENT_MODES=["Cash","UPI","Card","Credit"];
const GST_RATES=[0,5,18];
const defaultSettings={shopName:"MY SHOP",shopTagline:"",shopAddress:"",shopPhone:"",shopEmail:"",gstin:"",stateCode:"",footerNote:"",signoff:"For MY SHOP",gstLow:5,gstHigh:18,gstThreshold:2500,currency:"₹",enableDiscount:true,defaultPaymentMode:"Cash",adminPin:"1234",staffPin:"0000",enableVoice:false};

function fmt(n,cur){return(cur!==undefined?cur:"₹")+Number(n).toFixed(2);}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function getFinYear(){const d=new Date(),y=d.getFullYear(),m=d.getMonth(),s=m>=3?y:y-1;return s+"-"+String(s+1).slice(2);}
function numToWords(n){
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  n=Math.round(n);
  if(n===0)return"Zero";if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");
  if(n<1000)return ones[Math.floor(n/100)]+" Hundred"+(n%100?" "+numToWords(n%100):"");
  if(n<100000)return numToWords(Math.floor(n/1000))+" Thousand"+(n%1000?" "+numToWords(n%1000):"");
  if(n<10000000)return numToWords(Math.floor(n/100000))+" Lakh"+(n%100000?" "+numToWords(n%100000):"");
  return numToWords(Math.floor(n/10000000))+" Crore"+(n%10000000?" "+numToWords(n%10000000):"");
}
function isWithin24Hours(dateStr){return(Date.now()-new Date(dateStr).getTime())<24*60*60*1000;}
function toCSV(rows,cols){const header=cols.map(c=>'"'+c.label+'"').join(",");const body=rows.map(r=>cols.map(c=>'"'+String(r[c.key]||"").replace(/"/g,'""')+'"').join(",")).join("\n");return header+"\n"+body;}
function downloadCSV(content,filename){const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

const inp={padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:8,fontSize:14,width:"100%",boxSizing:"border-box",background:"#fff",outline:"none",transition:"border 0.2s"};
const inpFocus={border:"1px solid #1e3a5f"};
const card={background:"#fff",borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 2px 10px rgba(0,0,0,0.08)",animation:"fadeSlideUp 0.35s ease both"};
const lbl={fontSize:11,fontWeight:700,color:"#6b7280",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.6};
const BDR="1px solid #000";
const tds=e=>({...e,border:BDR,padding:"4px 6px",fontSize:11});

if(typeof document!=="undefined"&&!document.getElementById("no-spinner-style")){
  const s=document.createElement("style");s.id="no-spinner-style";
  s.innerHTML=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    *{box-sizing:border-box;}
    body{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:#f0f2f5;}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
    input[type=number]{-moz-appearance:textfield;}
    @keyframes fadeSlideUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
    @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
    .fb-fade{animation:fadeSlideUp 0.32s ease both;}
    .fb-fadein{animation:fadeIn 0.25s ease both;}
    button{transition:opacity 0.15s,transform 0.1s;}
    button:active{transform:scale(0.97);opacity:0.9;}
    input:focus,select:focus{outline:none;border-color:#1e3a5f !important;}
    .day-row{transition:background 0.15s;border-radius:8px;cursor:pointer;}
    .day-row:hover{background:#f0f2f5;}
  `;
  document.head.appendChild(s);
}

function FInput({style,...props}){
  const [focused,setFocused]=useState(false);
  return <input {...props} onFocus={e=>{setFocused(true);props.onFocus&&props.onFocus(e);}} onBlur={e=>{setFocused(false);props.onBlur&&props.onBlur(e);}} style={{...inp,...style,...(focused?inpFocus:{})}}/>;
}

const GstSelect=({value,onChange})=>(
  <select value={value===null||value===undefined?"default":String(value)} onChange={e=>onChange(e.target.value)} style={{padding:"8px 10px",border:"1px solid #d1d5db",borderRadius:8,fontSize:13,background:"#fff"}}>
    <option value="default">Default</option>
    {GST_RATES.map(v=><option key={v} value={String(v)}>{v}%</option>)}
  </select>
);

function ShopCodeScreen({onEnter}){
  const [screen,setScreen]=useState("enter");
  const [code,setCode]=useState("");
  const [shopName,setShopName]=useState("");
  const [adminPin,setAdminPin]=useState("");
  const [adminPin2,setAdminPin2]=useState("");
  const [err,setErr]=useState("");
  const [checking,setChecking]=useState(false);
  const [registering,setRegistering]=useState(false);

  const checkCode=async()=>{
    const clean=code.trim().toUpperCase().replace(/\s+/g,"");
    if(clean.length<4){setErr("Min 4 characters.");return;}
    setChecking(true);setErr("");
    try{
      const r=await fetch(SB("settings")+"?id=eq."+encodeURIComponent(clean+"::main"),{headers:hdrs});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const d=await r.json();
      if(!Array.isArray(d)||d.length===0){setChecking(false);setScreen("notfound");return;}
    }catch(e){setChecking(false);setErr("Could not connect: "+e.message);return;}
    setChecking(false);onEnter(code.trim().toUpperCase().replace(/\s+/g,""));
  };

  const registerShop=async()=>{
    const clean=code.trim().toUpperCase().replace(/\s+/g,"");
    setErr("");
    if(!shopName.trim()){setErr("Shop name required.");return;}
    if(!adminPin.match(/^\d{4}$/)){setErr("Admin PIN must be 4 digits.");return;}
    if(adminPin!==adminPin2){setErr("PINs do not match.");return;}
    setRegistering(true);
    try{
      const ns={...defaultSettings,shopName:shopName.trim(),adminPin,signoff:"For "+shopName.trim()};
      await fetch(SB("settings"),{method:"POST",headers:{...hdrs,"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({id:clean+"::main",data:ns})});
      await fetch(SB("customers"),{method:"POST",headers:hdrs,body:JSON.stringify({id:clean+"::c1",data:{id:"c1",name:"Walk-in Customer",phone:""}})});
      setRegistering(false);onEnter(clean);
    }catch{setRegistering(false);setErr("Registration failed.");}
  };

  const btnPrimary={width:"100%",padding:"13px 0",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:10};

  if(screen==="notfound")return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:52,marginBottom:8}}>🧵</div>
      <div style={{fontWeight:900,fontSize:28,color:"#fff",marginBottom:24,letterSpacing:1}}>FabricBill</div>
      <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",width:"100%",maxWidth:340,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:8}}>🔍</div>
        <div style={{fontWeight:800,fontSize:16,color:"#1e3a5f",marginBottom:6}}>Shop Not Found</div>
        <div style={{background:"#e0f2fe",borderRadius:8,padding:"6px 12px",fontWeight:800,fontSize:16,color:"#0369a1",letterSpacing:2,marginBottom:10}}>{code.trim().toUpperCase()}</div>
        <div style={{fontSize:13,color:"#6b7280",marginBottom:20}}>No shop registered with this code.</div>
        <button onClick={()=>setScreen("register")} style={{...btnPrimary,background:"#16a34a"}}>🏪 Register This Shop Code</button>
        <button onClick={()=>{setScreen("enter");setErr("");}} style={{...btnPrimary,background:"#f3f4f6",color:"#374151",fontSize:14}}>← Try Different Code</button>
      </div>
    </div>
  );

  if(screen==="register")return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:52,marginBottom:8}}>🧵</div>
      <div style={{fontWeight:900,fontSize:26,color:"#fff",marginBottom:4}}>Register New Shop</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:24,textAlign:"center"}}>Code: <b style={{color:"#fff"}}>{code.trim().toUpperCase()}</b></div>
      <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",width:"100%",maxWidth:340}}>
        <div style={{marginBottom:14}}><label style={lbl}>Shop Name</label><FInput value={shopName} onChange={e=>{setShopName(e.target.value);setErr("");}} placeholder="e.g. MEGHDOOT" autoFocus/></div>
        <div style={{marginBottom:14}}><label style={lbl}>Admin PIN (4 digits)</label><FInput type="password" inputMode="numeric" maxLength={4} value={adminPin} onChange={e=>{setAdminPin(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}} placeholder="****" style={{letterSpacing:8,fontSize:18,width:130}}/></div>
        <div style={{marginBottom:16}}><label style={lbl}>Confirm PIN</label><FInput type="password" inputMode="numeric" maxLength={4} value={adminPin2} onChange={e=>{setAdminPin2(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}} placeholder="****" style={{letterSpacing:8,fontSize:18,width:130}}/></div>
        {err&&<div style={{background:"#fee2e2",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#dc2626",marginBottom:12}}>⚠ {err}</div>}
        <div style={{background:"#f0fdf4",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#166534",marginBottom:16}}>ℹ️ Default Staff PIN is <b>0000</b>. Change it in Settings.</div>
        <button onClick={registerShop} disabled={registering} style={{...btnPrimary,background:registering?"#9ca3af":"#16a34a"}}>{registering?"Creating...":"✅ Create Shop"}</button>
        <button onClick={()=>{setScreen("enter");setErr("");}} style={{...btnPrimary,background:"#f3f4f6",color:"#374151",fontSize:14}}>← Back</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:52,marginBottom:8}}>🧵</div>
      <div style={{fontWeight:900,fontSize:28,color:"#fff",marginBottom:4,letterSpacing:1}}>FabricBill</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:36,textAlign:"center"}}>GST Billing for Fabric Shops</div>
      <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",width:"100%",maxWidth:340}}>
        <label style={lbl}>Shop Code</label>
        <FInput value={code} onChange={e=>{setCode(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&checkCode()} placeholder="e.g. MEGHDOOT2024" style={{fontSize:18,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}} autoFocus/>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:14}}>💡 Enter your shop code exactly as registered.</div>
        {err&&<div style={{background:"#fee2e2",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#dc2626",marginBottom:12}}>⚠ {err}</div>}
        <button onClick={checkCode} disabled={checking} style={{...btnPrimary,background:checking?"#9ca3af":"#1e3a5f",marginBottom:0}}>{checking?"Checking...":"Enter Shop →"}</button>
      </div>
    </div>
  );
}

function LoginScreen({onLogin,settings,shopCode,onChangeShop}){
  const [role,setRole]=useState(null);
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");
  const submit=()=>{
    const correct=role==="admin"?(settings.adminPin||"1234"):(settings.staffPin||"0000");
    if(pin===correct)onLogin(role);else{setErr("Wrong PIN. Try again.");setPin("");}
  };
  useEffect(()=>{if(pin.length===4)submit();},[pin]);
  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:40,marginBottom:4}}>🧵</div>
      <div style={{fontWeight:900,fontSize:22,color:"#fff",marginBottom:2}}>FabricBill</div>
      <div style={{background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 14px",fontSize:13,fontWeight:700,color:"#fff",marginBottom:4}}>🏪 {shopCode}</div>
      <button onClick={onChangeShop} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:11,cursor:"pointer",marginBottom:28}}>← Change Shop</button>
      {!role?(
        <div style={{display:"flex",gap:20}}>
          {[["admin","🔐","Admin","#1e3a5f"],["staff","👤","Staff","#16a34a"]].map(([r,icon,label,bg])=>(
            <button key={r} onClick={()=>{setRole(r);setPin("");setErr("");}} style={{width:136,height:136,borderRadius:18,border:"none",background:bg,color:"#fff",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 6px 20px rgba(0,0,0,0.2)"}}>
              <span style={{fontSize:38}}>{icon}</span><span style={{fontWeight:800,fontSize:16}}>{label}</span>
            </button>
          ))}
        </div>
      ):(
        <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",width:290,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:4,fontWeight:600}}>{role==="admin"?"🔐 Admin":"👤 Staff"} PIN</div>
          <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:16,marginTop:10}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:14,height:14,borderRadius:"50%",background:pin.length>i?"#1e3a5f":"#e5e7eb",transition:"background 0.2s"}}/>)}
          </div>
          {err&&<div style={{color:"#dc2626",fontSize:12,marginBottom:10,background:"#fee2e2",borderRadius:6,padding:"6px 10px"}}>⚠ {err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,justifyItems:"center",marginBottom:12}}>
            {[1,2,3,4,5,6,7,8,9].map(d=>(
              <button key={d} onClick={()=>{if(pin.length<4)setPin(p=>p+String(d));}} style={{width:66,height:66,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#f9fafb",color:"#1e3a5f",fontSize:22,fontWeight:700,cursor:"pointer"}}>{d}</button>
            ))}
            <button onClick={()=>setPin(p=>p.slice(0,-1))} style={{width:66,height:66,borderRadius:"50%",border:"1px solid #fee2e2",background:"#fee2e2",color:"#dc2626",fontSize:20,fontWeight:700,cursor:"pointer"}}>⌫</button>
            <button onClick={()=>{if(pin.length<4)setPin(p=>p+"0");}} style={{width:66,height:66,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#f9fafb",color:"#1e3a5f",fontSize:22,fontWeight:700,cursor:"pointer"}}>0</button>
            <button onClick={submit} style={{width:66,height:66,borderRadius:"50%",border:"none",background:"#1e3a5f",color:"#fff",fontSize:22,fontWeight:700,cursor:"pointer"}}>✓</button>
          </div>
          <button onClick={()=>{setRole(null);setPin("");setErr("");}} style={{background:"none",border:"none",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>← Back</button>
        </div>
      )}
    </div>
  );
}

function VoiceButton({onResult,lang="en-IN"}){
  const [listening,setListening]=useState(false);
  const recRef=useRef(null);
  const start=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice not supported. Use Chrome.");return;}
    const rec=new SR();rec.lang=lang;rec.interimResults=false;rec.maxAlternatives=1;
    rec.onresult=e=>{onResult(e.results[0][0].transcript);setListening(false);};
    rec.onerror=()=>setListening(false);rec.onend=()=>setListening(false);
    recRef.current=rec;rec.start();setListening(true);
  };
  const stop=()=>{recRef.current&&recRef.current.stop();setListening(false);};
  return(
    <button onClick={listening?stop:start} style={{width:36,height:36,borderRadius:"50%",border:"none",background:listening?"#dc2626":"#e0f2fe",color:listening?"#fff":"#0369a1",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      {listening?"⏹":"🎤"}
    </button>
  );
}

function buildGstRows(items,taxable,subtotal){
  const groups={};
  items.forEach(item=>{const rate=(item.gstRate*100).toFixed(1);if(!groups[rate])groups[rate]=0;groups[rate]+=item.subtotal;});
  return Object.entries(groups).filter(([rate])=>parseFloat(rate)!==0).map(([rate,amt])=>{
    const share=subtotal>0?amt/subtotal:0,taxableAmt=Math.round(taxable*share*100)/100,gstAmt=Math.round(taxableAmt*parseFloat(rate)/100*100)/100,half=(parseFloat(rate)/2).toFixed(1);
    return{rate,half,taxableAmt,cgst:Math.round(gstAmt/2*100)/100,sgst:Math.round(gstAmt/2*100)/100};
  });
}

function InvoiceView({txn,settings,onClose}){
  const [showBt,setShowBt]=useState(false);
  const f=n=>fmt(n,settings.currency);
  const amtWords=numToWords(Math.round(txn.total))+" Rupees Only";
  const creditAmt=txn.payments?(txn.payments.find(p=>p.mode==="Credit")||{}).amount||0:(txn.paymentMode==="Credit"?txn.total:0);
  const hasSplit=txn.payments&&txn.payments.length>1;
  const paymentLabel=hasSplit?txn.payments.filter(p=>p.amount>0).map(p=>p.mode+": "+f(p.amount)).join(" | "):(txn.payments?.[0]?.mode||txn.paymentMode);
  const gstRows=buildGstRows(txn.items,txn.taxable,txn.subtotal);

  const doPrint=()=>{
    const el=document.getElementById("inv-print");
    const win=window.open("","_blank");
    if(!win||!el)return;
    win.document.write(`<html><head><title>Invoice ${txn.invoiceNo}</title><style>body{font-family:monospace;margin:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}</style></head><body>${el.innerHTML}<br/><button onclick="window.print();window.close();" style="padding:10px 24px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Print / Save PDF</button></body></html>`);
    win.document.close();
  };
  const doSharePDF=async()=>{
    const el=document.getElementById("inv-print");
    if(!window.html2canvas)await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    if(!window.jspdf)await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    try{
      const canvas=await window.html2canvas(el,{scale:2,useCORS:true,backgroundColor:"#fff"});
      const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a5"});
      const pdfW=pdf.internal.pageSize.getWidth();
      pdf.addImage(canvas.toDataURL("image/jpeg",0.95),"JPEG",0,0,pdfW,(canvas.height*pdfW)/canvas.width);
      const blob=pdf.output("blob");const file=new File([blob],"Invoice-"+txn.invoiceNo.replace("/","-")+".pdf",{type:"application/pdf"});
      if(navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({title:"Invoice "+txn.invoiceNo,files:[file]});
      else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();URL.revokeObjectURL(url);}
    }catch{alert("Could not generate PDF.");}
  };
  const doWhatsApp=()=>{
    let msg="🧵 *"+settings.shopName+"*\n_"+(settings.shopTagline||"")+"_\n"+settings.shopAddress+"\nGSTIN: "+settings.gstin+"\n─────────────────────\n";
    if(txn.void||txn.cancelled)msg+="❌ *VOID / CANCELLED INVOICE*\n─────────────────────\n";
    msg+="🧾 *INVOICE: "+txn.invoiceNo+"*\n📅 Date: "+new Date(txn.date).toLocaleDateString("en-IN")+"\n👤 Buyer: *"+txn.customer.name+"*\n";
    if(txn.customer.phone)msg+="📞 Ph: "+txn.customer.phone+"\n";
    msg+="─────────────────────\n*Items:*\n";
    txn.items.forEach((item,i)=>{msg+=(i+1)+". "+item.name+"\n   "+item.qty+" x "+f(item.price)+" = *"+f(item.price*item.qty)+"* (GST "+(item.gstRate*100).toFixed(0)+"%)\n";});
    msg+="─────────────────────\nGross Total: "+f(txn.subtotal)+"\n";
    if(txn.discount>0)msg+="Discount: -"+f(txn.discount)+"\n";
    msg+="Taxable Value: "+f(txn.taxable)+"\n";
    gstRows.forEach(r=>{msg+="CGST @"+r.half+"%: "+f(r.cgst)+"\nSGST @"+r.half+"%: "+f(r.sgst)+"\n";});
    if(txn.roundOff&&txn.roundOff!==0)msg+="Round Off: "+(txn.roundOff>0?"+":"")+f(txn.roundOff)+"\n";
    msg+="─────────────────────\n💰 *Net Amount: "+f(txn.total)+"*\n💳 Payment: "+paymentLabel+"\n";
    if(creditAmt>0)msg+="⚠️ *Amount Due (Credit): "+f(creditAmt)+"*\n";
    msg+="─────────────────────\n_"+amtWords+"_\n\n"+settings.footerNote+"\n*"+settings.signoff+"*";
    window.open((txn.customer.phone?"https://wa.me/91"+txn.customer.phone:"https://wa.me/")+"?text="+encodeURIComponent(msg),"_blank");
  };
  const doThermal=()=>{
    const W=32,line="-".repeat(W),ctr=s=>" ".repeat(Math.max(0,Math.floor((W-s.length)/2)))+s,row=(l,r)=>l+" ".repeat(Math.max(1,W-l.length-r.length))+r;
    let t=ctr(settings.shopName)+"\n"+ctr(settings.shopTagline||"")+"\n"+ctr(settings.shopAddress||"")+"\n"+ctr("GSTIN: "+settings.gstin)+"\n"+line+"\n";
    if(txn.void||txn.cancelled)t+="*** VOID / CANCELLED ***\n"+line+"\n";
    t+="Invoice: "+txn.invoiceNo+"\nDate: "+new Date(txn.date).toLocaleDateString("en-IN")+"\nBuyer: "+txn.customer.name+"\n";
    if(txn.customer.phone)t+="Ph: "+txn.customer.phone+"\n";
    t+=line+"\n";
    txn.items.forEach(item=>{const desc=item.name+" ("+item.qty+"x"+item.price.toFixed(2)+")",amt=(item.price*item.qty).toFixed(2);t+=row(desc.slice(0,W-amt.length-1),amt)+"\n  GST: "+(item.gstRate*100).toFixed(0)+"%\n";});
    t+=line+"\n";
    if(txn.discount>0)t+=row("Discount","-"+fmt(txn.discount,""))+"\n";
    t+=row("Taxable",fmt(txn.taxable,""))+"\n";
    gstRows.forEach(r=>{t+=row("CGST "+r.half+"%",fmt(r.cgst,""))+"\n"+row("SGST "+r.half+"%",fmt(r.sgst,""))+"\n";});
    if(txn.roundOff&&txn.roundOff!==0)t+=row("Round Off",(txn.roundOff>0?"+":"")+fmt(txn.roundOff,""))+"\n";
    t+=line+"\n"+row("NET","INR "+fmt(txn.total,""))+"\n"+line+"\nPayment: "+paymentLabel+"\n";
    if(creditAmt>0)t+="AMOUNT DUE: "+fmt(creditAmt,"")+"\n";
    t+="\nAmt: "+amtWords+"\n"+line+"\n"+ctr(settings.footerNote||"")+"\n"+ctr(settings.signoff||"")+"\n\n\n";
    return t;
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"flex-end",zIndex:100}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:16,width:"100%",maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}>
        {(txn.void||txn.cancelled)&&<div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",marginBottom:12,fontWeight:800,color:"#dc2626",fontSize:15,textAlign:"center"}}>❌ VOID / CANCELLED INVOICE</div>}
        <div id="inv-print" style={{border:"2px solid #000",padding:10,fontFamily:"monospace",fontSize:11,opacity:(txn.void||txn.cancelled)?0.55:1}}>
          <div style={{textAlign:"center",borderBottom:BDR,paddingBottom:6,marginBottom:6}}>
            {(txn.void||txn.cancelled)&&<div style={{fontWeight:900,fontSize:14,color:"#dc2626",marginBottom:4}}>*** VOID / CANCELLED ***</div>}
            <div style={{position:"relative",fontSize:10,marginBottom:4,minHeight:16}}>
              <span style={{position:"absolute",left:0}}>STATE CODE : {settings.stateCode||"20"}</span>
              <span style={{fontWeight:700}}>TAX INVOICE</span>
            </div>
            <div style={{fontWeight:900,fontSize:32,letterSpacing:12,fontFamily:"Georgia,serif",textShadow:"2px 2px 4px rgba(0,0,0,0.3)"}}>{settings.shopName}</div>
            {settings.shopTagline&&<div style={{fontSize:10,fontStyle:"italic",fontWeight:700}}>{settings.shopTagline}</div>}
            <div style={{fontSize:10,fontWeight:700}}>{settings.shopAddress}</div>
            {settings.shopPhone&&<div style={{fontSize:10}}>Ph: {settings.shopPhone}</div>}
            {settings.gstin&&<div style={{fontSize:10,fontWeight:700}}>GSTIN : {settings.gstin}</div>}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span><b>Invoice No:</b> {txn.invoiceNo}</span><span><b>Date:</b> {new Date(txn.date).toLocaleDateString("en-IN")}</span></div>
          <div style={{marginBottom:4}}><b>Buyer:</b> {txn.customer.name}</div>
          {txn.customer.phone&&<div style={{marginBottom:2}}><b>Ph:</b> {txn.customer.phone}</div>}
          <div style={{marginBottom:6}}><b>Address:</b> ............................................</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#f3f4f6"}}>
              {["Sl.","Particulars","HSN","Qty","Rate","Amount"].map((h,i)=>(
                <th key={h} style={tds({textAlign:i>=3?"right":i===0?"center":"left",fontWeight:700})}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txn.items.map((item,idx)=>(
                <tr key={item.uid||idx}>
                  <td style={tds({textAlign:"center"})}>{idx+1}</td>
                  <td style={tds({})}>{item.name}</td>
                  <td style={tds({textAlign:"center"})}>—</td>
                  <td style={tds({textAlign:"right"})}>{item.qty}</td>
                  <td style={tds({textAlign:"right"})}>{item.price.toFixed(2)}</td>
                  <td style={tds({textAlign:"right",fontWeight:600})}>{(item.price*item.qty).toFixed(2)}</td>
                </tr>
              ))}
              {Array(Math.max(0,4-txn.items.length)).fill(0).map((_,i)=>(
                <tr key={"e"+i}>{[0,1,2,3,4,5].map(c=><td key={c} style={tds({height:20})}>&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>
          <div style={{borderLeft:BDR,borderRight:BDR,borderBottom:BDR}}>
            <div style={{display:"flex"}}>
              <div style={{flex:1,padding:"6px 8px",borderRight:BDR,fontSize:10}}>
                <b>Amount in Words:</b><br/>{amtWords}
                <div style={{marginTop:6,paddingTop:4,borderTop:"1px dashed #999"}}>
                  <b>Payment:</b> {paymentLabel}
                  {creditAmt>0&&<div style={{fontWeight:700,color:"#dc2626",marginTop:2}}>⚠ Due: {f(creditAmt)}</div>}
                </div>
              </div>
              <div style={{width:210}}>
                <div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>Gross Total</span><span style={{fontWeight:600}}>{f(txn.subtotal)}</span></div>
                {txn.discount>0&&<div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>Less Discount</span><span style={{fontWeight:600}}>{f(txn.discount)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>Taxable Value</span><span style={{fontWeight:600}}>{f(txn.taxable)}</span></div>
                {gstRows.map(r=>(
                  <Fragment key={r.rate}>
                    <div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>CGST @ {r.half}%</span><span style={{fontWeight:600}}>{f(r.cgst)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>SGST @ {r.half}%</span><span style={{fontWeight:600}}>{f(r.sgst)}</span></div>
                  </Fragment>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>IGST @</span><span style={{fontWeight:600}}>—</span></div>
                {!!(txn.roundOff&&txn.roundOff!==0)&&<div style={{display:"flex",justifyContent:"space-between",borderBottom:BDR,padding:"3px 6px",fontSize:10}}><span>Round Off</span><span>{(txn.roundOff>0?"+":"")+f(txn.roundOff)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",padding:"4px 6px",fontWeight:900,fontSize:12}}><span>Net Value</span><span>{f(Math.round(txn.total))}</span></div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:6,paddingTop:6,fontSize:9}}>
            <span>{settings.footerNote}</span>
            <span style={{textAlign:"right"}}><div style={{marginBottom:28}}><b>{settings.signoff}</b></div><div>Authorised Signatory</div></span>
          </div>
          <div style={{borderTop:BDR,marginTop:4,paddingTop:4,fontSize:9,textAlign:"center"}}>Certified that details given above are true and correct.</div>
        </div>
        {creditAmt>0&&!(txn.void||txn.cancelled)&&(
          <div style={{background:"#fee2e2",border:"2px solid #dc2626",borderRadius:10,padding:"12px 14px",marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:800,fontSize:14,color:"#dc2626"}}>⚠ Amount Due (Credit)</div><div style={{fontSize:12,color:"#6b7280"}}>{txn.customer.name}</div></div>
            <div style={{fontWeight:900,fontSize:20,color:"#dc2626"}}>{f(creditAmt)}</div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginTop:14}}>
          {[["🖨️","Print","#16a34a",doPrint],["💬","WA","#25d366",doWhatsApp],["📄","PDF","#128c7e",doSharePDF],["🖨️","Thermal","#2563eb",()=>setShowBt(true)],["✖","Close","#1e3a5f",onClose]].map(([icon,label,bg,fn])=>(
            <button key={label} onClick={fn} style={{padding:"11px 0",background:bg,color:"#fff",border:"none",borderRadius:12,fontSize:11,fontWeight:800,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
              <span style={{fontSize:16}}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
        {showBt&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)setShowBt(false);}}>
            <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:16,width:"100%",maxWidth:480,margin:"0 auto",maxHeight:"80vh",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:16,color:"#1e3a5f",marginBottom:4}}>📲 Thermal Print</div>
              <pre style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:10,fontSize:11,overflowX:"auto",marginBottom:12,maxHeight:280,overflowY:"auto",whiteSpace:"pre-wrap"}}>{doThermal()}</pre>
              <button onClick={()=>navigator.clipboard.writeText(doThermal()).then(()=>alert("Copied!"))} style={{width:"100%",padding:"12px 0",background:"#2563eb",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:8}}>📋 Copy to Clipboard</button>
              <button onClick={()=>setShowBt(false)} style={{width:"100%",padding:"11px 0",background:"#f3f4f6",color:"#374151",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditInvoiceModal({txn,products,settings,onSave,onCancel,onVoidInvoice}){
  const [items,setItems]=useState(txn.items.map(i=>({...i})));
  const [payments,setPayments]=useState(txn.payments||[{mode:txn.paymentMode||"Cash",amount:txn.total}]);
  const [discount,setDiscount]=useState(txn.discount||0);
  const usedModes=payments.map(p=>p.mode);
  const availableModesFor=(cur)=>PAYMENT_MODES.filter(m=>m===cur||!usedModes.includes(m));
  const inclusiveThreshold=settings.gstThreshold*(1+settings.gstLow/100);
  const getGstRate=(name,grossTaxable)=>{const prod=products.find(p=>p.name.toLowerCase()===name.toLowerCase());if(prod&&prod.gstOverride!==null&&prod.gstOverride!==undefined)return prod.gstOverride/100;return grossTaxable>=inclusiveThreshold?settings.gstHigh/100:settings.gstLow/100;};
  const grandSubtotal=items.reduce((s,i)=>(parseFloat(i.price)||0)*(parseFloat(i.qty)||0)+s,0);
  const grossTaxable=Math.round(Math.max(0,grandSubtotal-discount)*100)/100;
  const blendedRate=grandSubtotal>0?items.reduce((s,i)=>{const p=parseFloat(i.price)||0,q=parseFloat(i.qty)||0,sub=p*q;const itemDisc=grandSubtotal>0?(sub/grandSubtotal)*discount:0;return s+(sub/grandSubtotal)*getGstRate(i.name,sub-itemDisc);},0):0;
  const taxable=Math.round(grossTaxable/(1+blendedRate)*100)/100;
  const gst=Math.round(grossTaxable*blendedRate/(1+blendedRate)*100)/100;
  const netAmount=Math.round(grossTaxable);
  const totalPaid=payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const paymentMismatch=payments.length>1&&Math.abs(totalPaid-netAmount)>1&&totalPaid>0;
  const updateItem=(uid,f,v)=>setItems(p=>p.map(i=>i.uid===uid?{...i,[f]:v}:i));
  const removeItem=uid=>setItems(p=>p.filter(i=>i.uid!==uid));
  const addItem=()=>setItems(p=>[...p,{uid:genId(),name:"",price:"",qty:1}]);
  const updatePayment=(idx,field,v)=>setPayments(p=>p.map((pm,i)=>i===idx?{...pm,[field]:v}:pm));
  const addPayment=()=>{const remaining=PAYMENT_MODES.filter(m=>!payments.map(p=>p.mode).includes(m));if(remaining.length===0)return;setPayments(p=>[...p,{mode:remaining[0],amount:0}]);};
  const removePayment=idx=>setPayments(p=>p.filter((_,i)=>i!==idx));
  const handleSave=()=>{
    const validItems=items.filter(i=>i.name&&parseFloat(i.price)>0&&parseFloat(i.qty)>0).map(i=>{const p=parseFloat(i.price),q=parseFloat(i.qty),sub=p*q;const itemDisc=grandSubtotal>0?(sub/grandSubtotal)*discount:0;const rate=getGstRate(i.name,sub-itemDisc);return{...i,price:p,qty:q,subtotal:sub,gstRate:rate,total:sub*(1+rate)};});
    if(validItems.length===0){alert("Add at least one item.");return;}
    const finalPay=payments.map((p,i)=>i===0&&payments.length===1&&!p.amount?{...p,amount:netAmount}:{...p,amount:parseFloat(p.amount)||0});
    if(finalPay.length>1&&Math.abs(finalPay.reduce((s,p)=>s+p.amount,0)-netAmount)>1){alert("Payment total doesn't match net amount.");return;}
    onSave({...txn,items:validItems,subtotal:grandSubtotal,discount:Math.min(discount,grandSubtotal),taxable,gst,roundOff:0,total:netAmount,payments:finalPay,paymentMode:finalPay[0]?.mode||"Cash",editedAt:new Date().toLocaleString()});
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:16,width:"100%",maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:17,color:"#1e3a5f",marginBottom:2}}>✏️ Edit Invoice {txn.invoiceNo}</div>
        <div style={{fontSize:11,color:"#f59e0b",marginBottom:14,fontWeight:600}}>⏰ Editable within 24 hours of creation</div>
        {items.map(item=>(
          <div key={item.uid} style={{background:"#f9fafb",borderRadius:10,padding:10,marginBottom:8,border:"1px solid #e5e7eb"}}>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <input list="edit-prod-list" value={item.name} onChange={e=>updateItem(item.uid,"name",e.target.value)} placeholder="Item name" style={{...inp,fontSize:13}}/>
              <button onClick={()=>removeItem(item.uid)} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#dc2626",padding:"8px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
              <datalist id="edit-prod-list">{products.map(pr=><option key={pr.id} value={pr.name}/>)}</datalist>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}><div style={{...lbl,fontSize:10}}>Price</div><input type="number" value={item.price} onChange={e=>updateItem(item.uid,"price",e.target.value)} style={{...inp,padding:"8px 10px"}}/></div>
              <div style={{flex:1}}><div style={{...lbl,fontSize:10}}>Qty</div><input type="number" value={item.qty} onChange={e=>updateItem(item.uid,"qty",e.target.value)} style={{...inp,padding:"8px 10px"}}/></div>
            </div>
          </div>
        ))}
        <button onClick={addItem} style={{width:"100%",padding:"9px 0",background:"#eff6ff",color:"#1e3a5f",border:"2px dashed #93c5fd",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>+ Add Item</button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:14,color:"#6b7280"}}>Discount (₹)</span>
          <input type="number" min={0} value={discount} onChange={e=>setDiscount(parseFloat(e.target.value)||0)} style={{width:90,textAlign:"right",border:"1px solid #d1d5db",borderRadius:6,padding:"6px 8px",fontSize:14}}/>
        </div>
        <div style={{background:"#eff6ff",borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:13}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#6b7280"}}>Taxable</span><span style={{fontWeight:700}}>{fmt(taxable,settings.currency)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#6b7280"}}>GST</span><span style={{fontWeight:700}}>{fmt(gst,settings.currency)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #bfdbfe",paddingTop:8,marginTop:4,fontWeight:800,fontSize:15}}><span>Net</span><span>{fmt(netAmount,settings.currency)}</span></div>
        </div>
        <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:8}}>💳 Payment Split</div>
        {payments.map((pm,idx)=>(
          <div key={idx} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
            <select value={pm.mode} onChange={e=>updatePayment(idx,"mode",e.target.value)} style={{flex:1,padding:"9px 10px",border:"1px solid #d1d5db",borderRadius:8,fontSize:13,background:"#fff"}}>
              {availableModesFor(pm.mode).map(m=><option key={m}>{m}</option>)}
            </select>
            <input type="number" value={pm.amount} onChange={e=>updatePayment(idx,"amount",parseFloat(e.target.value)||0)} placeholder={idx===0&&payments.length===1?String(netAmount):"Amount"} style={{width:100,padding:"9px 10px",border:"1px solid #d1d5db",borderRadius:8,fontSize:13}}/>
            {payments.length>1&&<button onClick={()=>removePayment(idx)} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#dc2626",padding:"8px 10px",cursor:"pointer"}}>✕</button>}
          </div>
        ))}
        {payments.length<PAYMENT_MODES.length&&<button onClick={addPayment} style={{width:"100%",padding:"8px 0",background:"#f3f4f6",color:"#374151",border:"1px dashed #d1d5db",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}}>+ Add Payment Mode</button>}
        {paymentMismatch&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8,background:"#fee2e2",padding:"6px 10px",borderRadius:6}}>⚠ Paid {fmt(totalPaid,settings.currency)} ≠ Net {fmt(netAmount,settings.currency)}</div>}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={handleSave} style={{flex:2,padding:"13px 0",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>💾 Save Changes</button>
          <button onClick={onCancel} style={{flex:1,padding:"13px 0",background:"#f3f4f6",color:"#374151",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Cancel</button>
        </div>
        <button onClick={()=>{if(window.confirm("Mark as VOID? Invoice kept in records but amounts zeroed."))onVoidInvoice();}} style={{width:"100%",marginTop:8,padding:"11px 0",background:"#fee2e2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>🚫 Void Invoice</button>
      </div>
    </div>
  );
}

function CreditCustomerModal({customers,onConfirm,onCancel,netAmount,currency}){
  const [sel,setSel]=useState("");const [name,setName]=useState("");const [phone,setPhone]=useState("");const [mode,setMode]=useState("new");
  const f=n=>fmt(n,currency);
  const confirm=()=>{
    if(mode==="existing"){const c=customers.find(c=>c.id===sel);if(!c){alert("Select a customer.");return;}onConfirm(c);}
    else{if(!name.trim()){alert("Name required for credit.");return;}onConfirm({id:genId(),name:name.trim(),phone:phone.trim(),isNew:true});}
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div style={{background:"#fff",borderRadius:20,padding:24,width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
        <div style={{fontWeight:800,fontSize:17,color:"#dc2626",marginBottom:2}}>⚠️ Credit Sale</div>
        <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Amount: <b style={{color:"#dc2626"}}>{f(netAmount)}</b></div>
        <div style={{fontSize:12,color:"#9ca3af",marginBottom:16}}>Record customer details for credit billing.</div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["existing","Existing"],["new","New"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"9px 0",border:"2px solid "+(mode===m?"#1e3a5f":"#e5e7eb"),background:mode===m?"#1e3a5f":"#fff",color:mode===m?"#fff":"#374151",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>{l} Customer</button>
          ))}
        </div>
        {mode==="existing"?(
          <select value={sel} onChange={e=>setSel(e.target.value)} style={{...inp,marginBottom:12}}>
            <option value="">-- Select Customer --</option>
            {customers.filter(c=>c.id!=="c1").map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}
          </select>
        ):(
          <>
            <div style={{marginBottom:10}}><label style={lbl}>Full Name *</label><FInput value={name} onChange={e=>setName(e.target.value)} placeholder="Customer name"/></div>
            <div style={{marginBottom:14}}><label style={lbl}>Phone</label><FInput value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile" inputMode="numeric"/></div>
          </>
        )}
        <button onClick={confirm} style={{width:"100%",padding:"13px 0",background:"#dc2626",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:8}}>✅ Confirm Credit Bill</button>
        <button onClick={onCancel} style={{width:"100%",padding:"11px 0",background:"#f3f4f6",color:"#374151",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>← Go Back</button>
      </div>
    </div>
  );
}

function exportReportExcel(txns,label,currency){
  const f=n=>Number(n).toFixed(2);
  const cols=[{key:"invoiceNo",label:"Invoice No"},{key:"date",label:"Date"},{key:"customer",label:"Customer"},{key:"phone",label:"Phone"},{key:"items",label:"Items"},{key:"gross",label:"Gross"},{key:"discount",label:"Discount"},{key:"taxable",label:"Taxable"},{key:"gst",label:"GST"},{key:"net",label:"Net Amount"},{key:"cash",label:"Cash"},{key:"upi",label:"UPI"},{key:"card",label:"Card"},{key:"credit",label:"Credit Due"},{key:"status",label:"Status"}];
  const rows=txns.map(t=>({invoiceNo:t.invoiceNo||"",date:new Date(t.date).toLocaleDateString("en-IN"),customer:t.customer?.name||"",phone:t.customer?.phone||"",items:t.items.map(i=>i.name+"×"+i.qty+"@"+i.price).join("; "),gross:f(t.subtotal),discount:f(t.discount||0),taxable:f(t.taxable),gst:f(t.gst),net:f(t.void||t.cancelled?0:t.total),cash:f(t.void||t.cancelled?0:(t.payments?t.payments.find(p=>p.mode==="Cash")?.amount||0:(t.paymentMode==="Cash"?t.total:0))),upi:f(t.void||t.cancelled?0:(t.payments?t.payments.find(p=>p.mode==="UPI")?.amount||0:(t.paymentMode==="UPI"?t.total:0))),card:f(t.void||t.cancelled?0:(t.payments?t.payments.find(p=>p.mode==="Card")?.amount||0:(t.paymentMode==="Card"?t.total:0))),credit:f(t.void||t.cancelled?0:(t.payments?t.payments.find(p=>p.mode==="Credit")?.amount||0:(t.paymentMode==="Credit"?t.total:0))),status:t.void?"VOID":t.cancelled?"CANCELLED":"Active"}));
  downloadCSV(toCSV(rows,cols),"FabricBill-Report-"+label+".csv");
}

export default function App(){
  const [shopCode,setShopCode]=useState(()=>{try{return localStorage.getItem("fabricbill_shopcode")||null;}catch{return null;}});
  const [ready,setReady]=useState(false);
  const [syncStatus,setSyncStatus]=useState("idle");
  const [role,setRole]=useState(()=>{try{const s=localStorage.getItem("fabricbill_session");if(!s)return null;const{role,expiry}=JSON.parse(s);if(Date.now()<expiry)return role;localStorage.removeItem("fabricbill_session");return null;}catch{return null;}});
  const [tab,setTab]=useState("billing");
  const [settings,setSettings]=useState(defaultSettings);
  const [draftSettings,setDraftSettings]=useState(defaultSettings);
  const [customers,setCustomers]=useState([]);
  const [transactions,setTransactions]=useState([]);
  const [products,setProducts]=useState([]);
  const [selectedCustomer,setSelectedCustomer]=useState("c1");
  const [cart,setCart]=useState([]);
  const [payments,setPayments]=useState([{mode:"Cash",amount:""}]);
  const [discount,setDiscount]=useState("");
  const [amountCollected,setAmountCollected]=useState("");
  const [showReceipt,setShowReceipt]=useState(null);
  const [editTxn,setEditTxn]=useState(null);
  const [showCreditModal,setShowCreditModal]=useState(false);
  const [newName,setNewName]=useState("");const [newPhone,setNewPhone]=useState("");
  const [custError,setCustError]=useState("");const [custSuccess,setCustSuccess]=useState("");
  const [newProdName,setNewProdName]=useState("");const [newProdGst,setNewProdGst]=useState("default");const [prodMsg,setProdMsg]=useState("");
  const [histView,setHistView]=useState("bills");
  const [selectedDay,setSelectedDay]=useState(null);
  const [reportFrom,setReportFrom]=useState("");const [reportTo,setReportTo]=useState("");
  const [voiceLang,setVoiceLang]=useState("en-IN");
  const [searchQuery,setSearchQuery]=useState("");

  const isAdmin=role==="admin";
  const f=n=>fmt(n,settings.currency);

  const handleEnterShop=code=>{try{localStorage.setItem("fabricbill_shopcode",code);}catch{}setShopCode(code);setReady(false);};
  const handleChangeShop=()=>{try{localStorage.removeItem("fabricbill_shopcode");localStorage.removeItem("fabricbill_session");}catch{}setShopCode(null);setRole(null);setReady(false);setTransactions([]);setCustomers([]);setProducts([]);setSettings(defaultSettings);setDraftSettings(defaultSettings);};

  useEffect(()=>{
    if(!shopCode)return;setReady(false);
    (async()=>{
      setSyncStatus("syncing");
      try{
        const[s,txns,custs,prods]=await Promise.all([sbGet("settings",shopCode,"main"),sbGetAll("transactions",shopCode),sbGetAll("customers",shopCode),sbGetAllProducts(shopCode)]);
        const merged={...defaultSettings,...(s||{})};
        setSettings(merged);setDraftSettings(merged);setTransactions(txns||[]);
        setCustomers(custs&&custs.length>0?custs:[{id:"c1",name:"Walk-in Customer",phone:""}]);
        setProducts(prods||[]);setPayments([{mode:merged.defaultPaymentMode,amount:""}]);setSyncStatus("ok");
      }catch{setSyncStatus("error");}
      setReady(true);
    })();
  },[shopCode]);

  const saveSettings=useCallback(async d=>{setSettings(d);setSyncStatus("syncing");await sbUpsert("settings",shopCode,"main",d);setSyncStatus("ok");},[shopCode]);
  const addProduct=useCallback(async prod=>{const np={...prod,id:genId()};setProducts(p=>[...p,np]);setSyncStatus("syncing");await sbInsertProduct(shopCode,np);setSyncStatus("ok");return np;},[shopCode]);
  const updateProduct=useCallback(async upd=>{setProducts(p=>p.map(pr=>pr.id===upd.id?upd:pr));setSyncStatus("syncing");await sbUpdateProduct(shopCode,upd);setSyncStatus("ok");},[shopCode]);
  const removeProduct=useCallback(async id=>{setProducts(p=>p.filter(pr=>pr.id!==id));setSyncStatus("syncing");await sbDeleteProduct(shopCode,id);setSyncStatus("ok");},[shopCode]);
  const saveCustomers=useCallback(async d=>{setCustomers(d);setSyncStatus("syncing");await Promise.all(d.map(c=>sbUpsert("customers",shopCode,c.id,c)));setSyncStatus("ok");},[shopCode]);
  const addTransaction=useCallback(async txn=>{setTransactions(p=>[txn,...p]);setSyncStatus("syncing");await sbInsert("transactions",shopCode,txn);setSyncStatus("ok");},[shopCode]);
  const updateTransaction=useCallback(async txn=>{setTransactions(p=>p.map(t=>t.id===txn.id?txn:t));setSyncStatus("syncing");await sbUpdate("transactions",shopCode,txn.id,txn);setSyncStatus("ok");},[shopCode]);

  const grandSubtotal=cart.reduce((s,i)=>(parseFloat(i.price)||0)*(parseFloat(i.qty)||0)+s,0);
  const manualDiscount=Math.min(parseFloat(discount)||0,grandSubtotal);
  const collected=parseFloat(amountCollected)||0;
  const useCollected=collected>0&&grandSubtotal>0;
  const effectiveDiscount=useCollected?Math.max(0,grandSubtotal-collected):manualDiscount;
  const inclusiveThreshold=settings.gstThreshold*(1+settings.gstLow/100);

  const cartWithTax=cart.map(item=>{
    const price=parseFloat(item.price)||0,qty=parseFloat(item.qty)||0,subtotal=price*qty;
    const itemDiscountShare=grandSubtotal>0?(subtotal/grandSubtotal)*effectiveDiscount:0;
    const grossItemTaxable=subtotal-itemDiscountShare;
    const prod=products.find(p=>p.name.toLowerCase()===item.name.toLowerCase());
    let rate;
    if(prod&&prod.gstOverride!==null&&prod.gstOverride!==undefined){rate=prod.gstOverride/100;}
    else{rate=grossItemTaxable>=inclusiveThreshold?settings.gstHigh/100:settings.gstLow/100;}
    return{...item,price,qty,subtotal,gstRate:rate,total:subtotal*(1+rate)};
  });

  const blendedRate=cartWithTax.length>0&&grandSubtotal>0?cartWithTax.reduce((s,i)=>s+(i.subtotal/grandSubtotal)*i.gstRate,0):0;
  const grossAfterDiscount=useCollected?Math.max(0,collected):grandSubtotal-manualDiscount;
  const collectedTaxable=Math.floor(grossAfterDiscount/(1+blendedRate)*100)/100;
  const collectedGST=Math.round((grossAfterDiscount-collectedTaxable)*100)/100;
  const collectedDiscount=useCollected?Math.round(Math.max(0,grandSubtotal-grossAfterDiscount)*100)/100:manualDiscount;
  const netBeforeRound=useCollected?collected:collectedTaxable+collectedGST;
  const netAmount=useCollected?Math.round(collected):Math.round(netBeforeRound);
  const roundOff=Math.round((netAmount-netBeforeRound)*100)/100;
  const validCart=cartWithTax.filter(i=>i.name&&i.price>0&&i.qty>0);
  const totalPayments=payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const creditInPayments=payments.find(p=>p.mode==="Credit");
  const creditAmount=parseFloat(creditInPayments?.amount)||0;
  const hasCredit=creditAmount>0;
  const usedPaymentModes=payments.map(p=>p.mode);
  const availableModesFor=(cur)=>PAYMENT_MODES.filter(m=>m===cur||!usedPaymentModes.includes(m));
  const canAddPaymentRow=payments.length<PAYMENT_MODES.length;
  const paymentSplitMismatch=payments.length>1&&totalPayments>0&&Math.abs(totalPayments-netAmount)>1;

  const addLine=()=>setCart(p=>[...p,{uid:genId(),name:"",price:"",qty:1}]);
  const updateLine=(uid,field,v)=>setCart(p=>p.map(i=>i.uid===uid?{...i,[field]:v}:i));
  const removeLine=uid=>setCart(p=>p.filter(i=>i.uid!==uid));
  const updatePaymentRow=(idx,field,v)=>setPayments(p=>p.map((pm,i)=>i===idx?{...pm,[field]:v}:pm));
  const addPaymentRow=()=>{const remaining=PAYMENT_MODES.filter(m=>!payments.map(p=>p.mode).includes(m));if(remaining.length===0)return;setPayments(p=>[...p,{mode:remaining[0],amount:""}]);};
  const removePaymentRow=idx=>setPayments(p=>p.filter((_,i)=>i!==idx));

  const handleVoiceResult=(transcript,uid)=>{
    const t=transcript.toLowerCase().trim();const nums=t.match(/\d+(\.\d+)?/g);
    if(nums&&nums.length>=2){const qty=nums[nums.length-1],price=nums[nums.length-2],name=t.replace(/\d+(\.\d+)?/g,"").replace(/\s+/g," ").trim();updateLine(uid,"name",name||t);updateLine(uid,"price",price);updateLine(uid,"qty",qty);}
    else if(nums&&nums.length===1){const name=t.replace(/\d+(\.\d+)?/g,"").trim();updateLine(uid,"name",name||t);updateLine(uid,"price",nums[0]);}
    else{updateLine(uid,"name",t);}
  };

  const handleConfirmPayment=async(creditCustomer=null)=>{
    const finalPayments=payments.map((p,i)=>i===0&&payments.length===1&&!p.amount?{...p,amount:netAmount}:{...p,amount:parseFloat(p.amount)||0});
    if(finalPayments.length>1){const tp=finalPayments.reduce((s,p)=>s+p.amount,0);if(Math.abs(tp-netAmount)>1){alert("Payment total ("+fmt(tp,settings.currency)+") doesn't match net amount ("+fmt(netAmount,settings.currency)+"). Please fix.");return;}}
    let cust=customers.find(c=>c.id===selectedCustomer)||customers[0];
    if(creditCustomer){cust=creditCustomer;if(creditCustomer.isNew){const nc={id:creditCustomer.id,name:creditCustomer.name,phone:creditCustomer.phone||""};await saveCustomers([...customers,nc]);}}
    const invoiceNo=await getNextInvoiceNo(shopCode);
    const txn={id:genId(),invoiceNo,date:new Date().toLocaleString(),customer:cust,items:validCart,subtotal:grandSubtotal,discount:collectedDiscount,taxable:collectedTaxable,gst:collectedGST,roundOff,total:netAmount,payments:finalPayments,paymentMode:finalPayments[0]?.mode||"Cash",settings:{...settings}};
    await addTransaction(txn);
    setShowReceipt(txn);setCart([]);setDiscount("");setAmountCollected("");setPayments([{mode:settings.defaultPaymentMode,amount:""}]);setShowCreditModal(false);
  };

  const handlePaymentClick=()=>{if(validCart.length===0)return;if(hasCredit&&selectedCustomer==="c1"){setShowCreditModal(true);return;}handleConfirmPayment();};
  const handleCreateCustomer=async()=>{
    setCustError("");setCustSuccess("");
    if(!newName.trim()){setCustError("Name required.");return;}
    if(!newPhone.match(/^\d{10}$/)){setCustError("Enter valid 10-digit number.");return;}
    if(customers.find(c=>c.phone===newPhone)){setCustError("Phone already registered.");return;}
    const nc={id:genId(),name:newName.trim(),phone:newPhone};
    await saveCustomers([...customers,nc]);setCustSuccess("\""+nc.name+"\" added!");setNewName("");setNewPhone("");
  };
  const handleSaveSettings=async()=>{await saveSettings(draftSettings);setPayments([{mode:draftSettings.defaultPaymentMode,amount:""}]);alert("Settings saved!");};
  const handleAddProduct=async()=>{
    setProdMsg("");
    if(!newProdName.trim()){setProdMsg("Name required.");return;}
    if(products.find(p=>p.name.toLowerCase()===newProdName.trim().toLowerCase())){setProdMsg("Already exists.");return;}
    await addProduct({name:newProdName.trim(),gstOverride:newProdGst==="default"?null:parseFloat(newProdGst)});
    setProdMsg("\""+newProdName.trim()+"\" added!");setNewProdName("");setNewProdGst("default");
  };
  const handleEditSave=async txn=>{await updateTransaction(txn);setEditTxn(null);setShowReceipt(txn);};
  const handleVoidInvoice=async txn=>{
    const voided={...txn,void:true,voidedAt:new Date().toLocaleString(),total:0,subtotal:0,taxable:0,gst:0,discount:0,payments:txn.payments.map(p=>({...p,amount:0}))};
    await updateTransaction(voided);setEditTxn(null);setShowReceipt(voided);
  };

  const grouped={};
  transactions.forEach(txn=>{const day=new Date(txn.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});if(!grouped[day])grouped[day]=[];grouped[day].push(txn);});
  const days=Object.keys(grouped).sort((a,b)=>new Date(b)-new Date(a));
  const getFilteredDays=()=>days.filter(day=>{
    const d=new Date(day);
    if(reportFrom){const[fy,fm,fd]=reportFrom.split("-").map(Number);const from=new Date(fy,fm-1,fd);if(d<from)return false;}
    if(reportTo){const[ty,tm,td]=reportTo.split("-").map(Number);const to=new Date(ty,tm-1,td,23,59,59);if(d>to)return false;}
    return true;
  });
  const payAmt=(t,mode)=>t.void||t.cancelled?0:Number(t.payments?t.payments.find(p=>p.mode===mode)?.amount||0:(t.paymentMode===mode?t.total:0))||0;
  const dayTotals=txns=>({
    gross:txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+t.subtotal,0),
    discount:txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+(t.discount||0),0),
    taxable:txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+t.taxable,0),
    gst:txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+t.gst,0),
    net:txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+t.total,0),
    count:txns.filter(t=>!t.void&&!t.cancelled).length,
    voidCount:txns.filter(t=>t.void||t.cancelled).length,
    cash:txns.reduce((s,t)=>s+(Number(payAmt(t,"Cash"))||0),0),
    upi:txns.reduce((s,t)=>s+(Number(payAmt(t,"UPI"))||0),0),
    card:txns.reduce((s,t)=>s+(Number(payAmt(t,"Card"))||0),0),
    credit:txns.reduce((s,t)=>s+(Number(payAmt(t,"Credit"))||0),0),
  });
  const filteredTxns=getFilteredDays().flatMap(d=>grouped[d]);
  const rangeTotals=dayTotals(filteredTxns);
  const filteredBills=transactions.filter(t=>{
    if(!searchQuery)return true;const q=searchQuery.toLowerCase();
    return t.customer?.name?.toLowerCase().includes(q)||t.invoiceNo?.toLowerCase().includes(q)||(t.customer?.phone||"").includes(q);
  });

  const navTabs=isAdmin
    ?[["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"],["products","📦","Products"],["settings","⚙️","Settings"]]
    :[["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"]];

  const syncBadge={idle:null,syncing:["🔄","#f59e0b"],ok:["☁️","#16a34a"],error:["⚠️","#dc2626"]};

  if(!shopCode)return <ShopCodeScreen onEnter={handleEnterShop}/>;
  if(!ready)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:12,background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)"}}>
      <div style={{fontSize:40}}>🧵</div>
      <div style={{fontWeight:700,fontSize:18,color:"#fff"}}>FabricBill</div>
      <div style={{background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 14px",fontSize:13,fontWeight:700,color:"#fff"}}>🏪 {shopCode}</div>
      <div style={{color:"rgba(255,255,255,0.6)",fontSize:13,marginTop:4}}>Loading your shop...</div>
    </div>
  );
  if(!role)return <LoginScreen onLogin={r=>{setRole(r);setTab("billing");try{localStorage.setItem("fabricbill_session",JSON.stringify({role:r,expiry:Date.now()+24*60*60*1000}));}catch{}}} settings={settings} shopCode={shopCode} onChangeShop={handleChangeShop}/>;

  return(
    // ✅ FIX 1: Replaced undefined `colors.bg` with explicit background color
    <div style={{fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#f0f2f5",minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>
      <div style={{background:"#1e3a5f",color:"#fff",padding:"12px 16px",position:"sticky",top:0,zIndex:50,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
        <div>
          <div style={{fontWeight:800,fontSize:17,letterSpacing:0.3}}>{settings.shopName}</div>
          <div style={{fontSize:10,opacity:0.6,marginTop:1}}>🏪 {shopCode} · {new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {syncBadge[syncStatus]&&<span style={{background:syncBadge[syncStatus][1],color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>{syncBadge[syncStatus][0]}</span>}
          <span style={{background:isAdmin?"#fbbf24":"#34d399",color:"#1e3a5f",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:800}}>{isAdmin?"🔐 Admin":"👤 Staff"}</span>
          <button onClick={()=>{setRole(null);setTab("billing");try{localStorage.removeItem("fabricbill_session");}catch{}}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",padding:"5px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Logout</button>
        </div>
      </div>

      <div style={{padding:"14px 12px"}}>

        {tab==="billing"&&(
          <>
            <div style={card}>
              <div style={{...lbl,marginBottom:6}}>Customer</div>
              <div style={{display:"flex",gap:8}}>
                <select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)} style={{...inp,flex:1,margin:0}}>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}
                </select>
                <button onClick={()=>setTab("customers")} style={{padding:"10px 14px",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>+ New</button>
              </div>
            </div>
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f"}}>🧾 Items</div>
                {settings.enableVoice&&(<select value={voiceLang} onChange={e=>setVoiceLang(e.target.value)} style={{fontSize:11,padding:"4px 8px",border:"1px solid #d1d5db",borderRadius:6,background:"#fff"}}><option value="en-IN">🗣 English</option><option value="hi-IN">🗣 Hindi</option></select>)}
              </div>
              {cart.map(item=>{
                const p=parseFloat(item.price)||0,q=parseFloat(item.qty)||0;
                const cartItem=cartWithTax.find(i=>i.uid===item.uid);
                const rate=cartItem?cartItem.gstRate:0,lineTotal=p*q;
                const prod=products.find(pr=>pr.name.toLowerCase()===item.name.toLowerCase());
                const hasOverride=prod&&prod.gstOverride!==null&&prod.gstOverride!==undefined;
                return(
                  <div key={item.uid} style={{background:"#f9fafb",borderRadius:10,padding:12,marginBottom:10,border:"1px solid #e5e7eb"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
                      <input list="prod-list" value={item.name} onChange={e=>updateLine(item.uid,"name",e.target.value)} placeholder="Item name" style={{...inp,flex:1,padding:"8px 10px",fontSize:13}}/>
                      {settings.enableVoice&&<VoiceButton onResult={t=>handleVoiceResult(t,item.uid)} lang={voiceLang}/>}
                      <button onClick={()=>removeLine(item.uid)} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#dc2626",padding:"8px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
                      <datalist id="prod-list">{products.map(pr=><option key={pr.id||pr.name} value={pr.name}/>)}</datalist>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <div style={{flex:1}}><div style={{...lbl,fontSize:10}}>Price (₹)</div><input type="number" min={0} value={item.price} onChange={e=>updateLine(item.uid,"price",e.target.value)} style={{...inp,padding:"8px 10px",fontSize:13}}/></div>
                      <div style={{width:118}}>
                        <div style={{...lbl,fontSize:10}}>Qty</div>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <button onClick={()=>updateLine(item.uid,"qty",Math.max(0.1,parseFloat((q-0.1).toFixed(2))))} style={{width:32,height:38,border:"1px solid #d1d5db",background:"#fff",borderRadius:6,fontSize:18,cursor:"pointer",fontWeight:700,color:"#1e3a5f"}}>−</button>
                          <input type="number" min={0.1} step="0.1" value={item.qty} onChange={e=>updateLine(item.uid,"qty",e.target.value)} style={{width:46,textAlign:"center",border:"1px solid #d1d5db",borderRadius:6,padding:"8px 4px",fontSize:13}}/>
                          <button onClick={()=>updateLine(item.uid,"qty",parseFloat((q+0.1).toFixed(2)))} style={{width:32,height:38,border:"1px solid #d1d5db",background:"#fff",borderRadius:6,fontSize:18,cursor:"pointer",fontWeight:700,color:"#1e3a5f"}}>+</button>
                        </div>
                      </div>
                    </div>
                    {p>0&&q>0&&(
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12,background:"#fff",borderRadius:6,padding:"5px 8px",border:"1px solid #e5e7eb"}}>
                        <span style={{color:hasOverride?"#7c3aed":rate*100>=settings.gstHigh?"#dc2626":"#16a34a",fontWeight:700}}>GST {(rate*100).toFixed(0)}%{hasOverride?" ★":""}</span>
                        <span style={{fontWeight:800,color:"#1e3a5f"}}>{f(lineTotal)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {cart.length===0&&<div style={{color:"#9ca3af",fontSize:13,textAlign:"center",padding:"20px 0",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb"}}>Tap "+ Add Item" to start billing</div>}
              <button onClick={addLine} style={{width:"100%",padding:"12px 0",background:"#eff6ff",color:"#1e3a5f",border:"2px dashed #93c5fd",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",marginTop:8}}>+ Add Item</button>
            </div>
            {cart.length>0&&(
              <div style={card}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:12,color:"#1e3a5f"}}>💰 Summary</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:10,paddingBottom:10,borderBottom:"1px dashed #e5e7eb"}}>
                  <span style={{color:"#6b7280"}}>Subtotal ({cart.length} item{cart.length>1?"s":""})</span><span style={{fontWeight:700}}>{f(grandSubtotal)}</span>
                </div>
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12,marginBottom:10}}>
                  <div style={{...lbl,color:"#92400e",marginBottom:6}}>💵 Amount Collected</div>
                  <input type="number" min={0} value={amountCollected} onChange={e=>{setAmountCollected(e.target.value);setDiscount("");}} placeholder={"Full price: "+f(grandSubtotal)} style={{...inp,border:"1px solid #fcd34d",fontWeight:700,fontSize:15,background:"#fffde7"}}/>
                  <div style={{fontSize:10,color:"#92400e",marginTop:5}}>Leave blank to use full price or manual discount</div>
                </div>
                {settings.enableDiscount&&!amountCollected&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,background:"#f9fafb",padding:"10px 12px",borderRadius:8,border:"1px solid #e5e7eb"}}>
                    <span style={{fontSize:14,color:"#6b7280",fontWeight:600}}>Discount (₹)</span>
                    <input type="number" min={0} value={discount} onChange={e=>setDiscount(e.target.value)} style={{width:90,textAlign:"right",border:"1px solid #d1d5db",borderRadius:6,padding:"6px 8px",fontSize:14,background:"#fff"}}/>
                  </div>
                )}
                <div style={{background:"#f0fdf4",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                  {collectedDiscount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,color:"#dc2626"}}><span>Discount</span><span style={{fontWeight:700}}>− {f(collectedDiscount)}</span></div>}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,color:"#6b7280"}}><span>Taxable Value</span><span style={{fontWeight:600}}>{f(collectedTaxable)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,color:"#6b7280"}}><span>GST ({(blendedRate*100).toFixed(0)}%)</span><span style={{fontWeight:600}}>{f(collectedGST)}</span></div>
                  {roundOff!==0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6,color:"#9ca3af"}}><span>Round Off</span><span>{(roundOff>0?"+":"")+f(roundOff)}</span></div>}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:19,fontWeight:900,color:"#1e3a5f",borderTop:"2px solid #16a34a",paddingTop:10,marginTop:4}}><span>Net Amount</span><span style={{color:"#16a34a"}}>{f(netAmount)}</span></div>
                </div>
                <div style={{marginTop:4}}>
                  <div style={{...lbl,marginBottom:8}}>💳 Payment Mode(s)</div>
                  {payments.map((pm,idx)=>(
                    <div key={idx} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                      <select value={pm.mode} onChange={e=>updatePaymentRow(idx,"mode",e.target.value)} style={{flex:1,padding:"9px 10px",border:"1px solid #d1d5db",borderRadius:8,fontSize:13,background:"#fff"}}>
                        {availableModesFor(pm.mode).map(m=><option key={m}>{m}</option>)}
                      </select>
                      <input type="number" value={pm.amount} onChange={e=>updatePaymentRow(idx,"amount",e.target.value)} placeholder={idx===0&&payments.length===1?String(netAmount):"Amount"} style={{width:100,padding:"9px 10px",border:"1px solid #d1d5db",borderRadius:8,fontSize:13}}/>
                      {payments.length>1&&<button onClick={()=>removePaymentRow(idx)} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#dc2626",padding:"8px 10px",cursor:"pointer",fontWeight:700}}>✕</button>}
                    </div>
                  ))}
                  {canAddPaymentRow&&<button onClick={addPaymentRow} style={{width:"100%",padding:"8px 0",background:"#f3f4f6",color:"#374151",border:"1px dashed #d1d5db",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:4}}>+ Split Payment</button>}
                  {paymentSplitMismatch&&<div style={{color:"#dc2626",fontSize:12,marginTop:4,background:"#fee2e2",padding:"6px 10px",borderRadius:6}}>⚠ Total paid {f(totalPayments)} ≠ Net {f(netAmount)}</div>}
                  {creditAmount>0&&<div style={{background:"#fee2e2",borderRadius:8,padding:"8px 12px",marginTop:8,fontWeight:700,color:"#dc2626",fontSize:13}}>⚠ Credit: {f(creditAmount)}{selectedCustomer==="c1"?" — Customer details required":""}</div>}
                </div>
                <button onClick={handlePaymentClick} disabled={validCart.length===0} style={{marginTop:14,width:"100%",padding:"15px 0",background:validCart.length===0?"#9ca3af":"#16a34a",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:900,cursor:validCart.length===0?"not-allowed":"pointer",letterSpacing:0.5,boxShadow:validCart.length>0?"0 4px 12px rgba(22,163,74,0.3)":"none"}}>✅ Confirm Payment</button>
              </div>
            )}
          </>
        )}

        {tab==="customers"&&(
          <>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>➕ New Customer</div>
              <div style={{marginBottom:10}}><label style={lbl}>Full Name</label><FInput value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Rajesh Kumar"/></div>
              <div style={{marginBottom:12}}><label style={lbl}>Phone Number</label><FInput value={newPhone} onChange={e=>setNewPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile" inputMode="numeric"/></div>
              {custError&&<div style={{color:"#dc2626",fontSize:13,marginBottom:8,background:"#fee2e2",padding:"6px 10px",borderRadius:6}}>⚠ {custError}</div>}
              {custSuccess&&<div style={{color:"#16a34a",fontSize:13,marginBottom:8,background:"#f0fdf4",padding:"6px 10px",borderRadius:6}}>✅ {custSuccess}</div>}
              <button onClick={handleCreateCustomer} style={{width:"100%",padding:"12px 0",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer"}}>Create Customer</button>
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>👥 All Customers ({customers.length})</div>
              {customers.map((c,i)=>{
                const txns=transactions.filter(t=>t.customer?.id===c.id),spent=txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+t.total,0);
                const creditDue=txns.filter(t=>!t.void&&!t.cancelled).reduce((s,t)=>s+payAmt(t,"Credit"),0);
                return(
                  <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:i<customers.length-1?"1px solid #f3f4f6":"none"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{c.name}</div>
                      <div style={{fontSize:12,color:"#9ca3af"}}>{c.phone||"No phone"} · {txns.length} bill{txns.length!==1?"s":""}</div>
                      {creditDue>0&&<div style={{fontSize:11,color:"#dc2626",fontWeight:700,marginTop:2}}>⚠ Due: {f(creditDue)}</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{f(spent)}</div>
                      <div style={{fontSize:11,color:"#9ca3af"}}>total spent</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab==="history"&&(
          <>
            {isAdmin&&(
              <div style={{display:"flex",background:"#fff",borderRadius:10,padding:4,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}>
                {[["bills","📋 Bills"],["report","📊 Report"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{setHistView(k);setSelectedDay(null);}} style={{flex:1,padding:"9px 0",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",background:histView===k?"#1e3a5f":"transparent",color:histView===k?"#fff":"#9ca3af"}}>{l}</button>
                ))}
              </div>
            )}
            {(histView==="bills"||!isAdmin)&&(
              <div style={card}>
                <div style={{marginBottom:12}}><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 Search by name, invoice, phone..." style={{...inp,fontSize:13}}/></div>
                <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>📋 Bills ({filteredBills.length})</div>
                {filteredBills.length===0
                  ?<div style={{color:"#9ca3af",textAlign:"center",padding:"24px 0"}}>No bills found</div>
                  :filteredBills.map(txn=>{
                    const canEdit=isAdmin&&!(txn.void||txn.cancelled)&&isWithin24Hours(txn.date);
                    const pmtLabel=txn.payments&&txn.payments.length>1?txn.payments.filter(p=>p.amount>0).map(p=>p.mode).join("+"):(txn.payments?.[0]?.mode||txn.paymentMode);
                    const txnCredit=payAmt(txn,"Credit");const isVoid=txn.void||txn.cancelled;
                    return(
                      <div key={txn.id} style={{borderBottom:"1px solid #f3f4f6",paddingBottom:12,marginBottom:12,opacity:isVoid?0.5:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:14}}>{txn.customer?.name} {isVoid&&<span style={{color:"#dc2626",fontSize:11,fontWeight:800,background:"#fee2e2",padding:"1px 6px",borderRadius:4}}>VOID</span>}</div>
                            <div style={{fontSize:11,color:"#9ca3af"}}>{txn.invoiceNo} · {txn.date}</div>
                            {txn.editedAt&&<div style={{fontSize:10,color:"#f59e0b"}}>✏️ Edited: {txn.editedAt}</div>}
                            {txn.voidedAt&&<div style={{fontSize:10,color:"#dc2626"}}>🚫 Voided: {txn.voidedAt}</div>}
                          </div>
                          <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                            <div style={{fontWeight:800,fontSize:15,color:isVoid?"#9ca3af":"#16a34a"}}>{isVoid?"VOID":f(txn.total)}</div>
                            <div style={{fontSize:11,color:"#9ca3af"}}>{pmtLabel}</div>
                            {txnCredit>0&&!isVoid&&<div style={{fontSize:11,color:"#dc2626",fontWeight:700}}>Due: {f(txnCredit)}</div>}
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>setShowReceipt(txn)} style={{background:"#eff6ff",border:"none",borderRadius:6,color:"#2563eb",padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>👁 View</button>
                              {canEdit&&<button onClick={()=>setEditTxn(txn)} style={{background:"#fef3c7",border:"none",borderRadius:6,color:"#92400e",padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>✏️ Edit</button>}
                            </div>
                          </div>
                        </div>
                        {txn.items.map((item,ii)=>(
                          <div key={item.uid||ii} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6b7280",marginTop:3}}>
                            <span>{item.name} × {item.qty} @ {f(item.price)}</span><span style={{color:item.gstRate*100>=settings.gstHigh?"#dc2626":"#16a34a",fontWeight:600}}>{(item.gstRate*100).toFixed(0)}% GST</span>
                          </div>
                        ))}
                      </div>
                    );
                  })
                }
              </div>
            )}
            {isAdmin&&histView==="report"&&(
              <div style={card}>
                <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>📊 Sales Report</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <div style={{flex:1}}><div style={{...lbl,marginBottom:4}}>From</div><input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} style={{...inp,padding:"8px 10px",fontSize:13}}/></div>
                  <div style={{flex:1}}><div style={{...lbl,marginBottom:4}}>To</div><input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} style={{...inp,padding:"8px 10px",fontSize:13}}/></div>
                  <button onClick={()=>{setReportFrom("");setReportTo("");}} style={{marginTop:20,padding:"8px 10px",background:"#f3f4f6",border:"none",borderRadius:8,fontSize:11,fontWeight:700,color:"#6b7280",cursor:"pointer"}}>Clear</button>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                  {[["Today",0],["Yesterday",1],["Last 7 Days",7],["This Month",-1]].map(([label,d])=>(
                    <button key={label} onClick={()=>{const now=new Date();if(d===0){const v=now.toISOString().slice(0,10);setReportFrom(v);setReportTo(v);}else if(d===1){const v=new Date(now-86400000).toISOString().slice(0,10);setReportFrom(v);setReportTo(v);}else if(d===7){const v=new Date(now-7*86400000).toISOString().slice(0,10);setReportFrom(v);setReportTo(now.toISOString().slice(0,10));}else{setReportFrom(new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10));setReportTo(now.toISOString().slice(0,10));}}} style={{padding:"5px 12px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:20,fontSize:11,fontWeight:700,color:"#1e40af",cursor:"pointer"}}>{label}</button>
                  ))}
                </div>
                {filteredTxns.length>0&&(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                      {[["💰 Net Collection",f(rangeTotals.net),"#16a34a","#f0fdf4"],["🧾 Bills",rangeTotals.count+" active"+(rangeTotals.voidCount>0?" · "+rangeTotals.voidCount+" void":""),"#1e3a5f","#eff6ff"],["📋 Taxable",f(rangeTotals.taxable),"#7c3aed","#faf5ff"],["🏛 GST",f(rangeTotals.gst),"#dc2626","#fff1f2"]].map(([label,val,color,bg])=>(
                        <div key={label} style={{background:bg,borderRadius:12,padding:"12px 14px",border:"1px solid #e5e7eb"}}>
                          <div style={{fontSize:11,color:"#6b7280",marginBottom:2}}>{label}</div>
                          <div style={{fontWeight:800,fontSize:16,color}}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:10}}>💳 Payment Breakdown</div>
                      {[["💵 Cash",rangeTotals.cash,"#16a34a"],["📱 UPI",rangeTotals.upi,"#2563eb"],["💳 Card",rangeTotals.card,"#7c3aed"],["📒 Credit (Due)",rangeTotals.credit,"#dc2626"]].map(([label,val,color])=>(
                        <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{fontSize:13,color:"#374151"}}>{label}</span><span style={{fontWeight:800,fontSize:14,color}}>{f(val)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",marginTop:2,borderTop:"2px solid #e5e7eb"}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#1e3a5f"}}>Collected (excl. credit)</span>
                        <span style={{fontWeight:900,fontSize:15,color:"#1e3a5f"}}>{f(rangeTotals.cash+rangeTotals.upi+rangeTotals.card)}</span>
                      </div>
                    </div>
                    <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:8}}>🏛 GST Summary</div>
                      {[["Gross Total",f(rangeTotals.gross)],["Less Discount",f(rangeTotals.discount)],["Taxable Value",f(rangeTotals.taxable)],["CGST (Half)",f(rangeTotals.gst/2)],["SGST (Half)",f(rangeTotals.gst/2)],["Total GST",f(rangeTotals.gst)]].map(([l,v])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"5px 0",borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{color:"#6b7280"}}>{l}</span><span style={{fontWeight:l==="Total GST"||l==="Taxable Value"?800:600,color:l==="Total GST"?"#dc2626":l==="Taxable Value"?"#7c3aed":"#111"}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:14}}>
                      <button onClick={()=>exportReportExcel(filteredTxns,(reportFrom||"all")+"_to_"+(reportTo||"all"),settings.currency)} style={{flex:1,padding:"11px 0",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>📥 Export CSV</button>
                      <button onClick={()=>exportReportExcel(transactions,"ALL",settings.currency)} style={{flex:1,padding:"11px 0",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>📥 Export All</button>
                    </div>
                  </>
                )}
                {/* ✅ FIX 2 & 3: Hover effect + compact day summary (from Lovable) */}
                {!selectedDay&&(
                  <>
                    <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:8}}>📅 Day-wise</div>
                    {getFilteredDays().length===0
                      ?<div style={{color:"#9ca3af",textAlign:"center",padding:"24px 0"}}>No transactions in this range</div>
                      :getFilteredDays().map((day,i)=>{const t=dayTotals(grouped[day]);return(
                        <div key={day} onClick={()=>setSelectedDay(day)} className="day-row" style={{borderBottom:i<getFilteredDays().length-1?"1px solid #f3f4f6":"none",padding:"12px 8px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <div style={{fontWeight:700,fontSize:14}}>{day}</div>
                            <div style={{fontWeight:800,fontSize:15,color:"#16a34a"}}>{f(t.net)}</div>
                          </div>
                          {/* ✅ Compact summary row: count + payment breakdown inline */}
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:11,color:"#9ca3af"}}>
                            <span>{t.count} bill{t.count!==1?"s":""}{t.voidCount>0?" · "+t.voidCount+" void":""}</span>
                            {t.cash>0&&<span>💵 {f(t.cash)}</span>}
                            {t.upi>0&&<span>📱 {f(t.upi)}</span>}
                            {t.card>0&&<span>💳 {f(t.card)}</span>}
                            {t.credit>0&&<span style={{color:"#dc2626",fontWeight:700}}>Due: {f(t.credit)}</span>}
                          </div>
                        </div>
                      );})}
                  </>
                )}
                {selectedDay&&(()=>{const t=dayTotals(grouped[selectedDay]);return(
                  <div>
                    <button onClick={()=>setSelectedDay(null)} style={{background:"#eff6ff",border:"none",borderRadius:8,padding:"8px 14px",color:"#1e3a5f",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:12}}>← Back to days</button>
                    <div style={{fontWeight:800,fontSize:16,color:"#1e3a5f",marginBottom:2}}>{selectedDay}</div>
                    <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>{t.count} active · {t.voidCount} void</div>
                    {[["Gross Total",f(t.gross)],["Less Discount",f(t.discount)],["Taxable",f(t.taxable)],["GST",f(t.gst)],["Net Collection",f(t.net)]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                        <span style={{color:"#6b7280"}}>{l}</span><span style={{fontWeight:l==="Net Collection"?900:600,color:l==="Net Collection"?"#16a34a":"#111",fontSize:l==="Net Collection"?17:14}}>{v}</span>
                      </div>
                    ))}
                    <div style={{marginTop:14,marginBottom:8,fontWeight:700,fontSize:13,color:"#1e3a5f"}}>Payment Breakup</div>
                    {[["💵 Cash",t.cash,"#16a34a"],["📱 UPI",t.upi,"#2563eb"],["💳 Card",t.card,"#7c3aed"],["📒 Credit (Due)",t.credit,"#dc2626"]].map(([m,v,c])=>(
                      <div key={m} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}><span style={{color:"#6b7280"}}>{m}</span><span style={{fontWeight:700,color:c}}>{f(v)}</span></div>
                    ))}
                    <button onClick={()=>exportReportExcel(grouped[selectedDay],selectedDay,settings.currency)} style={{width:"100%",marginTop:14,padding:"11px 0",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>📥 Export This Day CSV</button>
                  </div>
                );})()}
              </div>
            )}
          </>
        )}

        {tab==="products"&&isAdmin&&(
          <>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:4}}>➕ Add Product</div>
              <div style={{fontSize:12,color:"#9ca3af",marginBottom:12}}>★ = Fixed GST override · Default = threshold-based ({settings.gstLow}% / {settings.gstHigh}%)</div>
              <div style={{marginBottom:10}}><label style={lbl}>Product Name</label><FInput value={newProdName} onChange={e=>setNewProdName(e.target.value)} placeholder="e.g. Silk Saree"/></div>
              <div style={{marginBottom:12}}><label style={lbl}>GST Rate</label><GstSelect value={newProdGst} onChange={setNewProdGst}/></div>
              {prodMsg&&<div style={{fontSize:13,marginBottom:8,color:prodMsg.includes("added")?"#16a34a":"#dc2626",background:prodMsg.includes("added")?"#f0fdf4":"#fee2e2",padding:"6px 10px",borderRadius:6}}>{prodMsg.includes("added")?"✅ ":"⚠ "}{prodMsg}</div>}
              <button onClick={handleAddProduct} style={{width:"100%",padding:"12px 0",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer"}}>Add Product</button>
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>📦 Products ({products.length})</div>
              {products.length===0&&<div style={{color:"#9ca3af",fontSize:13,textAlign:"center",padding:"20px 0",background:"#f9fafb",borderRadius:8}}>No products yet.</div>}
              {products.map((p,i)=>(
                <div key={p.id||p.name} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:i<products.length-1?"1px solid #f3f4f6":"none"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14}}>{p.name}</div>
                    <div style={{fontSize:11,color:p.gstOverride!==null&&p.gstOverride!==undefined?"#7c3aed":"#9ca3af"}}>{p.gstOverride!==null&&p.gstOverride!==undefined?"★ Fixed: "+p.gstOverride+"%":"Default (threshold-based)"}</div>
                  </div>
                  <GstSelect value={p.gstOverride} onChange={v=>updateProduct({...p,gstOverride:v==="default"?null:parseFloat(v)})}/>
                  <button onClick={()=>{if(window.confirm("Delete \""+p.name+"\"?"))removeProduct(p.id);}} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#dc2626",padding:"8px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="settings"&&isAdmin&&(
          <>
            <div style={{background:"#fef3c7",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#92400e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>🏪 <b>{shopCode}</b></span>
              <button onClick={handleChangeShop} style={{background:"none",border:"1px solid #92400e",borderRadius:6,color:"#92400e",padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Switch Shop</button>
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>🏪 Shop Info</div>
              {[["shopName","Shop Name"],["shopTagline","Tagline / Slogan"],["shopAddress","Address"],["shopPhone","Phone"],["shopEmail","Email ID"],["gstin","GSTIN"],["stateCode","State Code"]].map(([k,l])=>(
                <div key={k} style={{marginBottom:10}}><label style={lbl}>{l}</label><FInput value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>🧾 Invoice Footer</div>
              {[["footerNote","Footer Note"],["signoff","Sign-off Text"]].map(([k,l])=>(
                <div key={k} style={{marginBottom:10}}><label style={lbl}>{l}</label><FInput value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>🏛 GST Config</div>
              {[["gstLow","GST Low Rate (%)"],["gstHigh","GST High Rate (%)"],["gstThreshold","Taxable Threshold (₹)"]].map(([k,l])=>(
                <div key={k} style={{marginBottom:10}}><label style={lbl}>{l}</label><input type="number" value={draftSettings[k]} onChange={e=>setDraftSettings(p=>({...p,[k]:parseFloat(e.target.value)||0}))} style={inp}/></div>
              ))}
              <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#1e40af"}}>
                <b>Rule:</b> If item (after discount) ≥ {settings.currency}{(settings.gstThreshold*(1+settings.gstLow/100)).toFixed(0)} → {settings.gstHigh}% GST, otherwise {settings.gstLow}%
              </div>
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>⚙️ Billing Options</div>
              <div style={{marginBottom:10}}><label style={lbl}>Currency Symbol</label><input value={draftSettings.currency} onChange={e=>setDraftSettings(p=>({...p,currency:e.target.value}))} style={{...inp,width:80}}/></div>
              <div style={{marginBottom:12}}><label style={lbl}>Default Payment Mode</label>
                <select value={draftSettings.defaultPaymentMode} onChange={e=>setDraftSettings(p=>({...p,defaultPaymentMode:e.target.value}))} style={inp}>
                  {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"10px 12px",background:"#f9fafb",borderRadius:8}}>
                <input type="checkbox" id="disc" checked={draftSettings.enableDiscount} onChange={e=>setDraftSettings(p=>({...p,enableDiscount:e.target.checked}))} style={{width:18,height:18,accentColor:"#1e3a5f"}}/>
                <label htmlFor="disc" style={{fontSize:14,fontWeight:600,cursor:"pointer"}}>Enable Discount Field</label>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8}}>
                <input type="checkbox" id="voice" checked={draftSettings.enableVoice||false} onChange={e=>setDraftSettings(p=>({...p,enableVoice:e.target.checked}))} style={{width:18,height:18,accentColor:"#1e3a5f"}}/>
                <label htmlFor="voice" style={{fontSize:14,fontWeight:600,cursor:"pointer"}}>🎤 Enable Voice Recognition</label>
              </div>
              {draftSettings.enableVoice&&<div style={{marginTop:8,background:"#eff6ff",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#1e40af"}}>Works on Chrome. Say: "silk saree 1500 2"</div>}
            </div>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f",marginBottom:12}}>🔐 PIN Management</div>
              {[["adminPin","Admin PIN"],["staffPin","Staff PIN"]].map(([k,l])=>(
                <div key={k} style={{marginBottom:12}}>
                  <label style={lbl}>{l}</label>
                  <input type="password" maxLength={4} value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="4-digit PIN" style={{...inp,width:130,letterSpacing:8,fontSize:20}} inputMode="numeric"/>
                </div>
              ))}
            </div>
            <button onClick={handleSaveSettings} style={{width:"100%",padding:"14px 0",background:"#1e3a5f",color:"#fff",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",marginBottom:12,boxShadow:"0 4px 12px rgba(30,58,95,0.3)"}}>💾 Save Settings</button>
          </>
        )}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#fff",borderTop:"1px solid #e5e7eb",display:"flex",zIndex:50,boxShadow:"0 -2px 8px rgba(0,0,0,0.06)"}}>
        {navTabs.map(([key,icon,l])=>(
          <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"10px 0 8px",border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===key?"#1e3a5f":"#9ca3af",borderTop:tab===key?"2px solid #1e3a5f":"2px solid transparent",transition:"color 0.15s"}}>
            <span style={{fontSize:20}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:tab===key?800:500,letterSpacing:0.3}}>{l}</span>
          </button>
        ))}
      </div>

      {showReceipt&&<InvoiceView txn={showReceipt} settings={settings} onClose={()=>setShowReceipt(null)}/>}
      {editTxn&&<EditInvoiceModal txn={editTxn} products={products} settings={settings} onSave={handleEditSave} onCancel={()=>setEditTxn(null)} onVoidInvoice={()=>handleVoidInvoice(editTxn)}/>}
      {showCreditModal&&<CreditCustomerModal customers={customers} onConfirm={cust=>handleConfirmPayment(cust)} onCancel={()=>setShowCreditModal(false)} netAmount={netAmount} currency={settings.currency}/>}
    </div>
  );
}
