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

let CU=null,EMPLEADOS=[],USUARIOS_R=[],SEMANA_ACTUAL=null,LOCAL_ACTUAL=null,LOCALES_VISIBLES=[],SECTOR_ACTUAL='';
let PROP_MIS_LOCALES=[]; // Locales que el usuario actual puede editar para propinas
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
function hoyStr(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// Registra un cambio en el historial. Es "fire and forget" — si falla, no bloquea la acción del usuario.
async function logHistorial(accion,datos={}){
  try{
    const payload={
      usuario_id:CU?.id||null,
      usuario_nombre:CU?.nombre||'desconocido',
      accion,
      empleado_id:datos.empleado_id||null,
      empleado_nombre:datos.empleado_nombre||null,
      dia:datos.dia||null,
      local:datos.local||LOCAL_ACTUAL||null,
      detalle:datos.detalle||null
    };
    await api('roster_historial','POST',payload);
  }catch(e){console.warn('logHistorial fallo:',e);}
}
function getLunes(d){const dt=new Date(d+'T12:00:00');const day=dt.getDay();const diff=day===0?-6:1-day;dt.setDate(dt.getDate()+diff);return dt.toISOString().split('T')[0];}
function addDays(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];}
function diasDeSemana(l){return Array.from({length:7},(_,i)=>addDays(l,i));}
function formatSemana(l){const d=diasDeSemana(l);return `Semana del ${fmt(d[0])} al ${fmt(d[6])}`;}

