(function(){
const SU='https://vbnucvzjlcghrmqxjldp.supabase.co';
const SK='sb_publishable_VGfoUAU6e0zlXzkY2y8iBw_lYeOKU7K';
const LOCAL_LABELS={'1-AZUCA':'Azuca','2-AZAFRAN':'Azafrán','3-NIETO':'Nieto Senetiner','4-VIÑA COBOS':'Viña Cobos','5-TRAPICHE':'Espacio Trapiche','VINOBIEN':'Vinobien'};
const DIAS=['Lun.','Mar.','Mié.','Jue.','Vie.','Sáb.','Dom.'];
const CARGOS_POR_SECTOR={
  'COCINA':['CHEF EJECUTIVO','SOUS CHEF','ASESOR SOUS CHEF','LIDER DE COCINA','CAPITAN DE COCINA','COCINERO SENIOR','COCINERO','BACHERO SENIOR','BACHERO','GERENTE DE AREA','EVENTUAL','OTRO'],
  'SALA':['ENCARGADO DE LOCAL','JEFE DE OPERACIONES','LIDER SALA','LIDER DE SALA','CAPITAN DE CAMAREROS','JEFE SALA TRAP','CAMARERO SENIOR','CAMARERO','AYUDANTE DE SALA','GESTION DE RESERVAS','BARTENDER SOMMELIER','GERENTE DE AREA','EVENTUAL','OTRO'],
  'CAVA':['JEFE DE BEBIDAS','SOMM SENIOR','SOMM','SOMMELIER','BARTENDER SOMMELIER','GERENTE DE AREA','EVENTUAL','OTRO'],
  'ORDENANZA':['JEFE DE ORDENANZA','ORDENANZA SENIOR','ORDENANZA','GERENTE DE AREA','EVENTUAL','OTRO'],
  'SEGURIDAD':['JEFE DE SEGURIDAD','SEGURIDAD','GERENTE DE AREA','EVENTUAL','OTRO'],
  'ADMINISTRACION':['GERENTE DE ADMINISTRACION','GERENTE DE AREA','JEFE DE COMPRAS','TESORERO','LOGISTICA','ADMINISTRATIVO','ADMINISTRATIVO PARTIME','OTRO'],
  'GERENCIA':['GERENTE GENERAL','GERENTE DE SERVICIO','GERENTE DE GASTRONOMIA','GERENTE DE ADMINISTRACION','GERENTE DE MARKETING','GERENTE DE AREA','OTRO'],
};

let CU=null,EMPLEADOS=[],USUARIOS_R=[],SEMANA_ACTUAL=null,LOCAL_ACTUAL=null,LOCALES_VISIBLES=[];
let TURNOS_MAP={},SEMANA_ID=null,SEMANA_OBJ=null,SEMANA_EMP=null,INC_MAP={};
let eEmpId=null,eUserId=null;

// ── API ─────────────────────────────────────────
async function api(p,m='GET',b=null){
  const o={method:m,headers:{'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+SK,'Prefer':m==='POST'?'return=representation':''}};
  if(b)o.body=JSON.stringify(b);
  try{const r=await fetch(SU+'/rest/v1/'+p,o);if(r.status===204)return true;const d=await r.json();if(!r.ok){console.error(d);return null;}return d;}
  catch(e){console.error(e);return null;}
}
async function apiUpsert(table,body,onConflict=[]){
  const conflict=onConflict.join(',');
  const url=SU+'/rest/v1/'+table+(conflict?`?on_conflict=${encodeURIComponent(conflict)}`:'');
  const o={method:'POST',headers:{'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+SK,'Prefer':'resolution=merge-duplicates, return=representation'}};
  o.body=JSON.stringify(body);
  try{const r=await fetch(url,o);if(r.status===204)return true;const d=await r.json();if(!r.ok){console.error(d);return null;}return d;}
  catch(e){console.error(e);return null;}
}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function toast(m,d=3000){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),d);}
function esc(s){if(s==null)return '';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(d){if(!d)return '';const dt=new Date(d+'T12:00:00');return `${dt.getDate()}-${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][dt.getMonth()]}`;}
function getLunes(d){const dt=new Date(d);const day=dt.getDay();const diff=day===0?-6:1-day;dt.setDate(dt.getDate()+diff);return dt.toISOString().split('T')[0];}
function addDays(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];}
function diasDeSemana(l){return Array.from({length:7},(_,i)=>addDays(l,i));}
function formatSemana(l){const d=diasDeSemana(l);return `Semana del ${fmt(d[0])} al ${fmt(d[6])}`;}

// ── PERFIL ───────────────────────────────────────
function esMaster(){return CU?.perfil==='master';}
function esDiaPasado(dia){
  // Master puede editar cualquier día
  if(esMaster())return false;
  // Comparar día (YYYY-MM-DD) contra hoy local
  const hoy=new Date();
  const hoyStr=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  return dia<hoyStr;
}
function esEditorPerfil(){return CU?.perfil==='master'||CU?.perfil==='editor';}
function puedeEditarLocal(local){
  if(esMaster())return true;
  if(CU?.perfil!=='editor')return false;
  if(!CU.locales_editor||!CU.locales_editor.length)return true;
  return CU.locales_editor.includes(local);
}

// ── LOGIN ───────────────────────────────────────
async function doLogin(){
  const u=document.getElementById('loginUser').value.trim().toLowerCase();
  const p=document.getElementById('loginPass').value;
  if(!u||!p)return;
  const h=await sha256(p);
  const r=await api(`roster_usuarios?usuario=eq.${encodeURIComponent(u)}&password_hash=eq.${h}&activo=eq.true&select=*`);
  if(!r||!r.length){document.getElementById('loginErr').style.display='block';return;}
  CU=r[0];sessionStorage.setItem('az_roster_cu',JSON.stringify(CU));
  document.getElementById('loginErr').style.display='none';
  afterLogin();
}
window.doLogin=doLogin;
document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
function doLogout(){CU=null;sessionStorage.removeItem('az_roster_cu');showView('vLogin');}
window.doLogout=doLogout;
function afterLogin(){
  const perfil={master:'⭐ Master',editor:'✏️ Editor',usuario:'👤 Usuario'}[CU.perfil]||CU.perfil;
  document.getElementById('dashUser').textContent=`${CU.nombre} · ${perfil}`;
  buildDash();showView('vDash');
}
function checkSession(){const s=sessionStorage.getItem('az_roster_cu');if(s){CU=JSON.parse(s);afterLogin();}else showView('vLogin');}

// ── DASHBOARD ────────────────────────────────────
function buildDash(){
  const cards=[];
  if(esEditorPerfil())cards.push({i:'📅',t:'Roster Semanal',d:'Ver y editar turnos del equipo',a:"showView('vRoster')"});
  cards.push({i:'📱',t:'Mi Semana',d:'Ver mis turnos asignados',a:"showView('vMiSemanaView')"});
  if(esEditorPerfil())cards.push({i:'⚠️',t:'Incidencias',d:'Tardanzas, ausencias y cambios',a:"showView('vIncidencias')"});
  if(esMaster()){
    cards.push({i:'👥',t:'Colaboradores',d:'Gestión del personal',a:"showView('vEmpleados')"});
    cards.push({i:'🔑',t:'Usuarios y Accesos',d:'Gestión de perfiles y contraseñas',a:"showView('vUsuarios')"});
    cards.push({i:'📋',t:'Turnos Estándar',d:'Plantillas de turnos semanales',a:"showView('vTurnos')"});
  }
  document.getElementById('dashGrid').innerHTML=cards.map(c=>`
    <div class="dash-card" onclick="${c.a}">
      <div class="dash-icon">${c.i}</div>
      <div class="dash-title">${c.t}</div>
      <div class="dash-desc">${c.d}</div>
    </div>`).join('');
}

// ── VIEWS ─────────────────────────────────────────
function showView(id){
  if((id==='vRoster'||id==='vIncidencias')&&!esEditorPerfil()){toast('Sin permiso');return;}
  if((id==='vEmpleados'||id==='vUsuarios'||id==='vTurnos')&&!esMaster()){toast('Solo master');return;}
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id==='vMiSemanaView'?'vMiSemana':id).classList.add('active');
  if(id==='vRoster')initRoster();
  if(id==='vMiSemanaView')initMiSemana();
  if(id==='vIncidencias')loadIncidencias();
  if(id==='vEmpleados')loadEmpleados();
  if(id==='vUsuarios')loadUsuarios();
  if(id==='vTurnos')showView_vTurnos();
  // Auto-refresh de incidencias solo en el roster
  if(window._incRefreshTimer){clearInterval(window._incRefreshTimer);window._incRefreshTimer=null;}
  if(id==='vRoster'){
    window._incRefreshTimer=setInterval(refrescarIncidencias,30000);
  }
}
window.showView=showView;

// Refresca solo el INC_MAP y vuelve a renderizar la grilla, sin recargar turnos
async function refrescarIncidencias(){
  // Solo correr si el roster está activo
  const vRoster=document.getElementById('vRoster');
  if(!vRoster||!vRoster.classList.contains('active'))return;
  if(!SEMANA_ACTUAL)return;
  const dias7=diasDeSemana(SEMANA_ACTUAL);
  const desde=dias7[0],hasta=dias7[6];
  const incs=await api(`incidencias?fecha=gte.${desde}&fecha=lte.${hasta}&select=*&order=creado_en.desc`)||[];
  const nuevoMap={};
  incs.forEach(inc=>{
    const k=`${inc.empleado_id}_${inc.fecha}`;
    if(!nuevoMap[k])nuevoMap[k]=inc;
  });
  // Si cambió algo, re-renderizar
  const cambio=JSON.stringify(Object.keys(INC_MAP).sort().map(k=>[k,INC_MAP[k].id,INC_MAP[k].estado]))
              !==JSON.stringify(Object.keys(nuevoMap).sort().map(k=>[k,nuevoMap[k].id,nuevoMap[k].estado]));
  INC_MAP=nuevoMap;
  if(cambio)renderRosterTable(puedeEditarLocal(LOCAL_ACTUAL));
}

// Refrescar al volver a la pestaña
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    const vRoster=document.getElementById('vRoster');
    if(vRoster&&vRoster.classList.contains('active'))refrescarIncidencias();
  }
});
function openOv(id){document.getElementById(id).classList.add('open');}
function closeOv(id){document.getElementById(id).classList.remove('open');}
window.closeOv=closeOv;
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