// ── PERFIL ───────────────────────────────────────
function esMaster(){return CU?.perfil==='master';}
function esDiaPasado(dia,turno){
  // Master puede editar cualquier día (incluso pasados)
  if(esMaster())return false;
  const ahora=new Date();
  const hoy=hoyStr();
  // Si es de un día anterior, está bloqueado siempre
  if(dia<hoy)return true;
  // Si es de hoy, ver si ya pasó la hora del turno + 30 min
  if(dia===hoy&&turno&&turno.hora_entrada&&!turno.es_off&&!turno.es_flex){
    const [h,m]=turno.hora_entrada.split(':').map(Number);
    const limite=new Date(ahora);
    limite.setHours(h,m+30,0,0); // hora del turno + 30 min
    if(ahora>limite)return true;
  }
  // Día futuro o día actual con hora aún no pasada (o flex/off/sin hora) → editable
  return false;
}
function esHoy(dia){return dia===hoyStr();}
function esEditorPerfil(){return CU?.perfil==='master'||CU?.perfil==='editor';}
function puedeEditarLocal(local){
  if(esMaster())return true;
  if(CU?.perfil!=='editor')return false;
  if(!CU.locales_editor||!CU.locales_editor.length)return true;
  return CU.locales_editor.includes(local);
}
// Permisos de propinas (independiente del rol de roster)
async function loadMisLocalesPropina(){
  if(esMaster()){PROP_MIS_LOCALES=Object.keys(LOCAL_LABELS);return;}
  if(!CU?.id){PROP_MIS_LOCALES=[];return;}
  const r=await api(`propinas_editores?usuario_id=eq.${CU.id}&select=locales&limit=1`);
  PROP_MIS_LOCALES=r&&r.length?(r[0].locales||[]):[];
}
function esEditorPropina(){return esMaster()||PROP_MIS_LOCALES.length>0;}
function puedeEditarPropinaLocal(local){
  if(esMaster())return true;
  return PROP_MIS_LOCALES.includes(local);
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
async function afterLogin(){
  // Refrescar usuario desde BD para asegurar que tenga los campos más nuevos (ej: editor_biblioteca)
  try{
    const fresh=await api(`roster_usuarios?id=eq.${CU.id}&select=*`);
    if(fresh&&fresh.length){CU=fresh[0];sessionStorage.setItem('az_roster_cu',JSON.stringify(CU));}
  }catch(e){console.warn('No se pudo refrescar usuario:',e);}
  const perfil={master:'⭐ Master',editor:'✏️ Editor',usuario:'👤 Usuario'}[CU.perfil]||CU.perfil;
  document.getElementById('dashUser').textContent=`${CU.nombre} · ${perfil}`;
  await loadMisLocalesPropina();
  buildDash();showView('vDash');
}
function checkSession(){const s=sessionStorage.getItem('az_roster_cu');if(s){CU=JSON.parse(s);afterLogin();}else showView('vLogin');}

// ── DASHBOARD ────────────────────────────────────
function buildDash(){
  const cards=[];
  if(esEditorPerfil())cards.push({i:'📅',t:'Roster Semanal',d:'Ver y editar turnos del equipo',a:"showView('vRoster')"});
  cards.push({i:'📱',t:'Mi Semana',d:'Ver mis turnos asignados',a:"showView('vMiSemanaView')"});
  cards.push({i:'💰',t:'Mi Propina',d:'Ver mis propinas acumuladas',a:"showView('vMiPropina')"});
  cards.push({i:'📚',t:'Mi Biblioteca',d:'Capacitación, novedades y recursos',a:"showView('vBiblioteca')"});
  if(esEditorPerfil())cards.push({i:'⚠️',t:'Incidencias',d:'Tardanzas, ausencias y cambios',a:"showView('vIncidencias')"});
  if(esEditorPropina())cards.push({i:'💰',t:'Gestión de Propinas',d:'Cierres de caja y reparto',a:"showView('vPropinas')"});
  if(esMaster()){
    cards.push({i:'👥',t:'Colaboradores',d:'Gestión del personal',a:"showView('vEmpleados')"});
    cards.push({i:'🔑',t:'Usuarios y Accesos',d:'Gestión de perfiles y contraseñas',a:"showView('vUsuarios')"});
    cards.push({i:'📋',t:'Turnos Estándar',d:'Plantillas de turnos semanales',a:"showView('vTurnos')"});
    cards.push({i:'📜',t:'Historial de cambios',d:'Registro de modificaciones (últimos 60 días)',a:"showView('vHistorial')"});
    cards.push({i:'💰',t:'Configurar Propinas',d:'Tipo de cambio y editores de propinas',a:"showView('vPropinasConfig')"});
    cards.push({i:'📊',t:'Resumen Propinas',d:'Reporte por período para RRHH',a:"showView('vPropinasResumen')"});
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
  if((id==='vEmpleados'||id==='vUsuarios'||id==='vTurnos'||id==='vHistorial'||id==='vPropinasConfig'||id==='vPropinasResumen')&&!esMaster()){toast('Solo master');return;}
  if((id==='vPropinas'||id==='vPropinasForm')&&!esEditorPropina()){toast('Sin permiso para propinas');return;}
  if((id==='vBibliotecaAdmin')&&!esEditorBiblioteca()){toast('Sin permiso para administrar biblioteca');return;}
  if((id==='vBibliotecaEditores')&&!esMaster()){toast('Solo master');return;}
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id==='vMiSemanaView'?'vMiSemana':id).classList.add('active');
  if(id==='vRoster')initRoster();
  if(id==='vMiSemanaView')initMiSemana();
  if(id==='vIncidencias')loadIncidencias();
  if(id==='vEmpleados')loadEmpleados();
  if(id==='vUsuarios')loadUsuarios();
  if(id==='vTurnos')showView_vTurnos();
  if(id==='vHistorial')loadHistorial();
  if(id==='vPropinasConfig')loadPropinasConfig();
  if(id==='vPropinas')loadPropinas();
  if(id==='vMiPropina')loadMiPropina();
  if(id==='vPropinasResumen')loadPropinasResumen();
  if(id==='vBiblioteca')initBiblioteca();
  if(id==='vBibliotecaAdmin')initBibliotecaAdmin();
  if(id==='vBibliotecaEditores')initBibliotecaEditores();
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
  if(!SEMANA_ACTUAL)SEMANA_ACTUAL=getLunes(hoyStr());
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
  LOCAL_ACTUAL=l;
  SECTOR_ACTUAL=''; // reset filtro al cambiar de local
  buildLocalTabs();await loadRoster();
};
window.filtrarSector=function(){
  SECTOR_ACTUAL=document.getElementById('sectorFilter').value;
  renderRosterTable(puedeEditarLocal(LOCAL_ACTUAL));
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
  // Empleados del local actual (todos, para poblar el dropdown)
  // Empleados del local actual + los multilocales (todos los activos)
  const empsLocal=EMPLEADOS.filter(e=>e.activo!==false&&(e.local===LOCAL_ACTUAL||e.es_multilocal===true));
  // Sectores únicos disponibles en este local
  const sectoresDisponibles=[...new Set(empsLocal.map(e=>e.sector).filter(Boolean))].sort();
  const selSector=document.getElementById('sectorFilter');
  if(selSector){
    const prev=SECTOR_ACTUAL;
    // Si el sector previo ya no está disponible para este local, resetear
    if(prev&&!sectoresDisponibles.includes(prev))SECTOR_ACTUAL='';
    selSector.innerHTML='<option value="">Todos los sectores</option>'+
      sectoresDisponibles.map(s=>`<option value="${esc(s)}" ${s===SECTOR_ACTUAL?'selected':''}>${esc(s)}</option>`).join('');
  }
  // Aplicar filtro de sector
  const emps=SECTOR_ACTUAL?empsLocal.filter(e=>e.sector===SECTOR_ACTUAL):empsLocal;
  document.getElementById('rosterHead').innerHTML=`<tr>
    <th class="emp-col">Colaborador</th>
    ${dias.map((d,i)=>`<th class="${esHoy(d)?'th-hoy':''}">${DIAS[i]}<br><small style="font-weight:400;font-size:10px">${fmt(d)}${esHoy(d)?' · HOY':''}</small></th>`).join('')}
  </tr>`;
  if(!emps.length){document.getElementById('rosterBody').innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:24px">${SECTOR_ACTUAL?'Sin colaboradores en este sector':'Sin colaboradores para este local'}</td></tr>`;return;}
  document.getElementById('rosterBody').innerHTML=emps.map(emp=>{
    const esOtroLocal=emp.es_multilocal&&emp.local!==LOCAL_ACTUAL;
    const badge=emp.es_multilocal?` <span style="font-size:9px;background:#EDE3F7;color:#5B3A8E;padding:1px 5px;border-radius:8px;font-weight:600;letter-spacing:.3px;margin-left:4px" title="Multilocal">MULTI</span>`:'';
    const localOrigen=esOtroLocal?`<div class="sector" style="font-size:10px;color:#5B3A8E">📍 ${esc(LOCAL_LABELS[emp.local]||emp.local)}</div>`:'';
    return `
    <tr>
      <td class="emp-cell">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>${esc(emp.apellido||emp.nombre)}${badge}<div class="sector">${esc(emp.sector||'')} · ${esc(emp.categoria||'')}</div>${localOrigen}</div>
          ${puedeEditar?`<button onclick="abrirAplicarTE(${emp.id})" title="Aplicar turno estándar" style="background:none;border:1px solid var(--sand);border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer;color:var(--gray);white-space:nowrap">📋</button>`:''}
        </div>
      </td>
      ${dias.map(dia=>{
        const key=`${emp.id}_${dia}`;const t=TURNOS_MAP[key];
        const pasado=esDiaPasado(dia,t);
        const hoy=esHoy(dia);
        const editable=puedeEditar&&!pasado;
        const onclick=editable?`onclick="editTurno(${emp.id},'${dia}')"` :'';
        const cls=`turno-cell${editable?'':' readonly'}${pasado?' pasado':''}${hoy?' hoy':''}`;
        const tip=pasado?' title="Turno cerrado - ya pasó la hora"':'';
        const tdCls=hoy?' class="td-hoy"':'';
        const cmt=t?.comentario?`<div class="turno-comment">💬 ${esc(t.comentario)}</div>`:'';
        // Punto de incidencia (más reciente del día)
        const inc=INC_MAP[`${emp.id}_${dia}`];
        const dot=inc?`<span class="inc-dot ${inc.estado}" title="Incidencia: ${inc.estado}" onclick="event.stopPropagation();verIncidencia(${inc.id})"></span>`:'';
        if(t&&t.es_off)return`<td${tdCls}><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-off">OFF</span>${cmt}</div></td>`;
        if(t&&t.es_flex){
          const horaTxt=t.hora_entrada?`<div class="turno-flex-hora">${t.hora_entrada.slice(0,5)}</div>`:'';
          return`<td${tdCls}><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-flex">FLEX</span>${horaTxt}${cmt}</div></td>`;
        }
        if(t&&t.hora_entrada)return`<td${tdCls}><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-hora">${t.hora_entrada.slice(0,5)}</span>${cmt}</div></td>`;
        return`<td${tdCls}><div class="${cls}" ${onclick}${tip}>${dot}<span class="turno-vacio">${editable?'+ agregar':'—'}</span></div></td>`;
      }).join('')}
    </tr>`;}).join('');
}
window.guardarCommentGeneral=async function(){
  const txt=document.getElementById('commentGeneralTxt').value.trim();
  const previo=SEMANA_OBJ?.comentario_general||'';
  if(previo===txt)return; // No logear si no hubo cambio real
  if(!SEMANA_ID){const r=await apiUpsert('roster_semanas',{local:LOCAL_ACTUAL,fecha_lunes:SEMANA_ACTUAL,comentario_general:txt,creado_por:CU.id},['local','fecha_lunes']);if(r&&r.length){SEMANA_ID=r[0].id;SEMANA_OBJ=r[0];}}
  else await api(`roster_semanas?id=eq.${SEMANA_ID}`,'PATCH',{comentario_general:txt});
  if(SEMANA_OBJ)SEMANA_OBJ.comentario_general=txt;
  logHistorial('comentario_semana',{
    dia:SEMANA_ACTUAL,
    detalle:{previo,nuevo:txt}
  });
};

// ── TURNO ─────────────────────────────────────────
window.editTurno=function(empId,dia){
  const t=TURNOS_MAP[`${empId}_${dia}`];
  if(esDiaPasado(dia,t)){toast('Turno cerrado - ya pasó la hora');return;}
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
  // Capturar estado previo para el log
  const emp=EMPLEADOS.find(e=>e.id===empId);
  const empNombre=`${emp?.apellido||''} ${emp?.nombre_p||''}`.trim()||emp?.nombre||'';
  const previo=existing?{hora_entrada:existing.hora_entrada,es_off:existing.es_off,es_flex:existing.es_flex,comentario:existing.comentario}:null;
  if(existing){await api(`roster_turnos?id=eq.${existing.id}`,'PATCH',data);TURNOS_MAP[key]={...existing,...data};}
  else{const r=await api('roster_turnos','POST',data);if(r&&r.length)TURNOS_MAP[key]=r[0];}
  // Log de historial
  logHistorial(existing?'turno_editado':'turno_creado',{
    empleado_id:empId,empleado_nombre:empNombre,dia,
    detalle:{previo,nuevo:{hora_entrada:data.hora_entrada,es_off:data.es_off,es_flex:data.es_flex,comentario:data.comentario}}
  });
  closeOv('ovTurno');renderRosterTable(true);toast('✓ Turno guardado');
};
window.borrarTurno=async function(){
  const empId=parseInt(document.getElementById('turnoEmpId').value);
  const dia=document.getElementById('turnoDia').value;
  const key=`${empId}_${dia}`;
  const existing=TURNOS_MAP[key];
  if(existing){
    await api(`roster_turnos?id=eq.${existing.id}`,'DELETE');
    delete TURNOS_MAP[key];
    // Log de historial
    const emp=EMPLEADOS.find(e=>e.id===empId);
    const empNombre=`${emp?.apellido||''} ${emp?.nombre_p||''}`.trim()||emp?.nombre||'';
    logHistorial('turno_borrado',{
      empleado_id:empId,empleado_nombre:empNombre,dia,
      detalle:{previo:{hora_entrada:existing.hora_entrada,es_off:existing.es_off,es_flex:existing.es_flex,comentario:existing.comentario}}
    });
  }
  closeOv('ovTurno');renderRosterTable(true);toast('Turno eliminado');
};

// ── MI SEMANA ─────────────────────────────────────
async function initMiSemana(){
  if(!SEMANA_EMP)SEMANA_EMP=getLunes(hoyStr());
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
    const hoy=esHoy(dia);
    const pasado=esDiaPasado(dia,t);
    let txt;
    if(esOff)txt='OFF';
    else if(esFlex)txt=t?.hora_entrada?`FLEX ${t.hora_entrada.slice(0,5)}`:'FLEX';
    else txt=t?.hora_entrada?t.hora_entrada.slice(0,5):'—';
    const inc=incPorDia[dia];
    const dot=inc?`<span class="inc-dot ${inc.estado}" title="Tu incidencia (${inc.estado==='pendiente'?'pendiente':'procesada'})" onclick="verIncidencia(${inc.id})"></span>`:'';
    return`<div class="dia-card ${esOff?'off':''} ${hoy?'hoy':''} ${pasado?'pasado':''}" style="position:relative">
      ${dot}
      <div class="dia-nombre">${DIAS[i]}${hoy?' · HOY':''}</div>
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
  const hoy=hoyStr();
  const inp=document.getElementById('incFecha');
  inp.value=hoy;
  inp.min=hoy;  // No permite elegir días pasados desde el datepicker
  document.getElementById('incDesc').value='';
  openOv('ovIncidencia');
};
window.guardarIncidencia=async function(){
  const tipo=document.getElementById('incTipo').value;
  const fecha=document.getElementById('incFecha').value;
  const desc=document.getElementById('incDesc').value.trim();
  if(!fecha){toast('Elegí una fecha');return;}
  // Validar que no sea día pasado
  const hoy=hoyStr();
  if(fecha<hoy){toast('No se pueden reportar incidencias de días pasados');return;}
  if(!desc){toast('Describí la incidencia');return;}
  if(!CU.empleado_id){toast('Tu usuario no está vinculado a un colaborador. Pedile al admin que lo configure.');return;}
  // Si la incidencia es para HOY, chequear si el turno ya está cerrado (hora + 30 min)
  if(fecha===hoy){
    const turnoHoy=await api(`roster_turnos?empleado_id=eq.${CU.empleado_id}&dia=eq.${hoy}&select=hora_entrada,es_off,es_flex&limit=1`);
    if(turnoHoy&&turnoHoy.length&&turnoHoy[0].hora_entrada&&!turnoHoy[0].es_off&&!turnoHoy[0].es_flex){
      const ahora=new Date();
      const [h,m]=turnoHoy[0].hora_entrada.split(':').map(Number);
      const limite=new Date(ahora);
      limite.setHours(h,m+30,0,0);
      if(ahora>limite){toast('Ya pasó la hora de tu turno + 30 min, no se puede reportar');return;}
    }
  }
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
  const data=await api('empleados?select=*&order=apellido.asc,nombre.asc')||[];
  EMPLEADOS=data;
  // Solo re-renderizar si la vista de empleados está activa
  if(document.getElementById('vEmpleados')?.classList.contains('active'))renderEmpleados();
}
function renderEmpleados(){
  const s=(document.getElementById('empSearch')?.value||'').toLowerCase();
  const l=document.getElementById('empFiltLocal')?.value||'';
  const verInactivos=document.getElementById('empMostrarInactivos')?.checked||false;
  const f=EMPLEADOS.filter(e=>{
    if(!verInactivos&&e.activo===false)return false;
    if(l&&e.local!==l)return false;
    if(!s)return true;
    const txt=`${e.apellido||''} ${e.nombre_p||''} ${e.nombre||''}`.toLowerCase();
    return txt.includes(s);
  });
  const tb=document.getElementById('empTbody');
  if(!f.length){tb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px">Sin colaboradores</td></tr>`;return;}
  tb.innerHTML=f.map(e=>{
    // Si tiene apellido y nombre_p, perfecto. Si no, intentar deducir desde nombre completo.
    let apellidoMostrar=e.apellido||'';
    let nombreMostrar=e.nombre_p||'';
    if(!apellidoMostrar&&e.nombre){
      // Si solo tiene nombre, mostrarlo como apellido (caso heredado)
      apellidoMostrar=e.nombre;
    }
    if(!nombreMostrar&&e.nombre&&e.apellido){
      // Si nombre completo es "Apellido NombreP", extraer la parte del nombre
      const resto=e.nombre.replace(e.apellido,'').trim();
      if(resto)nombreMostrar=resto;
    }
    const inactivo=e.activo===false;
    const trStyle=inactivo?' style="opacity:.55"':'';
    return `<tr${trStyle}>
    <td style="font-weight:600">${esc(apellidoMostrar||'—')}${inactivo?' <span class="badge b-rechazado" style="font-size:9px;margin-left:4px">Inactivo</span>':''}${e.es_multilocal?' <span style="font-size:9px;background:#EDE3F7;color:#5B3A8E;padding:1px 5px;border-radius:8px;font-weight:600;letter-spacing:.3px;margin-left:4px" title="Trabaja en todos los locales">MULTI</span>':''}</td>
    <td>${esc(nombreMostrar||'—')}</td>
    <td>${esc(LOCAL_LABELS[e.local]||e.local||'—')}</td>
    <td>${esc(e.sector||'—')}</td>
    <td>${esc(e.categoria||'—')}</td>
    <td>${esc(e.telefono||'—')}</td>
    <td style="display:flex;gap:4px">
      <button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editEmp(${e.id})">✏️</button>
      <button class="bd" onclick="toggleActivo(${e.id},${e.activo!==false})" title="${inactivo?'Reactivar':'Dar de baja'}">${inactivo?'♻️':'🗑'}</button>
    </td>
  </tr>`;}).join('');
}
window.renderEmpleados=renderEmpleados;
function openEmpModal(esEventual=false){
  eEmpId=null;
  document.getElementById('empModalTitle').textContent=esEventual?'Nuevo Eventual':'Nuevo Colaborador';
  ['eApellido','eNombreP','eOtroCargo','eTel'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('eFechaNac').value='';
  document.getElementById('eLocal').value='2-AZAFRAN';
  document.getElementById('eSector').value='COCINA';
  document.getElementById('otroCargoWrap').style.display='none';
  // Multilocal: para eventual va tildado por default
  document.getElementById('eMultilocal').checked=esEventual;
  // Para eventual: no crear usuario por default y usuario no obligatorio
  const cb=document.getElementById('eCrearUser');
  cb.checked=!esEventual;cb.disabled=false;
  const hint=document.getElementById('eCrearUserHint');
  hint.textContent=esEventual?'Eventual: no necesita usuario':'Usuario: primeras 3 letras apellido + 3 letras nombre · Contraseña: azuca26';
  hint.style.color='var(--gray)';
  actualizarCargos();
  openOv('ovEmp');
}
window.openEmpModal=openEmpModal;
async function editEmp(id){
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
  document.getElementById('eMultilocal').checked=!!e.es_multilocal;
  // Chequear si ya tiene usuario asociado
  const yaTieneUser=await api(`roster_usuarios?empleado_id=eq.${id}&select=usuario`);
  const cb=document.getElementById('eCrearUser');
  const hint=document.getElementById('eCrearUserHint');
  if(yaTieneUser&&yaTieneUser.length){
    cb.checked=false;cb.disabled=true;
    hint.textContent=`Ya tiene usuario: ${yaTieneUser[0].usuario}`;
    hint.style.color='var(--green)';
  }else{
    cb.checked=false;cb.disabled=false;
    hint.textContent='Usuario: primeras 3 letras apellido + 3 letras nombre · Contraseña: azuca26';
    hint.style.color='var(--gray)';
  }
  openOv('ovEmp');
}
window.editEmp=editEmp;
window.guardarEmpleado=async function(){
  const apellido=document.getElementById('eApellido').value.trim();
  const nombreP=document.getElementById('eNombreP').value.trim();
  if(!apellido&&!nombreP){toast('Ingresá al menos un nombre o apellido');return;}
  const catSel=document.getElementById('eCategoria').value;
  const cat=catSel==='OTRO'?document.getElementById('eOtroCargo').value.trim():catSel;
  const nombre=apellido+(nombreP?' '+nombreP:'');
  const data={nombre,apellido,nombre_p:nombreP||null,local:document.getElementById('eLocal').value,
    sector:document.getElementById('eSector').value,categoria:cat,
    telefono:document.getElementById('eTel').value.trim()||null,
    fecha_nac:document.getElementById('eFechaNac').value||null,
    es_multilocal:document.getElementById('eMultilocal').checked,
    activo:true};
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
  // Auto-create user (también funciona al editar si no tiene usuario aún)
  if(document.getElementById('eCrearUser').checked&&empId){
    // Chequear si ya existe un usuario vinculado a este colaborador
    const yaExiste=await api(`roster_usuarios?empleado_id=eq.${empId}&select=usuario`);
    if(yaExiste&&yaExiste.length){
      toast(`Este colaborador ya tiene usuario: ${yaExiste[0].usuario}`,4000);
    }else{
      const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const baseUser=norm(apellido).slice(0,3)+norm(nombreP).slice(0,3);
      if(baseUser.length<2){toast('Colaborador guardado pero no se pudo generar usuario (apellido/nombre muy corto)');closeOv('ovEmp');await loadEmpleados();return;}
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
      else{toast('Colaborador guardado pero falló la creación del usuario',4000);}
    }
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
    <td style="font-weight:600">${esc(u.nombre)}</td>
    <td style="font-family:'DM Sans',sans-serif;color:var(--gray)">${esc(u.usuario)}</td>
    <td><span class="badge b-${u.perfil}">${PFIL[u.perfil]||esc(u.perfil)}</span></td>
    <td style="font-size:12px">${u.locales_editor?.map(l=>esc(LOCAL_LABELS[l]||l)).join(', ')||'—'}</td>
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
    <td style="font-weight:600">${esc(t.nombre)}</td>
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
    return !esDiaPasado(dia,TURNOS_MAP[k]);
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
  
  // Insert 7 days sequentially (salteando días pasados o ya cerrados por hora)
  const dias=diasDeSemana(SEMANA_ACTUAL);
  for(let i=0;i<7;i++){
    const dKey=DIAS_TE[i];
    const hora=t[dKey]||null;
    const flex=!!t[dKey+'_flex'];
    const dia=dias[i];
    // Construir un turno hipotético para chequear si ya está cerrado por hora
    const turnoHipotetico={hora_entrada:hora,es_off:!flex&&hora===null,es_flex:flex};
    if(esDiaPasado(dia,turnoHipotetico))continue;
    const esOff=!flex&&hora===null;
    const data={semana_id:SEMANA_ID,empleado_id:empId,dia,es_off:esOff,es_flex:flex,hora_entrada:hora,comentario:null};
    const r=await api('roster_turnos','POST',data);
    if(r&&r.length)TURNOS_MAP[`${empId}_${dia}`]=r[0];
  }
  
  closeOv('ovAplicarTE');
  renderRosterTable(true);
  // Log de historial - una entrada por aplicación de plantilla
  const emp=EMPLEADOS.find(e=>e.id===empId);
  const empNombre=`${emp?.apellido||''} ${emp?.nombre_p||''}`.trim()||emp?.nombre||'';
  logHistorial('turno_estandar_aplicado',{
    empleado_id:empId,empleado_nombre:empNombre,dia:SEMANA_ACTUAL,
    detalle:{plantilla:t.nombre,plantilla_id:t.id}
  });
  toast(`✓ Turno "${t.nombre}" aplicado`);
};

// ── HISTORIAL ─────────────────────────────────────
let HISTORIAL=[];
async function loadHistorial(){
  // Trae registros de los últimos 60 días
  const limite=new Date();limite.setDate(limite.getDate()-60);
  const fechaLimite=limite.toISOString();
  const data=await api(`roster_historial?fecha=gte.${fechaLimite}&order=fecha.desc&limit=500`)||[];
  HISTORIAL=data;
  renderHistorial();
}
window.loadHistorial=loadHistorial;
window.renderHistorial=function(){
  const tb=document.getElementById('histTbody');
  if(!tb)return;
  const s=(document.getElementById('histSearch')?.value||'').toLowerCase();
  const accion=document.getElementById('histFiltAccion')?.value||'';
  const local=document.getElementById('histFiltLocal')?.value||'';
  const ACCIONES={
    turno_creado:'➕ Turno creado',
    turno_editado:'✏️ Turno editado',
    turno_borrado:'🗑 Turno borrado',
    turno_estandar_aplicado:'📋 Plantilla aplicada',
    comentario_semana:'💬 Comentario semana'
  };
  const f=HISTORIAL.filter(h=>{
    if(accion&&h.accion!==accion)return false;
    if(local&&h.local!==local)return false;
    if(s){
      const txt=`${h.usuario_nombre||''} ${h.empleado_nombre||''}`.toLowerCase();
      if(!txt.includes(s))return false;
    }
    return true;
  });
  if(!f.length){tb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px">Sin registros</td></tr>`;return;}
  tb.innerHTML=f.map(h=>{
    const dt=new Date(h.fecha);
    const fechaTxt=dt.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${fechaTxt}</td>
      <td style="font-weight:600">${esc(h.usuario_nombre||'—')}</td>
      <td>${ACCIONES[h.accion]||esc(h.accion)}</td>
      <td>${esc(h.empleado_nombre||'—')}</td>
      <td>${h.dia?fmt(h.dia):'—'}</td>
      <td style="font-size:12px">${esc(LOCAL_LABELS[h.local]||h.local||'—')}</td>
      <td style="font-size:11px;color:var(--gray);max-width:300px">${formatDetalleHistorial(h.accion,h.detalle)}</td>
    </tr>`;
  }).join('');
};
function formatDetalleHistorial(accion,detalle){
  if(!detalle)return '—';
  try{
    if(accion==='turno_creado'){
      const n=detalle.nuevo;
      if(n?.es_off)return 'OFF';
      if(n?.es_flex)return 'FLEX'+(n.hora_entrada?' '+n.hora_entrada.slice(0,5):'');
      return n?.hora_entrada?n.hora_entrada.slice(0,5):'—';
    }
    if(accion==='turno_editado'){
      const p=detalle.previo,n=detalle.nuevo;
      const fmtT=t=>!t?'—':t.es_off?'OFF':t.es_flex?'FLEX'+(t.hora_entrada?' '+t.hora_entrada.slice(0,5):''):(t.hora_entrada?t.hora_entrada.slice(0,5):'—');
      return `${fmtT(p)} → ${fmtT(n)}`;
    }
    if(accion==='turno_borrado'){
      const p=detalle.previo;
      return 'Borrado: '+(!p?'—':p.es_off?'OFF':p.es_flex?'FLEX':(p.hora_entrada?p.hora_entrada.slice(0,5):'—'));
    }
    if(accion==='turno_estandar_aplicado'){
      return 'Plantilla: '+esc(detalle.plantilla||'—');
    }
    if(accion==='comentario_semana'){
      const p=(detalle.previo||'').slice(0,40);
      const n=(detalle.nuevo||'').slice(0,40);
      return `"${esc(p)}" → "${esc(n)}"`;
    }
  }catch(e){return '—';}
  return JSON.stringify(detalle).slice(0,80);
}

// ── PROPINAS: RESUMEN GENERAL (Master) ────────────
async function loadPropinasResumen(){
  // Set default: últimos 30 días
  if(!document.getElementById('prDesde').value){
    const hasta=new Date();
    const desde=new Date();desde.setDate(desde.getDate()-30);
    document.getElementById('prDesde').value=desde.toISOString().slice(0,10);
    document.getElementById('prHasta').value=hasta.toISOString().slice(0,10);
  }
  if(!EMPLEADOS.length)await loadEmpleados();
  if(!USUARIOS_R.length)USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  cargarResumenPropinas();
}
window.loadPropinasResumen=loadPropinasResumen;

window.resumenRapido=function(dias){
  const hasta=new Date();
  const desde=new Date();desde.setDate(desde.getDate()-dias);
  document.getElementById('prDesde').value=desde.toISOString().slice(0,10);
  document.getElementById('prHasta').value=hasta.toISOString().slice(0,10);
  cargarResumenPropinas();
};

window.cargarResumenPropinas=async function(){
  const desde=document.getElementById('prDesde').value;
  const hasta=document.getElementById('prHasta').value;
  const local=document.getElementById('prLocal').value;
  const estado=document.getElementById('prEstado').value;
  if(!desde||!hasta){toast('Elegí un período válido');return;}
  // Armar query de cierres
  let q=`propinas_cierres?fecha=gte.${desde}&fecha=lte.${hasta}&select=id,fecha,turno,local,total_bruto,total_neto,total_puntos,pagado`;
  if(local)q+=`&local=eq.${encodeURIComponent(local)}`;
  if(estado==='pagado')q+='&pagado=eq.true';
  if(estado==='pendiente')q+='&pagado=eq.false';
  const cierres=await api(q)||[];
  if(!cierres.length){
    document.getElementById('prResumenCards').innerHTML=`<div style="grid-column:1/-1;background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:24px;text-align:center;color:var(--gray)">Sin cierres en este período</div>`;
    document.getElementById('prTbody').innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px">Sin datos</td></tr>';
    return;
  }
  // Resumen ejecutivo
  const totalBruto=cierres.reduce((s,c)=>s+parseFloat(c.total_bruto||0),0);
  const totalNeto=cierres.reduce((s,c)=>s+parseFloat(c.total_neto||0),0);
  const cantPagados=cierres.filter(c=>c.pagado).length;
  const cantPendientes=cierres.length-cantPagados;
  document.getElementById('prResumenCards').innerHTML=`
    <div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:4px">Cierres</div>
      <div style="font-size:24px;font-weight:700">${cierres.length}</div>
      <div style="font-size:11px;color:var(--gray)">${cantPagados} pagados · ${cantPendientes} pendientes</div>
    </div>
    <div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:4px">Total bruto</div>
      <div style="font-size:24px;font-weight:700">$${formatNumber(totalBruto)}</div>
    </div>
    <div style="background:var(--white);border:2px solid var(--olive);border-radius:12px;padding:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--olive);margin-bottom:4px">Neto a repartir</div>
      <div style="font-size:24px;font-weight:700;color:var(--olive)">$${formatNumber(totalNeto)}</div>
    </div>`;
  // Traer asignaciones de esos cierres
  const cierreIds=cierres.map(c=>c.id);
  if(!cierreIds.length){return;}
  // PostgREST acepta in.(1,2,3,...)
  const ids=cierreIds.join(',');
  const asigs=await api(`propinas_asignaciones?cierre_id=in.(${ids})&select=*`)||[];
  // Agrupar por empleado
  const porEmp={};
  asigs.forEach(a=>{
    if(!a.monto)return;
    if(!porEmp[a.empleado_id])porEmp[a.empleado_id]={cierres:0,puntos:0,monto:0};
    porEmp[a.empleado_id].cierres++;
    porEmp[a.empleado_id].puntos+=parseFloat(a.puntos||0);
    porEmp[a.empleado_id].monto+=parseFloat(a.monto||0);
  });
  // Render tabla
  const filas=Object.entries(porEmp).map(([empId,data])=>{
    const e=EMPLEADOS.find(x=>x.id===parseInt(empId));
    return {emp:e,...data,empId:parseInt(empId)};
  }).sort((a,b)=>b.monto-a.monto);
  const tb=document.getElementById('prTbody');
  if(!filas.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px">Sin asignaciones en este período</td></tr>';return;}
  tb.innerHTML=filas.map(f=>{
    const apellido=f.emp?.apellido||f.emp?.nombre||'—';
    const nombrep=f.emp?.nombre_p||'';
    const multi=f.emp?.es_multilocal?' <span style="font-size:9px;background:#EDE3F7;color:#5B3A8E;padding:1px 5px;border-radius:8px;font-weight:600">MULTI</span>':'';
    return `<tr>
      <td style="font-weight:600">${esc(apellido)}${nombrep?' '+esc(nombrep):''}${multi}</td>
      <td style="font-size:12px">${esc(LOCAL_LABELS[f.emp?.local]||f.emp?.local||'—')}</td>
      <td style="text-align:center">${f.cierres}</td>
      <td style="text-align:center">${f.puntos}</td>
      <td style="text-align:right;font-weight:600">$${formatNumber(f.monto)}</td>
    </tr>`;
  }).join('');
};

// ── MI PROPINA (Colaborador) ──────────────────────
async function loadMiPropina(){
  const cont=document.getElementById('mpContenido');
  if(!cont)return;
  if(CU?.nombre)document.getElementById('mpBienvenido').textContent=`Mi Propina · ${CU.nombre}`;
  if(!CU?.empleado_id){
    cont.innerHTML=`<div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:24px;text-align:center;color:var(--gray)">
      Tu usuario no está vinculado a un colaborador.<br><span style="font-size:12px">Pedile al administrador que te vincule para ver tus propinas.</span>
    </div>`;
    return;
  }
  // Traer asignaciones con datos del cierre
  // Limitamos a últimos ~4 meses para no traer histórico muy viejo (pendientes pueden ser de cualquier fecha pero los pagados solo de los últimos 3 meses)
  const hoy=new Date();
  const limite=new Date(hoy.getFullYear(),hoy.getMonth()-3,1); // primer día de hace 3 meses
  const limiteStr=limite.toISOString().slice(0,10);
  const asigs=await api(`propinas_asignaciones?empleado_id=eq.${CU.empleado_id}&select=*,cierre:cierre_id(fecha,turno,local,pagado,pagado_en)&order=id.desc`)||[];
  // Separar pendientes y pagados
  const pendientes=asigs.filter(a=>a.cierre&&!a.cierre.pagado&&a.monto>0);
  // Pagados de los últimos 3 meses (incluyendo el actual)
  const pagadosRecientes=asigs.filter(a=>a.cierre&&a.cierre.pagado&&a.monto>0&&a.cierre.fecha>=limiteStr);

  // Render — banner de pendientes
  let html='';
  const totalPendiente=pendientes.reduce((s,a)=>s+parseFloat(a.monto||0),0);
  if(pendientes.length){
    html+=`<div style="background:linear-gradient(135deg,var(--olive),var(--olive-l));color:var(--white);border-radius:16px;padding:24px;margin-bottom:20px;text-align:center;box-shadow:0 4px 16px rgba(92,107,58,.25)">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85;margin-bottom:6px">Total pendiente de cobro</div>
      <div style="font-size:36px;font-weight:700;letter-spacing:-1px">$${formatNumber(totalPendiente)}</div>
      <div style="font-size:11px;opacity:.75;margin-top:6px">${pendientes.length} ${pendientes.length===1?'cierre':'cierres'} pendiente${pendientes.length===1?'':'s'}</div>
    </div>`;
  }else{
    html+=`<div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
      <div style="font-size:32px;margin-bottom:8px">💰</div>
      <div style="font-weight:600;color:var(--dark);margin-bottom:4px">No tenés propinas pendientes</div>
      <div style="font-size:12px;color:var(--gray)">Cuando se carguen propinas para vos, las vas a ver acá.</div>
    </div>`;
  }

  // Histórico de cobrados (últimos 3 meses + actual)
  // Armar buckets: mes actual + 3 anteriores
  const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const buckets=[];
  for(let i=0;i<4;i++){
    const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl=`${MESES[d.getMonth()]} ${d.getFullYear()}`;
    buckets.push({key,lbl,total:0,cantidad:0});
  }
  pagadosRecientes.forEach(a=>{
    const k=a.cierre.fecha.slice(0,7); // YYYY-MM
    const b=buckets.find(x=>x.key===k);
    if(b){b.total+=parseFloat(a.monto||0);b.cantidad++;}
  });
  const totalCobrado=buckets.reduce((s,b)=>s+b.total,0);
  // Solo mostrar el histórico si hay algo cobrado o si hay pendientes (para que el colaborador entienda el contexto)
  if(totalCobrado>0||pendientes.length){
    html+=`<div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:600;font-size:13px">💵 Ya cobrado</div>
        <div style="font-size:11px;color:var(--gray)">Últimos 3 meses</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        ${buckets.map((b,i)=>`
          <div style="background:${i===0?'var(--cream)':'transparent'};border-radius:8px;padding:10px;text-align:center;border:1px solid ${i===0?'var(--olive)':'var(--sand-l)'}">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:4px">${b.lbl}${i===0?' · Actual':''}</div>
            <div style="font-size:16px;font-weight:700;color:${b.total>0?'var(--dark)':'var(--gray)'}">$${formatNumber(b.total)}</div>
            ${b.cantidad?`<div style="font-size:10px;color:var(--gray);margin-top:2px">${b.cantidad} ${b.cantidad===1?'cierre':'cierres'}</div>`:''}
          </div>
        `).join('')}
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--sand-l);display:flex;justify-content:space-between;font-size:13px">
        <span style="color:var(--gray)">Total cobrado:</span>
        <strong>$${formatNumber(totalCobrado)}</strong>
      </div>
    </div>`;
  }

  // Detalle por local de los pendientes
  if(pendientes.length){
    const porLocal={};
    pendientes.forEach(a=>{
      const loc=a.cierre.local;
      if(!porLocal[loc])porLocal[loc]={total:0,dias:[]};
      porLocal[loc].total+=parseFloat(a.monto||0);
      porLocal[loc].dias.push({
        fecha:a.cierre.fecha,
        turno:a.cierre.turno,
        puntos:parseFloat(a.puntos),
        monto:parseFloat(a.monto||0)
      });
    });
    Object.values(porLocal).forEach(l=>l.dias.sort((a,b)=>b.fecha.localeCompare(a.fecha)));
    const turnoIcon={mediodia:'🌤',noche:'🌙'};
    const turnoLbl={mediodia:'Mediodía',noche:'Noche'};
    html+=`<div style="margin-bottom:10px;font-size:13px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:1px">Detalle de pendientes</div>`;
    Object.entries(porLocal).forEach(([loc,data])=>{
      html+=`<div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--sand-l);margin-bottom:10px">
          <div style="font-weight:600;font-size:14px">📍 ${esc(LOCAL_LABELS[loc]||loc)}</div>
          <div style="font-weight:700;color:var(--olive);font-size:16px">$${formatNumber(data.total)}</div>
        </div>
        ${data.dias.map(d=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px">
            <div>
              <span style="font-weight:600">${fmt(d.fecha)}</span>
              <span style="color:var(--gray);margin-left:6px">${turnoIcon[d.turno]||''} ${turnoLbl[d.turno]||d.turno}</span>
              <span style="font-size:11px;color:var(--gray);margin-left:8px">${d.puntos===1?'1 punto':d.puntos===0.5?'½ punto':d.puntos+' pts'}</span>
            </div>
            <div style="font-weight:600">$${formatNumber(d.monto)}</div>
          </div>
        `).join('')}
      </div>`;
    });
  }
  cont.innerHTML=html;
}
window.loadMiPropina=loadMiPropina;

// ── PROPINAS: LISTA + FORMULARIO ──────────────────
const PROP_DENOMINACIONES=[20000,10000,5000,2000,1000];
const PROP_MONEDAS=[{c:'usd',l:'USD'},{c:'eur',l:'EUR'},{c:'brl',l:'BRL'}];
let PROP_LOCAL_ACTUAL=null;
let PROP_CIERRES=[];
let PROP_CIERRE_EDIT=null; // null=nuevo; id=editando
let PROP_COLABS_PUNTOS={}; // {empleado_id: 0 | 0.5 | 1}
let PROP_CONFIG_CACHE=null;

async function loadPropinas(){
  // Recargar config (por si cambió el tipo de cambio)
  const cfg=await api('propinas_config?order=id.desc&limit=1');
  PROP_CONFIG_CACHE=cfg&&cfg.length?cfg[0]:{cambio_usd:0,cambio_eur:0,cambio_brl:0,porcentaje_admin:10};
  if(!EMPLEADOS.length)await loadEmpleados();
  if(!USUARIOS_R.length)USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  // Set local por default: el primero que el usuario puede editar
  if(!PROP_LOCAL_ACTUAL&&PROP_MIS_LOCALES.length)PROP_LOCAL_ACTUAL=PROP_MIS_LOCALES[0];
  buildPropLocalTabs();
  await loadCierres();
}
window.loadPropinas=loadPropinas;

function buildPropLocalTabs(){
  const cont=document.getElementById('propLocalTabs');
  if(!cont)return;
  cont.innerHTML=PROP_MIS_LOCALES.map(l=>
    `<div class="local-tab ${l===PROP_LOCAL_ACTUAL?'active':''}" onclick="cambiarLocalPropina('${l}')">${esc(LOCAL_LABELS[l]||l)}</div>`
  ).join('');
}
window.cambiarLocalPropina=async function(l){
  PROP_LOCAL_ACTUAL=l;
  buildPropLocalTabs();
  await loadCierres();
};

async function loadCierres(){
  if(!PROP_LOCAL_ACTUAL){document.getElementById('propCierresTbody').innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:24px">Sin locales asignados</td></tr>';return;}
  // Ocultar columna de checkbox si no es master
  const checkAllTh=document.getElementById('pcCheckAll')?.parentElement;
  if(checkAllTh)checkAllTh.style.display=esMaster()?'':'none';
  const r=await api(`propinas_cierres?local=eq.${encodeURIComponent(PROP_LOCAL_ACTUAL)}&order=fecha.desc&limit=50`)||[];
  PROP_CIERRES=r;
  renderCierres();
}

function renderCierres(){
  const tb=document.getElementById('propCierresTbody');
  if(!tb)return;
  // Resumen
  const totalBruto=PROP_CIERRES.reduce((s,c)=>s+parseFloat(c.total_bruto||0),0);
  const totalNeto=PROP_CIERRES.reduce((s,c)=>s+parseFloat(c.total_neto||0),0);
  const pendientes=PROP_CIERRES.filter(c=>!c.pagado);
  const pagados=PROP_CIERRES.filter(c=>c.pagado);
  const netoPendiente=pendientes.reduce((s,c)=>s+parseFloat(c.total_neto||0),0);
  const netoPagado=pagados.reduce((s,c)=>s+parseFloat(c.total_neto||0),0);
  const banner=document.getElementById('propResumenBanner');
  if(banner){
    if(!PROP_CIERRES.length){banner.style.display='none';}
    else{
      banner.style.display='grid';
      banner.innerHTML=`
        <div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:4px">Cierres</div>
          <div style="font-size:22px;font-weight:700">${PROP_CIERRES.length}</div>
          <div style="font-size:11px;color:var(--gray)">${pendientes.length} pendientes · ${pagados.length} pagados</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--sand-l);border-radius:12px;padding:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:4px">Total bruto acumulado</div>
          <div style="font-size:22px;font-weight:700">$${formatNumber(totalBruto)}</div>
        </div>
        <div style="background:var(--white);border:2px solid var(--olive);border-radius:12px;padding:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--olive);margin-bottom:4px">Neto a liquidar</div>
          <div style="font-size:22px;font-weight:700;color:var(--olive)">$${formatNumber(netoPendiente)}</div>
          <div style="font-size:11px;color:var(--gray)">+$${formatNumber(netoPagado)} ya pagados</div>
        </div>`;
    }
  }
  if(!PROP_CIERRES.length){tb.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:24px">Sin cierres todavía. Apretá "+ Nuevo cierre" para empezar.</td></tr>';actualizarBarraSeleccion();return;}
  tb.innerHTML=PROP_CIERRES.map(c=>{
    const usr=USUARIOS_R.find(u=>u.id===c.creado_por);
    const turnoTxt=c.turno==='mediodia'?'🌤 Mediodía':'🌙 Noche';
    const estadoBadge=c.pagado?'<span class="badge b-aprobado">✓ Pagado</span>':'<span class="badge b-procesada">Cerrado</span>';
    const puedeEditar=esMaster();
    // Acciones: editar solo si master Y no está pagado. Sino, solo ver.
    const editable=esMaster()&&!c.pagado;
    let acciones=editable?`<button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="abrirCierre(${c.id})" title="Editar">✏️</button>`:`<button class="abtn ab" style="padding:4px 8px;font-size:11px" onclick="abrirCierre(${c.id})" title="Ver">👁</button>`;
    if(esMaster()&&c.pagado){
      acciones+=` <button class="abtn ab" style="padding:4px 8px;font-size:11px" onclick="desmarcarPagado(${c.id})" title="Revertir pago">↶</button>`;
    }
    // Checkbox solo para master y cierres NO pagados
    const checkbox=(esMaster()&&!c.pagado)?`<input type="checkbox" class="pc-check" value="${c.id}" data-neto="${c.total_neto||0}" onchange="actualizarBarraSeleccion()" style="width:auto;margin:0;cursor:pointer">`:'';
    const tdCheck=esMaster()?`<td style="text-align:center;width:30px">${checkbox}</td>`:'';
    return `<tr>
      ${tdCheck}
      <td style="font-weight:600">${fmt(c.fecha)}</td>
      <td>${turnoTxt}</td>
      <td style="font-size:12px">${esc(LOCAL_LABELS[c.local]||c.local)}</td>
      <td>$${formatNumber(c.total_bruto)}</td>
      <td style="font-weight:600">$${formatNumber(c.total_neto)}</td>
      <td style="text-align:center">${c.total_puntos}</td>
      <td style="font-size:11px;color:var(--gray)">${esc(usr?.nombre||'—')}</td>
      <td>${estadoBadge}</td>
      <td style="white-space:nowrap">${acciones}</td>
    </tr>`;
  }).join('');
  actualizarBarraSeleccion();
}

window.toggleSeleccionarTodos=function(){
  const master=document.getElementById('pcCheckAll');
  document.querySelectorAll('.pc-check').forEach(c=>{c.checked=master.checked;});
  actualizarBarraSeleccion();
};

window.actualizarBarraSeleccion=function(){
  const checks=[...document.querySelectorAll('.pc-check:checked')];
  const barra=document.getElementById('pcBarraSeleccion');
  const ckAll=document.getElementById('pcCheckAll');
  if(ckAll){
    const total=document.querySelectorAll('.pc-check').length;
    ckAll.checked=total>0&&checks.length===total;
    ckAll.indeterminate=checks.length>0&&checks.length<total;
  }
  if(!barra)return;
  if(!checks.length){barra.style.display='none';return;}
  barra.style.display='flex';
  const sumaNeto=checks.reduce((s,c)=>s+parseFloat(c.dataset.neto||0),0);
  document.getElementById('pcBarraTxt').innerHTML=`<strong>${checks.length}</strong> ${checks.length===1?'cierre seleccionado':'cierres seleccionados'} · Neto: <strong>$${formatNumber(sumaNeto)}</strong>`;
};

window.pagarSeleccionados=async function(){
  const ids=[...document.querySelectorAll('.pc-check:checked')].map(c=>parseInt(c.value));
  if(!ids.length)return;
  if(!confirm(`¿Marcar ${ids.length} ${ids.length===1?'cierre':'cierres'} como pagados? Los colaboradores ya no los verán en "Mi Propina".`))return;
  const ahora=new Date().toISOString();
  const r=await api(`propinas_cierres?id=in.(${ids.join(',')})`,'PATCH',{pagado:true,pagado_en:ahora,pagado_por:CU.id});
  if(r===null){toast('Error al marcar como pagados');return;}
  toast(`✓ ${ids.length} ${ids.length===1?'cierre marcado':'cierres marcados'} como pagados`);
  loadCierres();
};

window.desmarcarPagado=async function(id){
  if(!confirm('¿Revertir el pago de este cierre? Volverá a aparecer en "Mi Propina" de los colaboradores.'))return;
  const r=await api(`propinas_cierres?id=eq.${id}`,'PATCH',{pagado:false,pagado_en:null,pagado_por:null});
  if(r===null){toast('Error al revertir');return;}
  toast('Cierre desmarcado');
  loadCierres();
};

function formatNumber(n){
  if(n==null)return '0';
  return Number(n).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2});
}

window.abrirNuevoCierre=async function(){
  PROP_CIERRE_EDIT=null;
  PROP_COLABS_PUNTOS={};
  document.getElementById('pfTitulo').textContent='Nuevo cierre';
  // Llenar select de locales (solo los que puede editar)
  const sel=document.getElementById('pfLocal');
  sel.innerHTML=PROP_MIS_LOCALES.map(l=>`<option value="${l}" ${l===PROP_LOCAL_ACTUAL?'selected':''}>${esc(LOCAL_LABELS[l]||l)}</option>`).join('');
  sel.disabled=false;
  document.getElementById('pfFecha').value=hoyStr();
  document.getElementById('pfFecha').max=hoyStr(); // no permitir fechas futuras
  document.getElementById('pfTurno').value='mediodia';
  // Renderizar billetes y monedas
  buildBilletesForm({});
  buildExtranjeraForm({});
  document.getElementById('pfTarjeta').value='';
  document.getElementById('pfPorcAdminLbl').textContent=PROP_CONFIG_CACHE?.porcentaje_admin||10;
  renderColaboradoresPunto();
  recalcularPropina();
  showView('vPropinasForm');
};

window.abrirCierre=async function(id){
  const c=PROP_CIERRES.find(x=>x.id===id);
  if(!c)return;
  PROP_CIERRE_EDIT=c;
  // Un cierre pagado es solo-lectura para TODOS (incluido master)
  const soloLectura=c.pagado||!esMaster();
  document.getElementById('pfTitulo').textContent=c.pagado?'Ver cierre (pagado)':(esMaster()?'Editar cierre':'Ver cierre (cerrado)');
  const sel=document.getElementById('pfLocal');
  sel.innerHTML=PROP_MIS_LOCALES.map(l=>`<option value="${l}" ${l===c.local?'selected':''}>${esc(LOCAL_LABELS[l]||l)}</option>`).join('');
  sel.disabled=soloLectura;
  document.getElementById('pfFecha').value=c.fecha;
  document.getElementById('pfFecha').max=hoyStr();
  document.getElementById('pfFecha').disabled=soloLectura;
  document.getElementById('pfTurno').value=c.turno;
  document.getElementById('pfTurno').disabled=soloLectura;
  buildBilletesForm(c);
  buildExtranjeraForm(c);
  document.getElementById('pfTarjeta').value=c.monto_tarjeta||0;
  document.getElementById('pfPorcAdminLbl').textContent=c.porcentaje_admin||10;
  // Cargar asignaciones existentes
  const asigs=await api(`propinas_asignaciones?cierre_id=eq.${id}&select=*`)||[];
  PROP_COLABS_PUNTOS={};
  asigs.forEach(a=>{PROP_COLABS_PUNTOS[a.empleado_id]=parseFloat(a.puntos);});
  // Deshabilitar todos los inputs si es solo-lectura
  if(soloLectura)setTimeout(()=>{
    document.querySelectorAll('#vPropinasForm input, #vPropinasForm select').forEach(el=>el.disabled=true);
    // Ocultar el botón "Guardar cierre"
    const btnGuardar=document.querySelector('#vPropinasForm .ma .bp');
    if(btnGuardar)btnGuardar.style.display='none';
  },50);else{
    // Asegurar que el botón guardar esté visible cuando es editable
    setTimeout(()=>{
      const btnGuardar=document.querySelector('#vPropinasForm .ma .bp');
      if(btnGuardar)btnGuardar.style.display='';
    },50);
  }
  renderColaboradoresPunto();
  recalcularPropina();
  showView('vPropinasForm');
};

function buildBilletesForm(c){
  document.getElementById('pfBilletes').innerHTML=PROP_DENOMINACIONES.map(d=>{
    const cant=c[`bil_${d}`]||0;
    return `<div style="display:grid;grid-template-columns:90px 1fr 110px;gap:10px;align-items:center;padding:4px 0">
      <div style="font-weight:600">$${formatNumber(d)}</div>
      <input type="number" id="pfBil_${d}" min="0" value="${cant}" oninput="recalcularPropina()" style="padding:6px 8px;border:1px solid var(--sand);border-radius:6px">
      <div style="text-align:right;font-size:12px;color:var(--gray)" id="pfBilSubt_${d}">$${formatNumber(cant*d)}</div>
    </div>`;
  }).join('');
}

function buildExtranjeraForm(c){
  document.getElementById('pfExtranjera').innerHTML=PROP_MONEDAS.map(m=>{
    const monto=c[`monto_${m.c}`]||0;
    const tc=c.id?(c[`tc_${m.c}`]||0):(PROP_CONFIG_CACHE?.[`cambio_${m.c}`]||0);
    return `<div style="display:grid;grid-template-columns:60px 1fr 80px 110px;gap:10px;align-items:center;padding:4px 0">
      <div style="font-weight:600">${m.l}</div>
      <input type="number" id="pfMon_${m.c}" min="0" step="0.01" value="${monto}" oninput="recalcularPropina()" placeholder="Monto en ${m.l}" style="padding:6px 8px;border:1px solid var(--sand);border-radius:6px">
      <div style="font-size:11px;color:var(--gray);text-align:center">× $${formatNumber(tc)}</div>
      <div style="text-align:right;font-size:12px;color:var(--gray)" id="pfMonSubt_${m.c}">$${formatNumber(monto*tc)}</div>
    </div>`;
  }).join('');
}

window.renderColaboradoresPunto=function(){
  const localSel=document.getElementById('pfLocal').value;
  // Colaboradores del local (incluye multilocales) + eventuales del día
  const fecha=document.getElementById('pfFecha').value;
  let colabs=EMPLEADOS.filter(e=>e.activo!==false&&(e.local===localSel||e.es_multilocal===true));
  // Filtro de sector si está seleccionado
  const sectorFiltro=document.getElementById('pfSectorFiltro')?.value||'';
  // Poblar dropdown de sector con los disponibles
  const sectoresDisp=[...new Set(colabs.map(e=>e.sector).filter(Boolean))].sort();
  const selSec=document.getElementById('pfSectorFiltro');
  if(selSec){
    selSec.innerHTML='<option value="">Todos los sectores</option>'+sectoresDisp.map(s=>`<option value="${esc(s)}" ${s===sectorFiltro?'selected':''}>${esc(s)}</option>`).join('');
  }
  if(sectorFiltro)colabs=colabs.filter(e=>e.sector===sectorFiltro);
  // Ordenar por apellido
  colabs.sort((a,b)=>(a.apellido||a.nombre||'').localeCompare(b.apellido||b.nombre||''));
  const tb=document.getElementById('pfColabsTbody');
  if(!colabs.length){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--gray);padding:16px">Sin colaboradores</td></tr>';recalcularPropina();return;}
  tb.innerHTML=colabs.map(e=>{
    const puntos=PROP_COLABS_PUNTOS[e.id]??0;
    const apellido=e.apellido||e.nombre||'';
    const nombrep=e.nombre_p||'';
    const multi=e.es_multilocal&&e.local!==localSel?` <span style="font-size:9px;background:#EDE3F7;color:#5B3A8E;padding:1px 5px;border-radius:8px;font-weight:600">${esc(LOCAL_LABELS[e.local]||e.local)}</span>`:'';
    return `<tr>
      <td style="font-weight:600">${esc(apellido)}${nombrep?' '+esc(nombrep):''}${multi}<div style="font-size:11px;color:var(--gray);font-weight:400">${esc(e.sector||'')} · ${esc(e.categoria||'')}</div></td>
      <td style="text-align:center">
        <div style="display:inline-flex;gap:4px">
          <button onclick="setPuntos(${e.id},0)" class="pt-btn ${puntos===0?'active':''}" data-pt="0">0</button>
          <button onclick="setPuntos(${e.id},0.5)" class="pt-btn ${puntos===0.5?'active':''}" data-pt="0.5">½</button>
          <button onclick="setPuntos(${e.id},1)" class="pt-btn ${puntos===1?'active':''}" data-pt="1">1</button>
        </div>
      </td>
      <td style="text-align:right;font-weight:600" id="pfPropina_${e.id}">$0</td>
    </tr>`;
  }).join('');
  recalcularPropina();
};

window.setPuntos=function(empId,p){
  // Bloqueo: cierre pagado = NADIE puede editar; cierre no pagado = solo master
  if(PROP_CIERRE_EDIT){
    if(PROP_CIERRE_EDIT.pagado)return;
    if(!esMaster())return;
  }
  PROP_COLABS_PUNTOS[empId]=p;
  // Refrescar botones de esa fila
  const row=document.querySelector(`#pfPropina_${empId}`)?.parentElement;
  if(row){
    row.querySelectorAll('.pt-btn').forEach(b=>{
      const v=parseFloat(b.dataset.pt);
      b.classList.toggle('active',v===p);
    });
  }
  recalcularPropina();
};

window.recalcularPropina=function(){
  // Total billetes pesos
  let totalPesos=0;
  PROP_DENOMINACIONES.forEach(d=>{
    const cant=parseFloat(document.getElementById(`pfBil_${d}`)?.value)||0;
    const subt=cant*d;
    totalPesos+=subt;
    const el=document.getElementById(`pfBilSubt_${d}`);
    if(el)el.textContent='$'+formatNumber(subt);
  });
  document.getElementById('pfSubPesos').textContent='$'+formatNumber(totalPesos);
  // Total moneda extranjera
  let totalExt=0;
  PROP_MONEDAS.forEach(m=>{
    const monto=parseFloat(document.getElementById(`pfMon_${m.c}`)?.value)||0;
    const tc=PROP_CIERRE_EDIT?(PROP_CIERRE_EDIT[`tc_${m.c}`]||0):(PROP_CONFIG_CACHE?.[`cambio_${m.c}`]||0);
    const subt=monto*tc;
    totalExt+=subt;
    const el=document.getElementById(`pfMonSubt_${m.c}`);
    if(el)el.textContent='$'+formatNumber(subt);
  });
  document.getElementById('pfSubExt').textContent='$'+formatNumber(totalExt);
  // Tarjeta
  const tarjeta=parseFloat(document.getElementById('pfTarjeta')?.value)||0;
  // Bruto
  const bruto=totalPesos+totalExt+tarjeta;
  const porcAdmin=PROP_CIERRE_EDIT?(PROP_CIERRE_EDIT.porcentaje_admin||10):(PROP_CONFIG_CACHE?.porcentaje_admin||10);
  const descAdmin=bruto*(porcAdmin/100);
  const neto=bruto-descAdmin;
  document.getElementById('pfTotalBruto').textContent='$'+formatNumber(bruto);
  document.getElementById('pfDescAdmin').textContent='-$'+formatNumber(descAdmin);
  document.getElementById('pfNeto').textContent='$'+formatNumber(neto);
  // Puntos
  const totalPuntos=Object.values(PROP_COLABS_PUNTOS).reduce((a,b)=>a+b,0);
  document.getElementById('pfTotalPuntos').textContent=totalPuntos;
  const valorPunto=totalPuntos>0?neto/totalPuntos:0;
  document.getElementById('pfValorPunto').textContent='$'+formatNumber(valorPunto);
  // Actualizar propina por colaborador
  Object.entries(PROP_COLABS_PUNTOS).forEach(([id,pts])=>{
    const el=document.getElementById(`pfPropina_${id}`);
    if(el)el.textContent='$'+formatNumber(pts*valorPunto);
  });
};

window.guardarCierrePropina=async function(){
  if(PROP_CIERRE_EDIT?.pagado){toast('Este cierre ya fue pagado y no se puede editar. Revertí el pago primero.');return;}
  if(PROP_CIERRE_EDIT&&!esMaster()){toast('Solo master puede editar cierres ya guardados');return;}
  const local=document.getElementById('pfLocal').value;
  const fecha=document.getElementById('pfFecha').value;
  const turno=document.getElementById('pfTurno').value;
  if(!fecha){toast('Elegí una fecha');return;}
  if(fecha>hoyStr()){toast('No se pueden cargar fechas futuras');return;}
  if(!puedeEditarPropinaLocal(local)){toast('Sin permiso para este local');return;}
  // Si es nuevo, verificar que no exista ya
  if(!PROP_CIERRE_EDIT){
    const exist=await api(`propinas_cierres?local=eq.${encodeURIComponent(local)}&fecha=eq.${fecha}&turno=eq.${turno}&select=id,creado_por&limit=1`);
    if(exist&&exist.length){
      const usr=USUARIOS_R.find(u=>u.id===exist[0].creado_por);
      toast(`Ya hay un cierre cargado para ese día/turno por ${usr?.nombre||'otro usuario'}`,5000);
      return;
    }
  }
  // Armar payload
  const datos={local,fecha,turno};
  PROP_DENOMINACIONES.forEach(d=>{datos[`bil_${d}`]=parseInt(document.getElementById(`pfBil_${d}`).value)||0;});
  PROP_MONEDAS.forEach(m=>{
    datos[`monto_${m.c}`]=parseFloat(document.getElementById(`pfMon_${m.c}`).value)||0;
    datos[`tc_${m.c}`]=PROP_CIERRE_EDIT?(PROP_CIERRE_EDIT[`tc_${m.c}`]||0):(PROP_CONFIG_CACHE?.[`cambio_${m.c}`]||0);
  });
  datos.monto_tarjeta=parseFloat(document.getElementById('pfTarjeta').value)||0;
  datos.porcentaje_admin=PROP_CIERRE_EDIT?(PROP_CIERRE_EDIT.porcentaje_admin||10):(PROP_CONFIG_CACHE?.porcentaje_admin||10);
  // Calcular totales
  let bruto=0;
  PROP_DENOMINACIONES.forEach(d=>{bruto+=datos[`bil_${d}`]*d;});
  PROP_MONEDAS.forEach(m=>{bruto+=datos[`monto_${m.c}`]*datos[`tc_${m.c}`];});
  bruto+=datos.monto_tarjeta;
  const descAdmin=bruto*(datos.porcentaje_admin/100);
  const neto=bruto-descAdmin;
  const totalPuntos=Object.values(PROP_COLABS_PUNTOS).reduce((a,b)=>a+b,0);
  datos.total_bruto=bruto;
  datos.total_neto=neto;
  datos.total_puntos=totalPuntos;
  // Guardar cierre
  let cierreId;
  if(PROP_CIERRE_EDIT){
    datos.actualizado_en=new Date().toISOString();
    const r=await api(`propinas_cierres?id=eq.${PROP_CIERRE_EDIT.id}`,'PATCH',datos);
    if(r===null){toast('Error al actualizar el cierre');return;}
    cierreId=PROP_CIERRE_EDIT.id;
    // Borrar asignaciones viejas
    await api(`propinas_asignaciones?cierre_id=eq.${cierreId}`,'DELETE');
  }else{
    datos.creado_por=CU.id;
    const r=await api('propinas_cierres','POST',datos);
    if(!r||!r.length){toast('Error al crear el cierre');return;}
    cierreId=r[0].id;
  }
  // Insertar asignaciones (solo las con puntos > 0)
  const valorPunto=totalPuntos>0?neto/totalPuntos:0;
  const asigs=Object.entries(PROP_COLABS_PUNTOS).filter(([,p])=>p>0).map(([empId,p])=>({
    cierre_id:cierreId,empleado_id:parseInt(empId),puntos:p,monto:p*valorPunto
  }));
  if(asigs.length){await api('propinas_asignaciones','POST',asigs);}
  toast('✓ Cierre guardado');
  PROP_LOCAL_ACTUAL=local;
  showView('vPropinas');
};

// ── PROPINAS: CONFIGURACIÓN (Master) ──────────────
let PROPINAS_CONFIG=null;
let PROPINAS_EDITORES=[];
let epEditandoId=null;

async function loadPropinasConfig(){
  // Carga la config (siempre debería existir 1 fila)
  const cfg=await api('propinas_config?order=id.desc&limit=1');
  if(cfg&&cfg.length){
    PROPINAS_CONFIG=cfg[0];
    document.getElementById('pcCambioUsd').value=PROPINAS_CONFIG.cambio_usd||'';
    document.getElementById('pcCambioEur').value=PROPINAS_CONFIG.cambio_eur||'';
    document.getElementById('pcCambioBrl').value=PROPINAS_CONFIG.cambio_brl||'';
    document.getElementById('pcPorcAdmin').value=PROPINAS_CONFIG.porcentaje_admin||10;
    if(PROPINAS_CONFIG.actualizado_en){
      const dt=new Date(PROPINAS_CONFIG.actualizado_en);
      const usr=PROPINAS_CONFIG.actualizado_por?USUARIOS_R.find(u=>u.id===PROPINAS_CONFIG.actualizado_por)?.nombre:null;
      document.getElementById('pcUltAct').textContent=`Última actualización: ${dt.toLocaleString('es-AR')}${usr?' por '+usr:''}`;
    }
  }
  await loadEditoresPropina();
}

window.guardarPropinasConfig=async function(){
  const data={
    cambio_usd:parseFloat(document.getElementById('pcCambioUsd').value)||0,
    cambio_eur:parseFloat(document.getElementById('pcCambioEur').value)||0,
    cambio_brl:parseFloat(document.getElementById('pcCambioBrl').value)||0,
    porcentaje_admin:parseFloat(document.getElementById('pcPorcAdmin').value)||10,
    actualizado_en:new Date().toISOString(),
    actualizado_por:CU.id
  };
  if(PROPINAS_CONFIG&&PROPINAS_CONFIG.id){
    const r=await api(`propinas_config?id=eq.${PROPINAS_CONFIG.id}`,'PATCH',data);
    if(r===null){toast('Error al guardar');return;}
  }else{
    const r=await api('propinas_config','POST',data);
    if(r&&r.length)PROPINAS_CONFIG=r[0];
  }
  toast('✓ Configuración guardada');
  loadPropinasConfig();
};

async function loadEditoresPropina(){
  // Trae todos los usuarios y la lista de editores ya asignados
  if(!USUARIOS_R.length)USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  const editores=await api('propinas_editores?select=*')||[];
  PROPINAS_EDITORES=editores;
  renderEditoresPropina();
}

function renderEditoresPropina(){
  const tb=document.getElementById('pcEditoresTbody');
  if(!tb)return;
  if(!PROPINAS_EDITORES.length){tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:24px">Sin editores asignados todavía</td></tr>';return;}
  tb.innerHTML=PROPINAS_EDITORES.map(ed=>{
    const u=USUARIOS_R.find(x=>x.id===ed.usuario_id);
    const locales=(ed.locales||[]).map(l=>esc(LOCAL_LABELS[l]||l)).join(', ')||'—';
    return `<tr>
      <td style="font-weight:600">${esc(u?.nombre||'(usuario eliminado)')}</td>
      <td style="color:var(--gray)">${esc(u?.usuario||'—')}</td>
      <td style="font-size:12px">${locales}</td>
      <td><button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editEditorPropina(${ed.id})">✏️</button></td>
    </tr>`;
  }).join('');
}

window.openEditorPropModal=function(){
  epEditandoId=null;
  document.getElementById('epTitle').textContent='Asignar editor de propinas';
  document.getElementById('epBtnBorrar').style.display='none';
  // Filtrar usuarios que NO sean ya editores
  const idsExistentes=new Set(PROPINAS_EDITORES.map(e=>e.usuario_id));
  const disponibles=USUARIOS_R.filter(u=>!idsExistentes.has(u.id));
  document.getElementById('epUsuario').innerHTML=disponibles.map(u=>`<option value="${u.id}">${esc(u.nombre)} (${esc(u.usuario)})</option>`).join('');
  document.getElementById('epUsuario').disabled=false;
  buildEpLocales([]);
  openOv('ovEditorProp');
};

window.editEditorPropina=function(id){
  const ed=PROPINAS_EDITORES.find(x=>x.id===id);
  if(!ed)return;
  epEditandoId=id;
  document.getElementById('epTitle').textContent='Editar editor de propinas';
  document.getElementById('epBtnBorrar').style.display='';
  const u=USUARIOS_R.find(x=>x.id===ed.usuario_id);
  document.getElementById('epUsuario').innerHTML=`<option value="${u?.id||''}">${esc(u?.nombre||'')} (${esc(u?.usuario||'')})</option>`;
  document.getElementById('epUsuario').disabled=true;
  buildEpLocales(ed.locales||[]);
  openOv('ovEditorProp');
};

function buildEpLocales(seleccionados){
  document.getElementById('epLocales').innerHTML=Object.keys(LOCAL_LABELS).map(l=>{
    const checked=seleccionados.includes(l)?'checked':'';
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px"><input type="checkbox" class="ep-local" value="${l}" ${checked} style="width:auto;margin:0">${esc(LOCAL_LABELS[l])}</label>`;
  }).join('');
}

window.guardarEditorPropina=async function(){
  const usuarioId=parseInt(document.getElementById('epUsuario').value);
  if(!usuarioId){toast('Elegí un usuario');return;}
  const locales=[...document.querySelectorAll('.ep-local:checked')].map(c=>c.value);
  if(!locales.length){toast('Asigná al menos un local');return;}
  const data={usuario_id:usuarioId,locales};
  if(epEditandoId){
    const r=await api(`propinas_editores?id=eq.${epEditandoId}`,'PATCH',data);
    if(r===null){toast('Error al guardar');return;}
  }else{
    const r=await api('propinas_editores','POST',data);
    if(!r||!r.length){toast('Error al crear');return;}
  }
  toast('✓ Editor guardado');
  closeOv('ovEditorProp');
  loadEditoresPropina();
};

window.borrarEditorPropina=async function(){
  if(!epEditandoId)return;
  if(!confirm('¿Quitar a este usuario como editor de propinas?'))return;
  await api(`propinas_editores?id=eq.${epEditandoId}`,'DELETE');
  toast('✓ Editor quitado');
  closeOv('ovEditorProp');
  loadEditoresPropina();
};

// ── BIBLIOTECA ────────────────────────────────────
let BIB_CATEGORIAS=[],BIB_CONTENIDO=[],BIB_VISTAS_MAP={},BIB_EDIT_ID=null;
let BIB_CARGOS_CACHE=[]; // cargos únicos derivados de EMPLEADOS
const BIB_SECTORES=['COCINA','SALA','CAVA','ORDENANZA','SEGURIDAD','ADMINISTRACION','GERENCIA'];
const BIB_BUCKET='biblioteca-pdfs';

// Permisos
function esEditorBiblioteca(){return esMaster()||CU?.editor_biblioteca===true;}

// Carga inicial: categorías + contenido + vistas del usuario actual
async function loadBibliotecaData(){
  const cats=await api('biblioteca_categorias?order=orden.asc,nombre.asc')||[];
  BIB_CATEGORIAS=cats;
  // Para el filtro y admin: traer TODO el contenido (filtrado en frontend según rol)
  const cont=await api('biblioteca_contenido?select=*&order=destacado.desc,creado_en.desc')||[];
  BIB_CONTENIDO=cont;
  // Vistas del colaborador vinculado al usuario actual
  BIB_VISTAS_MAP={};
  if(CU?.empleado_id){
    const vistas=await api(`biblioteca_vistas?colaborador_id=eq.${CU.empleado_id}&select=contenido_id,visto_en`)||[];
    vistas.forEach(v=>{BIB_VISTAS_MAP[v.contenido_id]=v.visto_en;});
  }
}

// Vista colaborador
async function initBiblioteca(){
  // Necesitamos EMPLEADOS para conocer sector/cargo/local del usuario actual
  if(!EMPLEADOS.length)await loadEmpleados(false);
  await loadBibliotecaData();
  // Botón admin solo si es editor de biblioteca o master
  document.getElementById('bibBtnAdmin').style.display=esEditorBiblioteca()?'':'none';
  // Poblar filtro de categorías
  const sel=document.getElementById('bibFiltCategoria');
  sel.innerHTML='<option value="">Todas las categorías</option>'+
    BIB_CATEGORIAS.map(c=>`<option value="${c.id}">${esc(c.icono||'📚')} ${esc(c.nombre)}</option>`).join('');
  renderBiblioteca();
}

function obtenerEmpleadoActual(){
  if(!CU?.empleado_id||!EMPLEADOS.length)return null;
  return EMPLEADOS.find(e=>e.id===CU.empleado_id)||null;
}

// Determina si un contenido es visible para el colaborador actual
function contenidoVisibleParaUsuario(c){
  if(!c.activo)return false;
  // Master siempre ve todo; editor de biblioteca también
  if(esEditorBiblioteca())return true;
  // Si no tiene empleado vinculado, solo ve los "para todos"
  const emp=obtenerEmpleadoActual();
  const sectores=c.sectores||[],cargos=c.cargos||[],locales=c.locales||[];
  // Si no hay filtros, lo ven todos
  const sinFiltros=!sectores.length&&!cargos.length&&!locales.length;
  if(sinFiltros)return true;
  if(!emp)return false;
  // Reglas: si hay sectores definidos, el sector del empleado debe estar; ídem cargos/locales
  if(sectores.length&&!sectores.includes(emp.sector))return false;
  if(cargos.length&&!cargos.includes(emp.cargo))return false;
  if(locales.length){
    // Si es multilocal, ve contenido de cualquier local. Sino, debe coincidir su local.
    if(!emp.es_multilocal&&!locales.includes(emp.local))return false;
  }
  return true;
}

function renderBiblioteca(){
  const q=(document.getElementById('bibSearch').value||'').toLowerCase().trim();
  const filtCat=document.getElementById('bibFiltCategoria').value;
  let items=BIB_CONTENIDO.filter(contenidoVisibleParaUsuario);
  if(filtCat)items=items.filter(c=>String(c.categoria_id)===filtCat);
  if(q)items=items.filter(c=>(c.titulo||'').toLowerCase().includes(q)||(c.descripcion||'').toLowerCase().includes(q));
  const cont=document.getElementById('bibContenido');
  if(!items.length){
    cont.innerHTML=`<div class="empty"><div class="icon">📚</div>No hay contenido disponible${q||filtCat?' con esos filtros':''}.</div>`;
    return;
  }
  // Orden: destacados primero, luego por fecha
  items.sort((a,b)=>{
    if(a.destacado!==b.destacado)return b.destacado-a.destacado;
    return new Date(b.creado_en)-new Date(a.creado_en);
  });
  cont.innerHTML=items.map(c=>{
    const cat=BIB_CATEGORIAS.find(x=>x.id===c.categoria_id);
    const visto=BIB_VISTAS_MAP[c.id];
    const tipoIcon={link:'🔗',pdf:'📄',texto:'📝'}[c.tipo]||'📚';
    return `<div class="bib-card${c.destacado?' destacado':''}${visto?' visto':''}" onclick="abrirBibContenido(${c.id})">
      ${c.destacado?'<div class="bib-badge-destacado">⭐ Destacado</div>':''}
      ${visto?'<div class="bib-badge-visto">✓ Visto</div>':''}
      <div class="bib-card-cat">${cat?esc(cat.icono||'📚')+' '+esc(cat.nombre):'Sin categoría'}</div>
      <div class="bib-card-titulo">${tipoIcon} ${esc(c.titulo)}</div>
      ${c.descripcion?`<div class="bib-card-desc">${esc(c.descripcion)}</div>`:''}
    </div>`;
  }).join('');
}
window.renderBiblioteca=renderBiblioteca;

// Abrir contenido en modal lector
window.abrirBibContenido=async function(id){
  const c=BIB_CONTENIDO.find(x=>x.id===id);
  if(!c)return;
  const cat=BIB_CATEGORIAS.find(x=>x.id===c.categoria_id);
  document.getElementById('bibLectorTitle').textContent=c.titulo;
  document.getElementById('bibLectorMeta').textContent=`${cat?cat.icono+' '+cat.nombre+' · ':''}${({link:'Link externo',pdf:'PDF',texto:'Texto'}[c.tipo])||''}`;
  let body='';
  if(c.descripcion)body+=`<p style="font-size:13px;color:var(--gray);margin-bottom:14px">${esc(c.descripcion)}</p>`;
  if(c.tipo==='link'){
    body+=`<a href="${esc(c.url)}" target="_blank" rel="noopener" style="display:block;background:var(--olive);color:var(--white);padding:14px 20px;border-radius:10px;text-align:center;text-decoration:none;font-weight:600">🔗 Abrir link en una nueva pestaña</a>`;
    body+=`<div style="font-size:11px;color:var(--gray);margin-top:8px;word-break:break-all;text-align:center">${esc(c.url)}</div>`;
  }else if(c.tipo==='pdf'){
    body+=`<a href="${esc(c.url)}" target="_blank" rel="noopener" style="display:block;background:var(--rust);color:var(--white);padding:14px 20px;border-radius:10px;text-align:center;text-decoration:none;font-weight:600;margin-bottom:10px">📄 Abrir PDF en una nueva pestaña</a>`;
    body+=`<iframe src="${esc(c.url)}" style="width:100%;height:400px;border:1px solid var(--sand-l);border-radius:8px"></iframe>`;
  }else if(c.tipo==='texto'){
    body+=`<div style="background:var(--cream);border-radius:10px;padding:18px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(c.contenido_texto||'')}</div>`;
  }
  document.getElementById('bibLectorContent').innerHTML=body;
  // Botón visto
  const btnV=document.getElementById('bibBtnVisto');
  if(BIB_VISTAS_MAP[c.id]){
    btnV.textContent='✓ Ya marcado como visto';
    btnV.disabled=true;
    btnV.style.opacity='.6';
  }else{
    btnV.textContent='✓ Marcar como visto';
    btnV.disabled=false;
    btnV.style.opacity='1';
    btnV.dataset.contenidoId=c.id;
  }
  openOv('ovBibLector');
};

window.marcarVisto=async function(){
  const btn=document.getElementById('bibBtnVisto');
  const id=parseInt(btn.dataset.contenidoId);
  if(!id||!CU?.empleado_id){toast('Necesitás un colaborador vinculado para marcar como visto');return;}
  const r=await api('biblioteca_vistas','POST',{contenido_id:id,colaborador_id:CU.empleado_id});
  if(r===null){toast('Error al marcar como visto');return;}
  BIB_VISTAS_MAP[id]=new Date().toISOString();
  toast('✓ Marcado como visto');
  btn.textContent='✓ Ya marcado como visto';
  btn.disabled=true;
  btn.style.opacity='.6';
  renderBiblioteca();
};

// ── BIBLIOTECA: ADMIN ────────────────────────────
async function initBibliotecaAdmin(){
  await loadBibliotecaData();
  await loadEmpleados(false);
  // Construir cache de cargos únicos
  const cargosSet=new Set();
  EMPLEADOS.forEach(e=>{if(e.cargo)cargosSet.add(e.cargo);});
  BIB_CARGOS_CACHE=[...cargosSet].sort();
  // Cargar conteo de vistas
  await loadBibVistasConteo();
  // Botón editores solo master
  document.getElementById('bibBtnEditores').style.display=esMaster()?'':'none';
  // Filtro categorías
  const sel=document.getElementById('bibAdmFiltCategoria');
  sel.innerHTML='<option value="">Todas las categorías</option>'+
    BIB_CATEGORIAS.map(c=>`<option value="${c.id}">${esc(c.icono||'📚')} ${esc(c.nombre)}</option>`).join('');
  renderBibAdmin();
}

let BIB_VISTAS_CONTEO={}; // {contenido_id: count}
async function loadBibVistasConteo(){
  const all=await api('biblioteca_vistas?select=contenido_id')||[];
  BIB_VISTAS_CONTEO={};
  all.forEach(v=>{BIB_VISTAS_CONTEO[v.contenido_id]=(BIB_VISTAS_CONTEO[v.contenido_id]||0)+1;});
}

function renderBibAdmin(){
  const q=(document.getElementById('bibAdmSearch').value||'').toLowerCase().trim();
  const filtCat=document.getElementById('bibAdmFiltCategoria').value;
  const filtEst=document.getElementById('bibAdmFiltEstado').value;
  let items=[...BIB_CONTENIDO];
  if(filtCat)items=items.filter(c=>String(c.categoria_id)===filtCat);
  if(filtEst==='activo')items=items.filter(c=>c.activo);
  if(filtEst==='inactivo')items=items.filter(c=>!c.activo);
  if(q)items=items.filter(c=>(c.titulo||'').toLowerCase().includes(q));
  const tb=document.getElementById('bibAdmTbody');
  if(!items.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px">Sin contenido</td></tr>';return;}
  // Calcular el total de colaboradores que potencialmente verían cada contenido
  const empActivos=EMPLEADOS.filter(e=>e.activo!==false);
  tb.innerHTML=items.map(c=>{
    const cat=BIB_CATEGORIAS.find(x=>x.id===c.categoria_id);
    const filtros=[];
    if(c.sectores?.length)filtros.push(c.sectores.length+' sectores');
    if(c.cargos?.length)filtros.push(c.cargos.length+' cargos');
    if(c.locales?.length)filtros.push(c.locales.length+' locales');
    if(!filtros.length)filtros.push('Todos');
    const tipoLbl={link:'🔗 Link',pdf:'📄 PDF',texto:'📝 Texto'}[c.tipo]||c.tipo;
    const vistas=BIB_VISTAS_CONTEO[c.id]||0;
    // Total potencial
    const alcance=empActivos.filter(e=>{
      const s=c.sectores||[],ca=c.cargos||[],l=c.locales||[];
      if(!s.length&&!ca.length&&!l.length)return true;
      if(s.length&&!s.includes(e.sector))return false;
      if(ca.length&&!ca.includes(e.cargo))return false;
      if(l.length){
        if(!e.es_multilocal&&!l.includes(e.local))return false;
      }
      return true;
    }).length;
    return `<tr>
      <td style="font-weight:600">${c.destacado?'⭐ ':''}${esc(c.titulo)}</td>
      <td style="font-size:12px">${tipoLbl}</td>
      <td style="font-size:12px">${cat?esc(cat.icono+' '+cat.nombre):'—'}</td>
      <td style="font-size:11px;color:var(--gray)">${filtros.join(' · ')}</td>
      <td style="text-align:center;font-size:12px"><a href="#" onclick="verVistas(${c.id});return false" style="color:var(--olive);text-decoration:none;font-weight:600">${vistas} / ${alcance}</a></td>
      <td><span class="badge ${c.activo?'b-aprobado':'b-rechazado'}">${c.activo?'Activo':'Inactivo'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="editBibContenido(${c.id})">✏️</button>
        <button class="abtn ${c.activo?'as':'ao'}" style="padding:4px 8px;font-size:11px" onclick="toggleBibContenido(${c.id},${c.activo})">${c.activo?'⊘':'✓'}</button>
      </td>
    </tr>`;
  }).join('');
}
window.renderBibAdmin=renderBibAdmin;

window.verVistas=async function(id){
  const c=BIB_CONTENIDO.find(x=>x.id===id);if(!c)return;
  document.getElementById('bibVistasTitle').textContent='Vistas: '+c.titulo;
  // Cargar nombres de los que vieron
  const vistas=await api(`biblioteca_vistas?contenido_id=eq.${id}&select=colaborador_id,visto_en&order=visto_en.desc`)||[];
  if(!EMPLEADOS.length)await loadEmpleados(false);
  // Total potencial
  const empActivos=EMPLEADOS.filter(e=>e.activo!==false);
  const alcance=empActivos.filter(e=>{
    const s=c.sectores||[],ca=c.cargos||[],l=c.locales||[];
    if(!s.length&&!ca.length&&!l.length)return true;
    if(s.length&&!s.includes(e.sector))return false;
    if(ca.length&&!ca.includes(e.cargo))return false;
    if(l.length){
      if(!e.es_multilocal&&!l.includes(e.local))return false;
    }
    return true;
  });
  document.getElementById('bibVistasInfo').innerHTML=`<strong>${vistas.length}</strong> de <strong>${alcance.length}</strong> colaboradores marcaron este contenido como visto.`;
  if(!vistas.length){
    document.getElementById('bibVistasList').innerHTML='<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px">Nadie marcó este contenido como visto todavía.</div>';
  }else{
    document.getElementById('bibVistasList').innerHTML=vistas.map(v=>{
      const emp=EMPLEADOS.find(e=>e.id===v.colaborador_id);
      const dt=new Date(v.visto_en);
      const cuando=dt.toLocaleDateString('es-AR')+' '+dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      return `<div style="background:var(--white);border:1px solid var(--sand-l);border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:13px">${esc(emp?`${emp.apellido||''} ${emp.nombre||''}`.trim():'(colaborador eliminado)')}</div>
          <div style="font-size:11px;color:var(--gray)">${esc(emp?.local||'')} · ${esc(emp?.sector||'')}</div>
        </div>
        <div style="font-size:11px;color:var(--gray)">${cuando}</div>
      </div>`;
    }).join('');
  }
  openOv('ovBibVistas');
};

// Abrir modal nuevo / editar contenido
window.openBibContenidoModal=function(){
  BIB_EDIT_ID=null;
  document.getElementById('bibContModalTitle').textContent='Nuevo contenido';
  document.getElementById('bibBtnBorrar').style.display='none';
  document.getElementById('bibTitulo').value='';
  document.getElementById('bibDescripcion').value='';
  document.getElementById('bibUrl').value='';
  document.getElementById('bibTextoBody').value='';
  document.getElementById('bibPdfFile').value='';
  document.getElementById('bibPdfActual').style.display='none';
  document.getElementById('bibDestacado').checked=false;
  document.getElementById('bibTipo').value='link';
  cambiarTipoContenido();
  // Cargar categorías
  document.getElementById('bibCategoria').innerHTML='<option value="">Sin categoría</option>'+
    BIB_CATEGORIAS.map(c=>`<option value="${c.id}">${esc(c.icono||'📚')} ${esc(c.nombre)}</option>`).join('');
  // Sectores
  document.getElementById('bibSectoresCheck').innerHTML=BIB_SECTORES.map(s=>
    `<label><input type="checkbox" class="bib-sec" value="${esc(s)}"> ${esc(s)}</label>`).join('');
  // Cargos
  document.getElementById('bibCargosCheck').innerHTML=BIB_CARGOS_CACHE.map(c=>
    `<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:4px 8px;border:1px solid var(--sand);border-radius:14px;cursor:pointer;background:var(--white)"><input type="checkbox" class="bib-car" value="${esc(c)}" style="width:auto;margin:0"> ${esc(c)}</label>`).join('');
  // Locales (resetear)
  document.querySelectorAll('#bibLocalesCheck input').forEach(cb=>cb.checked=false);
  openOv('ovBibContenido');
};

window.editBibContenido=async function(id){
  const c=BIB_CONTENIDO.find(x=>x.id===id);
  if(!c){toast('No encontrado');return;}
  if(!BIB_CARGOS_CACHE.length){
    if(!EMPLEADOS.length)await loadEmpleados(false);
    BIB_CARGOS_CACHE=[...new Set(EMPLEADOS.map(e=>e.cargo).filter(Boolean))].sort();
  }
  BIB_EDIT_ID=id;
  document.getElementById('bibContModalTitle').textContent='Editar contenido';
  document.getElementById('bibBtnBorrar').style.display='';
  document.getElementById('bibTitulo').value=c.titulo||'';
  document.getElementById('bibDescripcion').value=c.descripcion||'';
  document.getElementById('bibTipo').value=c.tipo;
  document.getElementById('bibUrl').value=c.tipo==='link'?(c.url||''):'';
  document.getElementById('bibTextoBody').value=c.contenido_texto||'';
  document.getElementById('bibPdfFile').value='';
  if(c.tipo==='pdf'&&c.url){
    document.getElementById('bibPdfActual').textContent='✓ PDF actual cargado (subí uno nuevo solo si querés reemplazarlo)';
    document.getElementById('bibPdfActual').style.display='block';
  }else{
    document.getElementById('bibPdfActual').style.display='none';
  }
  document.getElementById('bibDestacado').checked=!!c.destacado;
  cambiarTipoContenido();
  // Categorías
  document.getElementById('bibCategoria').innerHTML='<option value="">Sin categoría</option>'+
    BIB_CATEGORIAS.map(cat=>`<option value="${cat.id}" ${cat.id===c.categoria_id?'selected':''}>${esc(cat.icono||'📚')} ${esc(cat.nombre)}</option>`).join('');
  // Sectores
  document.getElementById('bibSectoresCheck').innerHTML=BIB_SECTORES.map(s=>
    `<label><input type="checkbox" class="bib-sec" value="${esc(s)}" ${(c.sectores||[]).includes(s)?'checked':''}> ${esc(s)}</label>`).join('');
  // Cargos
  document.getElementById('bibCargosCheck').innerHTML=BIB_CARGOS_CACHE.map(ca=>
    `<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:4px 8px;border:1px solid var(--sand);border-radius:14px;cursor:pointer;background:var(--white)"><input type="checkbox" class="bib-car" value="${esc(ca)}" ${(c.cargos||[]).includes(ca)?'checked':''} style="width:auto;margin:0"> ${esc(ca)}</label>`).join('');
  // Locales
  document.querySelectorAll('#bibLocalesCheck input').forEach(cb=>{cb.checked=(c.locales||[]).includes(cb.value);});
  openOv('ovBibContenido');
};

window.cambiarTipoContenido=function(){
  const t=document.getElementById('bibTipo').value;
  document.getElementById('bibCampoLink').style.display=t==='link'?'':'none';
  document.getElementById('bibCampoPdf').style.display=t==='pdf'?'':'none';
  document.getElementById('bibCampoTexto').style.display=t==='texto'?'':'none';
};

// Subida de PDF a Supabase Storage usando REST
async function subirPdfStorage(file){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${Date.now()}_${safe}`;
  const url=`${SU}/storage/v1/object/${BIB_BUCKET}/${path}`;
  const r=await fetch(url,{
    method:'POST',
    headers:{
      'apikey':SK,
      'Authorization':'Bearer '+SK,
      'Content-Type':'application/pdf',
      'x-upsert':'false'
    },
    body:file
  });
  if(!r.ok){const e=await r.text();console.error('Upload error:',e);return null;}
  // URL pública
  return `${SU}/storage/v1/object/public/${BIB_BUCKET}/${path}`;
}

window.guardarBibContenido=async function(){
  const titulo=document.getElementById('bibTitulo').value.trim();
  const tipo=document.getElementById('bibTipo').value;
  if(!titulo){toast('Falta el título');return;}
  const data={
    titulo,
    descripcion:document.getElementById('bibDescripcion').value.trim()||null,
    tipo,
    categoria_id:parseInt(document.getElementById('bibCategoria').value)||null,
    sectores:[...document.querySelectorAll('.bib-sec:checked')].map(c=>c.value),
    cargos:[...document.querySelectorAll('.bib-car:checked')].map(c=>c.value),
    locales:[...document.querySelectorAll('#bibLocalesCheck input:checked')].map(c=>c.value),
    destacado:document.getElementById('bibDestacado').checked,
    actualizado_en:new Date().toISOString(),
    actualizado_por:CU?.id||null
  };
  // Manejo según tipo
  if(tipo==='link'){
    const url=document.getElementById('bibUrl').value.trim();
    if(!url){toast('Falta la URL');return;}
    data.url=url;data.contenido_texto=null;
  }else if(tipo==='texto'){
    const txt=document.getElementById('bibTextoBody').value.trim();
    if(!txt){toast('Falta el contenido del texto');return;}
    data.contenido_texto=txt;data.url=null;
  }else if(tipo==='pdf'){
    const fileInput=document.getElementById('bibPdfFile');
    const file=fileInput.files[0];
    if(file){
      // Validación tamaño 50 MB
      if(file.size>50*1024*1024){toast('El PDF no puede superar 50 MB');return;}
      if(file.type!=='application/pdf'){toast('Solo se permiten PDFs');return;}
      toast('Subiendo PDF...');
      const url=await subirPdfStorage(file);
      if(!url){toast('Error al subir el PDF');return;}
      data.url=url;
    }else if(!BIB_EDIT_ID){
      toast('Subí un archivo PDF');return;
    }else{
      // Editar sin reemplazar PDF: no tocar url
      delete data.url;
    }
    data.contenido_texto=null;
  }
  if(BIB_EDIT_ID){
    const r=await api(`biblioteca_contenido?id=eq.${BIB_EDIT_ID}`,'PATCH',data);
    if(r===null){toast('Error al guardar');return;}
    toast('✓ Contenido actualizado');
  }else{
    data.creado_por=CU?.id||null;
    data.activo=true;
    const r=await api('biblioteca_contenido','POST',data);
    if(!r||!r.length){toast('Error al crear');return;}
    toast('✓ Contenido creado');
  }
  closeOv('ovBibContenido');
  await loadBibliotecaData();
  await loadBibVistasConteo();
  renderBibAdmin();
};

window.toggleBibContenido=async function(id,activo){
  const data={activo:!activo,actualizado_en:new Date().toISOString(),actualizado_por:CU?.id||null};
  const r=await api(`biblioteca_contenido?id=eq.${id}`,'PATCH',data);
  if(r===null){toast('Error');return;}
  toast(activo?'Contenido desactivado':'Contenido activado');
  await loadBibliotecaData();renderBibAdmin();
};

window.borrarBibContenido=async function(){
  if(!BIB_EDIT_ID)return;
  if(!confirm('¿Eliminar este contenido para siempre? Se borrarán también las vistas registradas.'))return;
  await api(`biblioteca_contenido?id=eq.${BIB_EDIT_ID}`,'DELETE');
  toast('✓ Contenido eliminado');
  closeOv('ovBibContenido');
  await loadBibliotecaData();await loadBibVistasConteo();renderBibAdmin();
};

// ── BIBLIOTECA: CATEGORÍAS ────────────────────────
window.openBibCategoriasModal=async function(){
  await loadBibliotecaData();
  renderBibCategorias();
  document.getElementById('bibCatNombre').value='';
  document.getElementById('bibCatIcono').value='';
  openOv('ovBibCategorias');
};

function renderBibCategorias(){
  const cont=document.getElementById('bibCatList');
  if(!BIB_CATEGORIAS.length){cont.innerHTML='<div style="text-align:center;color:var(--gray);font-size:13px;padding:14px">Sin categorías. Creá la primera abajo.</div>';return;}
  cont.innerHTML=BIB_CATEGORIAS.map(c=>{
    const usos=BIB_CONTENIDO.filter(x=>x.categoria_id===c.id).length;
    return `<div style="display:flex;align-items:center;gap:8px;background:var(--white);border:1px solid var(--sand-l);border-radius:8px;padding:8px 12px;margin-bottom:6px">
      <input type="text" value="${esc(c.icono||'📚')}" maxlength="2" id="bcIco_${c.id}" style="width:42px;text-align:center;padding:6px;border:1px solid var(--sand);border-radius:6px;background:var(--cream);font-family:'DM Sans',sans-serif">
      <input type="text" value="${esc(c.nombre)}" id="bcNom_${c.id}" style="flex:1;padding:6px 10px;border:1px solid var(--sand);border-radius:6px;background:var(--cream);font-family:'DM Sans',sans-serif;font-size:13px">
      <span style="font-size:10px;color:var(--gray);white-space:nowrap">${usos} item${usos!==1?'s':''}</span>
      <button class="abtn ao" style="padding:4px 8px;font-size:11px" onclick="guardarBibCategoria(${c.id})">💾</button>
      <button class="bd" onclick="borrarBibCategoria(${c.id})" title="Eliminar">🗑</button>
    </div>`;
  }).join('');
}

window.crearBibCategoria=async function(){
  const nombre=document.getElementById('bibCatNombre').value.trim();
  const icono=document.getElementById('bibCatIcono').value.trim()||'📚';
  if(!nombre){toast('Falta el nombre');return;}
  const r=await api('biblioteca_categorias','POST',{nombre,icono,orden:BIB_CATEGORIAS.length+1,creado_por:CU?.id||null});
  if(!r||!r.length){toast('Error (¿categoría duplicada?)');return;}
  toast('✓ Categoría creada');
  document.getElementById('bibCatNombre').value='';
  document.getElementById('bibCatIcono').value='';
  await loadBibliotecaData();renderBibCategorias();
};

window.guardarBibCategoria=async function(id){
  const nombre=document.getElementById('bcNom_'+id).value.trim();
  const icono=document.getElementById('bcIco_'+id).value.trim()||'📚';
  if(!nombre){toast('Falta el nombre');return;}
  const r=await api(`biblioteca_categorias?id=eq.${id}`,'PATCH',{nombre,icono});
  if(r===null){toast('Error al guardar');return;}
  toast('✓ Categoría actualizada');
  await loadBibliotecaData();renderBibCategorias();
};

window.borrarBibCategoria=async function(id){
  const usos=BIB_CONTENIDO.filter(x=>x.categoria_id===id).length;
  if(usos>0){
    if(!confirm(`Esta categoría tiene ${usos} contenido(s) asignados. Si la eliminás, esos contenidos quedarán "Sin categoría". ¿Continuar?`))return;
  }else{
    if(!confirm('¿Eliminar esta categoría?'))return;
  }
  await api(`biblioteca_categorias?id=eq.${id}`,'DELETE');
  toast('✓ Categoría eliminada');
  await loadBibliotecaData();renderBibCategorias();
};

// ── BIBLIOTECA: EDITORES (solo master) ────────────
async function initBibliotecaEditores(){
  if(!USUARIOS_R.length)USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  renderBibEditores();
}

function renderBibEditores(){
  const tb=document.getElementById('bibEditTbody');
  const editores=USUARIOS_R.filter(u=>u.editor_biblioteca===true);
  if(!editores.length){tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:24px">Sin editores asignados. Master ya tiene acceso por defecto.</td></tr>';return;}
  const PFIL={master:'⭐ Master',editor:'✏️ Editor',usuario:'👤 Usuario'};
  tb.innerHTML=editores.map(u=>`<tr>
    <td style="font-weight:600">${esc(u.nombre)}</td>
    <td style="color:var(--gray)">${esc(u.usuario)}</td>
    <td>${PFIL[u.perfil]||esc(u.perfil)}</td>
    <td><button class="bd" onclick="quitarBibEditor(${u.id})">Quitar</button></td>
  </tr>`).join('');
}

window.openBibEditorModal=function(){
  // Mostrar usuarios que NO sean ya editores ni master
  const disponibles=USUARIOS_R.filter(u=>!u.editor_biblioteca&&u.perfil!=='master'&&u.activo);
  if(!disponibles.length){toast('No hay usuarios disponibles');return;}
  document.getElementById('bibEdUsuario').innerHTML=disponibles.map(u=>
    `<option value="${u.id}">${esc(u.nombre)} (${esc(u.usuario)})</option>`).join('');
  openOv('ovBibEditor');
};

window.guardarBibEditor=async function(){
  const id=parseInt(document.getElementById('bibEdUsuario').value);
  if(!id){toast('Elegí un usuario');return;}
  const r=await api(`roster_usuarios?id=eq.${id}`,'PATCH',{editor_biblioteca:true});
  if(r===null){toast('Error');return;}
  toast('✓ Editor asignado');
  closeOv('ovBibEditor');
  USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  renderBibEditores();
};

window.quitarBibEditor=async function(id){
  if(!confirm('¿Quitar a este usuario como editor de biblioteca?'))return;
  await api(`roster_usuarios?id=eq.${id}`,'PATCH',{editor_biblioteca:false});
  toast('✓ Editor quitado');
  USUARIOS_R=await api('roster_usuarios?activo=eq.true&order=nombre.asc')||[];
  renderBibEditores();
};

// ── INIT ──────────────────────────────────────────
// ── RELOJ EN HEADERS ──────────────────────────────
const DIAS_SHORT=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES_SHORT=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtClockNow(){
  const d=new Date();
  const dn=DIAS_SHORT[d.getDay()];
  const dia=d.getDate();
  const mes=MESES_SHORT[d.getMonth()];
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return `${dn}. ${dia} ${mes} · ${hh}:${mm}`;
}
function injectClocks(){
  // En cada app-hdr, asegurar que tenga un span de reloj
  document.querySelectorAll('.app-hdr').forEach(hdr=>{
    if(!hdr.querySelector('.app-clock')){
      const left=hdr.querySelector('div');
      if(left){
        const c=document.createElement('div');
        c.className='app-clock';
        left.appendChild(c);
      }
    }
  });
  // En el dashboard
  if(document.getElementById('vDash')&&!document.getElementById('dashClock')){
    const dashHdr=document.querySelector('#vDash .dash-hdr');
    if(dashHdr){
      const c=document.createElement('div');
      c.id='dashClock';
      c.className='dash-clock';
      dashHdr.appendChild(c);
    }
  }
  updateClocks();
}
function updateClocks(){
  const txt=fmtClockNow();
  document.querySelectorAll('.app-clock').forEach(el=>{el.textContent=txt;});
  const dc=document.getElementById('dashClock');
  if(dc)dc.textContent=txt;
}

checkSession();
injectClocks();
setInterval(updateClocks,60000);
})();