// ── ROSTER ────────────────────────────────────────
async function initRoster(){
  if(!SEMANA_ACTUAL)SEMANA_ACTUAL=getLunes(new Date().toISOString().split('T')[0]);
  await loadEmpleados(false);
  // Only show locales this editor can see
  LOCALES_VISIBLES=Object.keys(LOCAL_LABELS).filter(l=>esMaster()||puedeEditarLocal(l));
  if(!LOCAL_ACTUAL||!LOCALES_VISIBLES.includes(LOCAL_ACTUAL))LOCAL_ACTUAL=LOCALES_VISIBLES[0];
  buildLocalTabs();
  await loadRoster();
}
function buildLocalTabs(){
  const locales=LOCALES_VISIBLES&&LOCALES_VISIBLES.length?LOCALES_VISIBLES:Object.keys(LOCAL_LABELS);
  document.getElementById('localTabs').innerHTML=locales.map(l=>`
    <div class="local-tab ${l===LOCAL_ACTUAL?'active':''}" onclick="cambiarLocal('${l}')">${esc(LOCAL_LABELS[l])}</div>`).join('');
}
window.cambiarLocal=async function(l){
  if(!puedeEditarLocal(l)){toast('Sin permiso para este local');return;}
  LOCAL_ACTUAL=l;buildLocalTabs();await loadRoster();
};
function cambiarSemana(n){SEMANA_ACTUAL=addDays(SEMANA_ACTUAL,n*7);loadRoster();}
window.cambiarSemana=cambiarSemana;

async function loadRoster(){
  document.getElementById('weekLabel').textContent=formatSemana(SEMANA_ACTUAL);
  const puedeEditar=puedeEditarLocal(LOCAL_ACTUAL);
  const semanas=await api(`roster_semanas?local=eq.${encodeURIComponent(LOCAL_ACTUAL)}&fecha_lunes=eq.${SEMANA_ACTUAL}&select=*`);
  if(semanas&&semanas.length){SEMANA_OBJ=semanas[0];SEMANA_ID=semanas[0].id;}
  else{SEMANA_OBJ=null;SEMANA_ID=null;}
  const cg=document.getElementById('commentGeneral');
  const cgTxt=document.getElementById('commentGeneralTxt');
  cg.style.display=puedeEditar?'flex':'none';
  if(puedeEditar)cgTxt.value=SEMANA_OBJ?.comentario_general||'';
  TURNOS_MAP={};
  if(SEMANA_ID){
    const t=await api(`roster_turnos?semana_id=eq.${SEMANA_ID}&select=*`);
    (t||[]).forEach(t=>{TURNOS_MAP[`${t.empleado_id}_${t.dia}`]=t;});
  }
  // Cargar incidencias del rango de la semana
  INC_MAP={};
  const dias7=diasDeSemana(SEMANA_ACTUAL);
  const desde=dias7[0],hasta=dias7[6];
  const incs=await api(`incidencias?fecha=gte.${desde}&fecha=lte.${hasta}&select=*&order=creado_en.desc`)||[];
  // Indexar por empleado_fecha; al ser order=desc, la primera que entra es la más reciente
  incs.forEach(inc=>{
    const k=`${inc.empleado_id}_${inc.fecha}`;
    if(!INC_MAP[k])INC_MAP[k]=inc;
  });
  renderRosterTable(puedeEditar);
}
function renderRosterTable(puedeEditar){
  const dias=diasDeSemana(SEMANA_ACTUAL);
  const emps=EMPLEADOS.filter(e=>e.local===LOCAL_ACTUAL&&e.activo!==false);
  document.getElementById('rosterHead').innerHTML=`<tr>
    <th class="emp-col">Colaborador</th>
    ${dias.map((d,i)=>`<th>${DIAS[i]}<br><small style="font-weight:400;font-size:10px">${fmt(d)}</small></th>`).join('')}
  </tr>`;
  if(!emps.length){document.getElementById('rosterBody').innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:24px">Sin colaboradores para este local</td></tr>`;return;}
  document.getElementById('rosterBody').innerHTML=emps.map(emp=>`
    <tr>
      <td class="emp-cell">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>${esc(emp.apellido||emp.nombre)}<div class="sector">${esc(emp.sector||'')} · ${esc(emp.categoria||'')}</div></div>
          ${puedeEditar?`<button onclick="abrirAplicarTE(${emp.id})" title="Aplicar turno estándar" style="background:none;border:1px solid var(--sand);border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer;color:var(--gray);white-space:nowrap">📋</button>`:''}
        </div>
      </td>
      ${dias.map(dia=>{
        const key=`${emp.id}_${dia}`;const t=TURNOS_MAP[key];
        const pasado=esDiaPasado(dia);
        const editable=puedeEditar&&!pasado;
        const onclick=editable?`onclick="editTurno(${emp.id},'${dia}')"` :'';
        const cls=`turno-cell${editable?'':' readonly'}${pasado?' pasado':''}`;
        const tip=pasado?' title="Día pasado - no editable"':'';
        const cmt=t?.comentario?`<div class="turno-comment">💬 ${esc(t.comentario)}</div>`:'';
        // Punto de incidencia (más reciente del día)
        const inc=INC_MAP[`${emp.id}_${dia}`];
        const dot=inc?`<span class="inc-dot ${inc.estado}" title="Incidencia: ${inc.estado}" onclick="event.stopPropagation();verIncidencia(${inc.id})"></span>`:'';
        if(t&&t.es_off)return`<td><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-off">OFF</span>${cmt}</div></td>`;
        if(t&&t.es_flex){
          const horaTxt=t.hora_entrada?`<div class="turno-flex-hora">${t.hora_entrada.slice(0,5)}</div>`:'';
          return`<td><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-flex">🔄 FLEX</span>${horaTxt}${cmt}</div></td>`;
        }
        if(t&&t.hora_entrada)return`<td><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-hora">${t.hora_entrada.slice(0,5)}</span>${cmt}</div></td>`;
        return`<td><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-vacio">${editable?'+ agregar':'—'}</span></div></td>`;
      }).join('')}
    </tr>`).join('');
}
window.guardarCommentGeneral=async function(){
  const txt=document.getElementById('commentGeneralTxt').value.trim();
  if(!SEMANA_ID){const r=await apiUpsert('roster_semanas',{local:LOCAL_ACTUAL,fecha_lunes:SEMANA_ACTUAL,comentario_general:txt,creado_por:CU.id},['local','fecha_lunes']);if(r&&r.length){SEMANA_ID=r[0].id;SEMANA_OBJ=r[0];}}
  else await api(`roster_semanas?id=eq.${SEMANA_ID}`,'PATCH',{comentario_general:txt});
};

// ── TURNO ─────────────────────────────────────────
window.editTurno=function(empId,dia){
  if(esDiaPasado(dia)){toast('No se pueden editar días pasados');return;}
  const t=TURNOS_MAP[`${empId}_${dia}`];
  const emp=EMPLEADOS.find(e=>e.id===empId);
  document.getElementById('turnoTitle').textContent=`${emp?.apellido||emp?.nombre||''} — ${fmt(dia)}`;
  document.getElementById('turnoEmpId').value=empId;
  document.getElementById('turnoDia').value=dia;
  const he=t?.hora_entrada?.slice(0,5)||'';
  document.getElementById('turnoHoraH').value=he?he.split(':')[0]:'';
  document.getElementById('turnoHoraM').value=he?he.split(':')[1]||'00':'00';
  document.getElementById('turnoComment').value=t?.comentario||'';
  const modo=t?.es_off?'off':(t?.es_flex?'flex':'work');
  setTurnoMode(modo);
  openOv('ovTurno');
};
window.setTurnoMode=function(m){
  document.getElementById('btnWork').className='off-btn'+(m==='work'?' active-work':'');
  document.getElementById('btnFlex').className='off-btn'+(m==='flex'?' active-flex':'');
  document.getElementById('btnOff').className='off-btn'+(m==='off'?' active-off':'');
  document.getElementById('turnoHoraWrap').style.display=m==='off'?'none':'block';
  document.getElementById('turnoHoraLabel').textContent=m==='flex'?'Hora orientativa (opcional)':'Hora';
};
window.guardarTurno=async function(){
  const empId=parseInt(document.getElementById('turnoEmpId').value);
  const dia=document.getElementById('turnoDia').value;
  const esOff=document.getElementById('btnOff').classList.contains('active-off');
  const esFlex=document.getElementById('btnFlex').classList.contains('active-flex');
  const h=document.getElementById('turnoHoraH').value;
  const m=document.getElementById('turnoHoraM').value;
  const hora=h?(h+':'+m):null;
  const comment=document.getElementById('turnoComment').value.trim();
  // Validación: si es modo Trabajo, la hora es obligatoria
  if(!esOff&&!esFlex&&!hora){toast('Elegí una hora o seleccioná Flex u OFF');return;}
  if(!SEMANA_ID){
    const existing=await api(`roster_semanas?local=eq.${encodeURIComponent(LOCAL_ACTUAL)}&fecha_lunes=eq.${SEMANA_ACTUAL}&select=*`);
    if(existing&&existing.length){SEMANA_ID=existing[0].id;SEMANA_OBJ=existing[0];}
    else{
      const r=await apiUpsert('roster_semanas',{local:LOCAL_ACTUAL,fecha_lunes:SEMANA_ACTUAL,creado_por:CU.id},['local','fecha_lunes']);
      if(r&&r.length){SEMANA_ID=r[0].id;SEMANA_OBJ=r[0];}else{toast('Error al crear semana');return;}
    }
  }
  const key=`${empId}_${dia}`;
  const existing=TURNOS_MAP[key];
  const data={semana_id:SEMANA_ID,empleado_id:empId,dia,es_off:esOff,es_flex:esFlex,hora_entrada:esOff?null:hora,comentario:comment||null};
  if(existing){await api(`roster_turnos?id=eq.${existing.id}`,'PATCH',data);TURNOS_MAP[key]={...existing,...data};}
  else{const r=await api('roster_turnos','POST',data);if(r&&r.length)TURNOS_MAP[key]=r[0];}
  closeOv('ovTurno');renderRosterTable(true);toast('✓ Turno guardado');
};
window.borrarTurno=async function(){
  const empId=parseInt(document.getElementById('turnoEmpId').value);
  const dia=document.getElementById('turnoDia').value;
  const key=`${empId}_${dia}`;
  const existing=TURNOS_MAP[key];
  if(existing){await api(`roster_turnos?id=eq.${existing.id}`,'DELETE');delete TURNOS_MAP[key];}
  closeOv('ovTurno');renderRosterTable(true);toast('Turno eliminado');
};

// ── MI SEMANA ─────────────────────────────────────
async function initMiSemana(){
  if(!SEMANA_EMP)SEMANA_EMP=getLunes(new Date().toISOString().split('T')[0]);
  const bEl=document.getElementById('miSemBienvenido');
  if(bEl&&CU)bEl.textContent='Bienvenido/a, '+CU.nombre+'!';
  const emp=CU.empleado_id?(await api(`empleados?id=eq.${CU.empleado_id}&select=*`))?.[0]:null;
  await renderMiSemana(emp);
}
async function renderMiSemana(emp){
  document.getElementById('weekLabelEmp').textContent=formatSemana(SEMANA_EMP);
  const dias=diasDeSemana(SEMANA_EMP);
  let turnos={},comentGeneral='',incPorDia={};
  if(emp){
    const s=await api(`roster_semanas?local=eq.${encodeURIComponent(emp.local)}&fecha_lunes=eq.${SEMANA_EMP}&select=*`);
    if(s&&s.length){comentGeneral=s[0].comentario_general||'';
      const tt=await api(`roster_turnos?semana_id=eq.${s[0].id}&empleado_id=eq.${emp.id}&select=*`);
      (tt||[]).forEach(t=>{turnos[t.dia]=t;});
    }
    // Cargar incidencias del propio empleado
    const desde=dias[0],hasta=dias[6];
    const incs=await api(`incidencias?empleado_id=eq.${emp.id}&fecha=gte.${desde}&fecha=lte.${hasta}&select=*&order=creado_en.desc`)||[];
    incs.forEach(inc=>{if(!incPorDia[inc.fecha])incPorDia[inc.fecha]=inc;});
  }
  document.getElementById('miSemanaGrid').innerHTML=dias.map((dia,i)=>{
    const t=turnos[dia];const esOff=t?.es_off;const esFlex=t?.es_flex;
    let txt;
    if(esOff)txt='OFF';
    else if(esFlex)txt=t?.hora_entrada?`🔄 FLEX ${t.hora_entrada.slice(0,5)}`:'🔄 FLEX';
    else txt=t?.hora_entrada?t.hora_entrada.slice(0,5):'—';
    const inc=incPorDia[dia];
    const dot=inc?`<span class="inc-dot ${inc.estado}" title="Tu incidencia (${inc.estado==='pendiente'?'pendiente':'procesada'})" onclick="verIncidencia(${inc.id})"></span>`:'';
    return`<div class="dia-card ${esOff?'off':''}" style="position:relative">
      ${dot}
      <div class="dia-nombre">${DIAS[i]}</div>
      <div class="dia-fecha">${fmt(dia)}</div>
      <div class="dia-hora">${txt}</div>
      ${t?.comentario?`<div class="dia-comment">💬 ${esc(t.comentario)}</div>`:''}
    </div>`;}).join('');
  const cg=document.getElementById('miComentGeneral');
  if(comentGeneral){cg.style.display='block';cg.innerHTML=`💬 <em>${esc(comentGeneral)}</em>`;}
  else cg.style.display='none';
}
function cambiarSemanaEmp(n){SEMANA_EMP=addDays(SEMANA_EMP,n*7);initMiSemana();}
window.cambiarSemanaEmp=cambiarSemanaEmp;

// ── INCIDENCIAS ───────────────────────────────────
window.openIncidenciaModal=function(){
  document.getElementById('incFecha').value=new Date().toISOString().split('T')[0];
  document.getElementById('incDesc').value='';
  openOv('ovIncidencia');
};
window.guardarIncidencia=async function(){
  const tipo=document.getElementById('incTipo').value;
  const fecha=document.getElementById('incFecha').value;
  const desc=document.getElementById('incDesc').value.trim();
  if(!fecha){toast('Elegí una fecha');return;}
  if(!desc){toast('Describí la incidencia');return;}
  if(!CU.empleado_id){toast('Tu usuario no está vinculado a un colaborador. Pedile al admin que lo configure.');return;}
  await api('incidencias','POST',{empleado_id:CU.empleado_id,fecha,tipo,descripcion:desc,estado:'pendiente'});
  closeOv('ovIncidencia');toast('✓ Incidencia enviada');
};
window.loadIncidencias=async function(){
  const local=document.getElementById('incFiltLocal').value;
  const estado=document.getElementById('incFiltEstado').value;
  let q='incidencias?select=*,empleado:empleado_id(nombre,apellido,local,sector)&order=creado_en.desc&limit=100';
  if(estado==='pendiente')q+=`&estado=eq.pendiente`;
  else if(estado==='procesada')q+=`&estado=in.(aprobado,rechazado)`;
  const data=await api(q)||[];
  // Filtrar por locales que el editor puede ver
  let visibles=data.filter(i=>puedeEditarLocal(i.empleado?.local));
  // Filtro adicional por dropdown de local
  const filtered=local?visibles.filter(i=>i.empleado?.local===local):visibles;
  const list=document.getElementById('incList');
  if(!filtered.length){list.innerHTML=`<div class="empty"><div class="icon">✅</div><p>Sin incidencias</p></div>`;return;}
  const TIPOS={tardanza:'⏰ Llegada tarde',ausencia:'❌ Ausencia',enfermedad:'🤒 Enfermedad',cambio_turno:'🔄 Cambio de turno',otro:'📝 Otro'};
  list.innerHTML=filtered.map(i=>`
    <div class="inc-card">
      <div class="inc-info">
        <div class="nombre">${esc(i.empleado?.apellido||i.empleado?.nombre||'—')}</div>
        <div class="meta">${esc(LOCAL_LABELS[i.empleado?.local]||'—')} · ${esc(i.empleado?.sector||'')} · ${fmt(i.fecha)}</div>
        <div style="margin-top:4px"><span class="badge ${i.estado==='pendiente'?'b-pendiente':'b-procesada'}">${TIPOS[i.tipo]||esc(i.tipo)}</span></div>
        ${i.descripcion?`<div class="desc" style="margin-top:4px;font-size:12px">${esc(i.descripcion)}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <span class="badge ${i.estado==='pendiente'?'b-pendiente':'b-procesada'}">${i.estado==='pendiente'?'⏳ Pendiente':i.estado==='aprobado'?'✓ Procesada · Aceptada':'✓ Procesada · Denegada'}</span>
        ${i.estado==='pendiente'&&puedeEditarLocal(i.empleado?.local)?`
          <div style="display:flex;gap:6px">
            <button class="btn bp" style="padding:5px 10px;font-size:11px" title="Aprobar" onclick="resolverInc(${i.id},'aprobado')">✓</button>
            <button class="btn bx" style="padding:5px 10px;font-size:11px" title="Rechazar" onclick="resolverInc(${i.id},'rechazado')">✗</button>
          </div>`:''}
      </div>
    </div>`).join('');
};
window.resolverInc=async function(id,estado){
  const r=await api(`incidencias?id=eq.${id}`,'PATCH',{estado,revisado_por:CU.id,revisado_en:new Date().toISOString()});
  if(r===null){toast('Error al guardar el cambio');return;}
  toast(estado==='aprobado'?'✓ Aceptada':'✓ Denegada');
  loadIncidencias();
};

// Ver incidencia desde la grilla del roster
window.verIncidencia=async function(id){
  // Buscar la incidencia en INC_MAP (puede no estar si fue creada después de cargar)
  let inc=Object.values(INC_MAP).find(x=>x.id===id);
  if(!inc){
    const r=await api(`incidencias?id=eq.${id}&select=*`);
    if(!r||!r.length){toast('No se encontró la incidencia');return;}
    inc=r[0];
  }
  const emp=EMPLEADOS.find(e=>e.id===inc.empleado_id);
  const TIPOS={tardanza:'⏰ Llegada tarde',ausencia:'❌ Ausencia',enfermedad:'🤒 Enfermedad',cambio_turno:'🔄 Cambio de turno',otro:'📝 Otro'};
  const ESTADOS={pendiente:'⏳ Pendiente',aprobado:'✓ Procesada · Aceptada',rechazado:'✓ Procesada · Denegada'};
  document.getElementById('incDetTitle').textContent=`Incidencia — ${emp?.apellido||emp?.nombre||''}`;
  // Si tiene revisor, traerlo
  let revisorNombre='';
  if(inc.revisado_por){
    const rev=USUARIOS_R.find(u=>u.id===inc.revisado_por);
    if(rev)revisorNombre=rev.nombre;
    else{
      const rRev=await api(`roster_usuarios?id=eq.${inc.revisado_por}&select=nombre`);
      if(rRev&&rRev.length)revisorNombre=rRev[0].nombre;
    }
  }
  const fechaRev=inc.revisado_en?new Date(inc.revisado_en).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  document.getElementById('incDetBody').innerHTML=`
    <div style="background:var(--cream);border-radius:10px;padding:14px;font-size:13px;line-height:1.6">
      <div><strong>Estado:</strong> ${ESTADOS[inc.estado]||esc(inc.estado)}</div>
      <div><strong>Tipo:</strong> ${TIPOS[inc.tipo]||esc(inc.tipo)}</div>
      <div><strong>Fecha:</strong> ${fmt(inc.fecha)}</div>
      ${inc.descripcion?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--sand-l)"><strong>Descripción:</strong><br>${esc(inc.descripcion)}</div>`:''}
      ${revisorNombre?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--sand-l);font-size:12px;color:var(--gray)">Resuelta por <strong>${esc(revisorNombre)}</strong>${fechaRev?` el ${fechaRev}`:''}</div>`:''}
    </div>`;
  // Mostrar acciones según permisos y estado
  const actions=document.getElementById('incDetActions');
  const empLocal=EMPLEADOS.find(e=>e.id===inc.empleado_id)?.local;
  const puedeResolver=puedeEditarLocal(empLocal)&&inc.estado==='pendiente';
  actions.innerHTML=`
    <button class="btn bs" onclick="closeOv('ovIncDetalle')">Cerrar</button>
    ${puedeResolver?`
      <button class="btn bx" onclick="resolverIncDesdeGrilla(${inc.id},'rechazado')">✗ Rechazar</button>
      <button class="btn bp" onclick="resolverIncDesdeGrilla(${inc.id},'aprobado')">✓ Aprobar</button>
    `:''}`;
  openOv('ovIncDetalle');
};

window.resolverIncDesdeGrilla=async function(id,estado){
  const r=await api(`incidencias?id=eq.${id}`,'PATCH',{estado,revisado_por:CU.id,revisado_en:new Date().toISOString()});
  if(r===null){toast('Error al guardar el cambio');return;}
  // Actualizar el INC_MAP local
  const inc=Object.values(INC_MAP).find(x=>x.id===id);
  if(inc){inc.estado=estado;inc.revisado_por=CU.id;inc.revisado_en=new Date().toISOString();}
  toast(estado==='aprobado'?'✓ Aceptada':'✓ Denegada');
  closeOv('ovIncDetalle');
  renderRosterTable(puedeEditarLocal(LOCAL_ACTUAL));
};

// ── COLABORADORES ─────────────────────────────────
window.actualizarCargos=function(){
  const sector=document.getElementById('eSector').value;
  const sel=document.getElementById('eCategoria');
  const cur=sel.value;
  const cargos=CARGOS_POR_SECTOR[sector]||['OTRO'];
  sel.innerHTML='<option value="">Seleccionar cargo...</option>'+
    cargos.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${c.charAt(0)+c.slice(1).toLowerCase()}</option>`).join('');
  toggleOtroCargo();
};
window.toggleOtroCargo=function(){
  const v=document.getElementById('eCategoria').value;
  document.getElementById('otroCargoWrap').style.display=v==='OTRO'?'block':'none';
};
async function loadEmpleados(force=true){
  if(!force&&EMPLEADOS.length)return;
  const data=await api('empleados?select=*&activo=neq.false&order=apellido.asc,nombre.asc')||[];
  EMPLEADOS=data;
  // Solo re-renderizar si la vista de empleados está activa
  if(document.getElementById('vEmpleados')?.classList.contains('active'))renderEmpleados();
}
function renderEmpleados(){
  const s=(document.getElementById('empSearch')?.value||'').toLowerCase();
  const l=document.getElementById('empFiltLocal')?.value||'';
  const f=EMPLEADOS.filter(e=>(!s||(e.apellido||e.nombre||'').toLowerCase().includes(s))&&(!l||e.local===l));
  const tb=document.getElementById('empTbody');
  if(!f.length){tb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px">Sin colaboradores</td></tr>`;return;}
  tb.innerHTML=f.map(e=>`<tr>
    <td><strong>${esc(e.apellido||e.nombre||'—')}</strong></td>
    <td>${esc(e.nombre_p||'—')}</td>
    <td>${esc(LOCAL_LABELS[e.local]||e.local||'—')}</td>
    <td>${esc(e.sector||'—')}</td>
    <td>${esc(e.categoria||'—')}</td>
    <td>${esc(e.telefono||'—')}</td>
    <td style="display:flex;gap:4px">
      <button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editEmp(${e.id})">✏️</button>
      <button class="bd" onclick="toggleActivo(${e.id},${e.activo!==false})">🗑</button>
    </td>
  </tr>`).join('');
}
window.renderEmpleados=renderEmpleados;
function openEmpModal(){
  eEmpId=null;
  document.getElementById('empModalTitle').textContent='Nuevo Colaborador';
  ['eApellido','eNombreP','eOtroCargo','eTel'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('eFechaNac').value='';
  document.getElementById('eLocal').value='2-AZAFRAN';
  document.getElementById('eSector').value='COCINA';
  document.getElementById('otroCargoWrap').style.display='none';
  document.getElementById('eCrearUser').checked=true;
  actualizarCargos();
  openOv('ovEmp');
}
window.openEmpModal=openEmpModal;
function editEmp(id){
  const e=EMPLEADOS.find(x=>x.id===id);if(!e)return;
  eEmpId=id;
  document.getElementById('empModalTitle').textContent='Editar Colaborador';
  document.getElementById('eApellido').value=e.apellido||'';
  document.getElementById('eNombreP').value=e.nombre_p||'';
  document.getElementById('eLocal').value=e.local||'2-AZAFRAN';
  document.getElementById('eSector').value=e.sector||'COCINA';
  actualizarCargos();
  const sel=document.getElementById('eCategoria');
  const opts=[...sel.options].map(o=>o.value);
  if(opts.includes(e.categoria)){sel.value=e.categoria;document.getElementById('otroCargoWrap').style.display='none';}
  else{sel.value='OTRO';document.getElementById('otroCargoWrap').style.display='block';document.getElementById('eOtroCargo').value=e.categoria||'';}
  document.getElementById('eTel').value=e.telefono||'';
  document.getElementById('eFechaNac').value=e.fecha_nac||'';
  document.getElementById('eCrearUser').checked=false;
  openOv('ovEmp');
}
window.editEmp=editEmp;
window.guardarEmpleado=async function(){
  const apellido=document.getElementById('eApellido').value.trim();
  const nombreP=document.getElementById('eNombreP').value.trim();
  if(!apellido){toast('Ingresá el apellido');return;}
  const catSel=document.getElementById('eCategoria').value;
  const cat=catSel==='OTRO'?document.getElementById('eOtroCargo').value.trim():catSel;
  const nombre=apellido+(nombreP?' '+nombreP:'');
  const data={nombre,apellido,nombre_p:nombreP||null,local:document.getElementById('eLocal').value,
    sector:document.getElementById('eSector').value,categoria:cat,
    telefono:document.getElementById('eTel').value.trim()||null,
    fecha_nac:document.getElementById('eFechaNac').value||null,activo:true};
  let empId=eEmpId;
  if(eEmpId){
    const r=await api(`empleados?id=eq.${eEmpId}`,'PATCH',data);
    if(!r){toast('Error al actualizar');return;}
    toast('✓ Colaborador actualizado');
  }
  else{
    const r=await api('empleados','POST',data);
    if(!r||!r.length){toast('Error al crear colaborador');return;}
    empId=r[0].id;
    toast('✓ Colaborador creado');
  }
  // Auto-create user
  if(document.getElementById('eCrearUser').checked&&!eEmpId&&empId){
    const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const baseUser=norm(apellido).slice(0,3)+norm(nombreP).slice(0,3);
    if(baseUser.length<2){toast('Colaborador creado pero no se pudo generar usuario (apellido/nombre muy corto)');closeOv('ovEmp');await loadEmpleados();return;}
    // Buscar nombre disponible: u, u1, u2...
    let userFinal=baseUser;
    for(let i=1;i<20;i++){
      const existe=await api(`roster_usuarios?usuario=eq.${userFinal}&select=id`);
      if(!existe||!existe.length)break;
      userFinal=baseUser+i;
    }
    const h=await sha256('azuca26');
    const r=await api('roster_usuarios','POST',{usuario:userFinal,password_hash:h,nombre,perfil:'usuario',empleado_id:empId,activo:true});
    if(r&&r.length){toast(`✓ Usuario creado: ${userFinal} / azuca26`,5000);}
    else{toast('Colaborador creado pero falló la creación del usuario',4000);}
  }
  closeOv('ovEmp');await loadEmpleados();
};
window.toggleActivo=async function(id,activo){
  if(!confirm(activo?'¿Dar de baja este colaborador?':'¿Reactivar?'))return;
  await api(`empleados?id=eq.${id}`,'PATCH',{activo:!activo});
  toast(activo?'Dado de baja':'Reactivado');
  await loadEmpleados();
};

// ── USUARIOS ───────────────────────────────────────
async function loadUsuarios(){
  const data=await api('roster_usuarios?select=*&order=perfil.asc,nombre.asc')||[];
  USUARIOS_R=data;renderUsuarios();
  // Also populate empleados select
  await loadEmpleados(false);
  const sel=document.getElementById('uEmpleadoId');
  const cur=sel.value;
  sel.innerHTML='<option value="">Sin vincular</option>'+
    EMPLEADOS.map(e=>`<option value="${e.id}" ${String(e.id)===cur?'selected':''}>${e.apellido||e.nombre}${e.nombre_p?' '+e.nombre_p:''}</option>`).join('');
}
function renderUsuarios(){
  const tb=document.getElementById('userTbody');
  if(!USUARIOS_R.length){tb.innerHTML=`<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:24px">Sin usuarios</td></tr>`;return;}
  const PFIL={master:'⭐ Master',editor:'✏️ Editor',usuario:'👤 Usuario'};
  tb.innerHTML=USUARIOS_R.map(u=>`<tr>
    <td><strong>${esc(u.nombre)}</strong></td>
    <td><code>${esc(u.usuario)}</code></td>
    <td><span class="badge b-${u.perfil}">${PFIL[u.perfil]||esc(u.perfil)}</span></td>
    <td style="font-size:11px">${u.locales_editor?.map(l=>esc(LOCAL_LABELS[l]||l)).join(', ')||'—'}</td>
    <td><span class="badge ${u.activo?'b-aprobado':'b-rechazado'}">${u.activo?'Activo':'Inactivo'}</span></td>
    <td style="display:flex;gap:4px">
      <button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editUser(${u.id})">✏️</button>
      <button class="bd" onclick="toggleUser(${u.id},${u.activo})">🗑</button>
    </td>
  </tr>`).join('');
}
function openUserModal(){
  eUserId=null;
  document.getElementById('userModalTitle').textContent='Nuevo Usuario';
  ['uNombre','uUsuario','uPass'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('uPerfil').value='usuario';
  document.getElementById('uEmpleadoId').value='';
  document.querySelectorAll('.locales-check input').forEach(cb=>cb.checked=false);
  toggleLocalesEditor();
  openOv('ovUser');
}
window.openUserModal=openUserModal;
function editUser(id){
  const u=USUARIOS_R.find(x=>x.id===id);if(!u)return;
  eUserId=id;
  document.getElementById('userModalTitle').textContent='Editar Usuario';
  document.getElementById('uNombre').value=u.nombre||'';
  document.getElementById('uUsuario').value=u.usuario||'';
  document.getElementById('uPass').value='';
  document.getElementById('uPerfil').value=u.perfil||'usuario';
  document.getElementById('uEmpleadoId').value=u.empleado_id||'';
  document.querySelectorAll('.locales-check input').forEach(cb=>{cb.checked=(u.locales_editor||[]).includes(cb.value);});
  toggleLocalesEditor();
  openOv('ovUser');
}
window.editUser=editUser;
window.toggleLocalesEditor=function(){
  const p=document.getElementById('uPerfil').value;
  document.getElementById('localesEditorWrap').style.display=p==='editor'?'block':'none';
};
window.guardarUsuario=async function(){
  const nombre=document.getElementById('uNombre').value.trim();
  const usuario=document.getElementById('uUsuario').value.trim().toLowerCase();
  const pass=document.getElementById('uPass').value;
  const perfil=document.getElementById('uPerfil').value;
  const empId=document.getElementById('uEmpleadoId').value||null;
  if(!nombre||!usuario){toast('Completá nombre y usuario');return;}
  const locales=[...document.querySelectorAll('.locales-check input:checked')].map(cb=>cb.value);
  const data={nombre,usuario,perfil,locales_editor:locales.length?locales:null,empleado_id:empId?parseInt(empId):null,activo:true};
  if(pass){data.password_hash=await sha256(pass);}
  if(eUserId){
    await api(`roster_usuarios?id=eq.${eUserId}`,'PATCH',data);
    toast('✓ Usuario actualizado');
  } else {
    if(!pass){toast('Ingresá una contraseña');return;}
    await api('roster_usuarios','POST',data);
    toast('✓ Usuario creado');
  }
  closeOv('ovUser');await loadUsuarios();
};
window.toggleUser=async function(id,activo){
  if(id===CU.id){toast('No podés desactivar tu propio usuario');return;}
  await api(`roster_usuarios?id=eq.${id}`,'PATCH',{activo:!activo});
  toast(activo?'Usuario desactivado':'Usuario activado');
  await loadUsuarios();
};


// ── TURNOS ESTÁNDAR ───────────────────────────────
let TURNOS_EST=[],teId=null,teEmpId=null;
const DIAS_TE=['lun','mar','mie','jue','vie','sab','dom'];
const DIAS_LABEL=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

async function loadTurnosEst(){
  const data=await api('turnos_estandar?select=*&activo=eq.true&order=local.asc,nombre.asc')||[];
  TURNOS_EST=data;
}
async function showView_vTurnos(){
  await loadTurnosEst();renderTurnos();
}

function renderTurnos(){
  const filt=document.getElementById('teFiltLocal')?.value||'';
  const f=filt?TURNOS_EST.filter(t=>t.local===filt):TURNOS_EST;
  const tb=document.getElementById('turnosTbody');
  if(!f.length){tb.innerHTML=`<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:24px">Sin turnos estándar</td></tr>`;return;}
  const fmtCell=(hora,flex)=>{
    if(flex){
      const sub=hora?`<div style="font-size:9px;color:#5B3A8E;margin-top:1px">${hora.slice(0,5)}</div>`:'';
      return `<span style="color:#5B3A8E;background:#EDE3F7;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700">🔄 FLEX</span>${sub}`;
    }
    if(hora)return `<strong>${hora.slice(0,5)}</strong>`;
    return `<span style="color:var(--off-text);background:var(--off-bg);padding:2px 6px;border-radius:10px;font-size:10px">OFF</span>`;
  };
  tb.innerHTML=f.map(t=>`<tr>
    <td><strong>${esc(t.nombre)}</strong></td>
    <td>${t.local==='TODOS'?'🌐 Global':esc(LOCAL_LABELS[t.local]||t.local)}</td>
    ${DIAS_TE.map(d=>`<td style="text-align:center">${fmtCell(t[d],t[d+'_flex'])}</td>`).join('')}
    <td><button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editTurnoEst(${t.id})">✏️</button></td>
  </tr>`).join('');
}
window.renderTurnos=renderTurnos;

// Genera los 7 días con dos selects (hora + min) y checkbox Flex
function buildTeDiasGrid(valoresPrev){
  const DIA_LABEL={lun:'LUN',mar:'MAR',mie:'MIÉ',jue:'JUE',vie:'VIE',sab:'SÁB',dom:'DOM'};
  const horasOpts=['']+''.padEnd(0,''); // dummy
  let horasHtml='<option value="">--</option>';
  for(let h=0;h<24;h++){const hh=String(h).padStart(2,'0');horasHtml+=`<option value="${hh}">${hh}</option>`;}
  const minsHtml=['00','15','30','45'].map(m=>`<option value="${m}">${m}</option>`).join('');
  const grid=document.getElementById('teDiasGrid');
  grid.innerHTML=DIAS_TE.map(d=>{
    const cap=d.charAt(0).toUpperCase()+d.slice(1);
    const v=valoresPrev?.[d]||'';
    const h=v?v.slice(0,2):'';
    const m=v?(v.slice(3,5)||'00'):'00';
    const flex=valoresPrev?.[d+'_flex']?'checked':'';
    const isDom=d==='dom';
    const labelColor=isDom?'var(--off-text)':'var(--gray)';
    const bg=isDom?'background:var(--off-bg);':'';
    const border=isDom?'border:1px solid #F0E060;':'border:1px solid var(--sand);';
    return `<div>
      <div style="font-size:11px;color:${labelColor};margin-bottom:4px;font-weight:600">${DIA_LABEL[d]}</div>
      <div style="display:flex;gap:2px;justify-content:center">
        <select id="te${cap}H" style="${bg}${border}border-radius:6px;padding:5px 2px;font-size:12px;font-weight:600;text-align:center;box-sizing:border-box">${horasHtml.replace(`value="${h}"`,`value="${h}" selected`)}</select>
        <span style="align-self:center;font-weight:700">:</span>
        <select id="te${cap}M" style="${bg}${border}border-radius:6px;padding:5px 2px;font-size:12px;font-weight:600;text-align:center;box-sizing:border-box">${minsHtml.replace(`value="${m}"`,`value="${m}" selected`)}</select>
      </div>
      <label style="display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#5B3A8E;margin-top:4px;cursor:pointer">
        <input type="checkbox" id="te${cap}Flex" style="width:auto;margin:0" ${flex}>🔄 Flex
      </label>
    </div>`;
  }).join('');
}

// Lee la hora completa (HH:MM) de los 2 selects de un día. Devuelve null si está vacío.
function getTeHora(d){
  const cap=d.charAt(0).toUpperCase()+d.slice(1);
  const h=document.getElementById('te'+cap+'H')?.value;
  const m=document.getElementById('te'+cap+'M')?.value||'00';
  return h?(h+':'+m):null;
}

function openTurnoEstModal(){
  teId=null;
  document.getElementById('teModalTitle').textContent='Nuevo Turno Estándar';
  document.getElementById('teNombre').value='';
  document.getElementById('teLocal').value='TODOS';
  buildTeDiasGrid(null);
  document.getElementById('btnBorrarTE').style.display='none';
  openOv('ovTurnoEst');
}
window.openTurnoEstModal=openTurnoEstModal;

function editTurnoEst(id){
  const t=TURNOS_EST.find(x=>x.id===id);if(!t)return;
  teId=id;
  document.getElementById('teModalTitle').textContent='Editar Turno Estándar';
  document.getElementById('teNombre').value=t.nombre||'';
  document.getElementById('teLocal').value=t.local||'TODOS';
  buildTeDiasGrid(t);
  document.getElementById('btnBorrarTE').style.display='';
  openOv('ovTurnoEst');
}
window.editTurnoEst=editTurnoEst;

window.guardarTurnoEst=async function(){
  const nombre=document.getElementById('teNombre').value.trim();
  if(!nombre){toast('Ingresá un nombre');return;}
  const data={
    nombre,local:document.getElementById('teLocal').value,
    lun:getTeHora('lun'),
    mar:getTeHora('mar'),
    mie:getTeHora('mie'),
    jue:getTeHora('jue'),
    vie:getTeHora('vie'),
    sab:getTeHora('sab'),
    dom:getTeHora('dom'),
    lun_flex:document.getElementById('teLunFlex').checked,
    mar_flex:document.getElementById('teMarFlex').checked,
    mie_flex:document.getElementById('teMieFlex').checked,
    jue_flex:document.getElementById('teJueFlex').checked,
    vie_flex:document.getElementById('teVieFlex').checked,
    sab_flex:document.getElementById('teSabFlex').checked,
    dom_flex:document.getElementById('teDomFlex').checked,
    activo:true
  };
  // Validación: al menos un día tiene que tener hora o flex (sino son los 7 OFF)
  const tieneAlgo=DIAS_TE.some(d=>data[d]||data[d+'_flex']);
  if(!tieneAlgo){toast('Cargá al menos un día con hora o Flex');return;}
  if(teId){await api(`turnos_estandar?id=eq.${teId}`,'PATCH',data);toast('✓ Turno actualizado');}
  else{await api('turnos_estandar','POST',{...data,creado_por:CU.id});toast('✓ Turno creado');}
  closeOv('ovTurnoEst');await loadTurnosEst();renderTurnos();
};

window.borrarTurnoEst=async function(){
  if(!confirm('¿Eliminar este turno estándar?'))return;
  await api(`turnos_estandar?id=eq.${teId}`,'PATCH',{activo:false});
  closeOv('ovTurnoEst');toast('Turno eliminado');
  await loadTurnosEst();renderTurnos();
};

// Aplicar turno estándar a un colaborador
window.abrirAplicarTE=async function(empId){
  teEmpId=empId;
  const emp=EMPLEADOS.find(e=>e.id===empId);
  document.getElementById('aplicarTETitle').textContent=`Turno para ${emp?.apellido||emp?.nombre||''}`;
  // Load if needed
  if(!TURNOS_EST.length)await loadTurnosEst();
  // Filter by local or TODOS
  const local=emp?.local||'';
  const disponibles=TURNOS_EST.filter(t=>t.local==='TODOS'||t.local===local);
  const sel=document.getElementById('teSelector');
  sel.innerHTML='<option value="">Elegir turno...</option>'+
    disponibles.map(t=>`<option value="${t.id}">${esc(t.nombre)}${t.local==='TODOS'?' (global)':''}</option>`).join('');
  document.getElementById('tePrev').style.display='none';
  openOv('ovAplicarTE');
};

window.previsualizarTE=function(){
  const id=parseInt(document.getElementById('teSelector').value);
  const t=TURNOS_EST.find(x=>x.id===id);
  const prev=document.getElementById('tePrev');
  if(!t){prev.style.display='none';return;}
  prev.style.display='block';
  document.getElementById('tePrevGrid').innerHTML=DIAS_TE.map((d,i)=>{
    const hora=t[d];
    const flex=t[d+'_flex'];
    let chip;
    if(flex){
      chip=`<div style="font-size:11px;color:#5B3A8E;background:#EDE3F7;padding:2px 6px;border-radius:10px;font-weight:700">🔄 FLEX</div>${hora?`<div style="font-size:10px;color:#5B3A8E;margin-top:2px">${hora.slice(0,5)}</div>`:''}`;
    }else if(hora){
      chip=`<div style="font-weight:700;font-size:13px">${hora.slice(0,5)}</div>`;
    }else{
      chip=`<div style="font-size:11px;color:var(--off-text);background:var(--off-bg);padding:2px 6px;border-radius:10px">OFF</div>`;
    }
    return`<div><div style="font-size:10px;color:var(--gray);margin-bottom:4px">${DIAS_LABEL[i]}</div>${chip}</div>`;
  }).join('');
};

window.aplicarTurnoEst=async function(){
  const id=parseInt(document.getElementById('teSelector').value);
  if(!id){toast('Elegí un turno');return;}
  const t=TURNOS_EST.find(x=>x.id===id);
  const empId=teEmpId;
  
  // Check if there are existing turnos this week (solo los editables)
  const existentes=Object.keys(TURNOS_MAP).filter(k=>{
    if(!k.startsWith(empId+'_'))return false;
    const dia=k.split('_')[1];
    return !esDiaPasado(dia);
  });
  if(existentes.length>0){
    if(!confirm(`Ya hay turnos cargados para esta semana. ¿Reemplazarlos con "${t.nombre}"?`))return;
    // Delete existing (solo los no pasados)
    for(const key of existentes){
      const existing=TURNOS_MAP[key];
      if(existing?.id)await api(`roster_turnos?id=eq.${existing.id}`,'DELETE');
      delete TURNOS_MAP[key];
    }
  }
  
  // Create semana once before the loop
  if(!SEMANA_ID){
    // Try to get existing first to avoid 409
    const existing=await api(`roster_semanas?local=eq.${encodeURIComponent(LOCAL_ACTUAL)}&fecha_lunes=eq.${SEMANA_ACTUAL}&select=*`);
    if(existing&&existing.length){SEMANA_ID=existing[0].id;SEMANA_OBJ=existing[0];}
    else{
      const r=await apiUpsert('roster_semanas',{local:LOCAL_ACTUAL,fecha_lunes:SEMANA_ACTUAL,creado_por:CU.id},['local','fecha_lunes']);
      if(r&&r.length){SEMANA_ID=r[0].id;SEMANA_OBJ=r[0];}else{toast('Error al crear semana');return;}
    }
  }
  
  // Insert 7 days sequentially (salteando días pasados)
  const dias=diasDeSemana(SEMANA_ACTUAL);
  for(let i=0;i<7;i++){
    const dKey=DIAS_TE[i];
    const hora=t[dKey]||null;
    const flex=!!t[dKey+'_flex'];
    const dia=dias[i];
    if(esDiaPasado(dia))continue;
    // Si no hay hora y no es flex → es OFF
    const esOff=!flex&&hora===null;
    const data={semana_id:SEMANA_ID,empleado_id:empId,dia,es_off:esOff,es_flex:flex,hora_entrada:hora,comentario:null};
    const r=await api('roster_turnos','POST',data);
    if(r&&r.length)TURNOS_MAP[`${empId}_${dia}`]=r[0];
  }
  
  closeOv('ovAplicarTE');
  renderRosterTable(true);
  toast(`✓ Turno "${t.nombre}" aplicado`);
};

// ── INIT ──────────────────────────────────────────
checkSession();
})();
