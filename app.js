/* CMO Registry — Local-first (IndexedDB) — GitHub Pages friendly
   - Patients, Visits, Interventions
   - Export CSV + Backup JSON + Import JSON
   - Modern UI + LDL chart (canvas) no external libs
*/

const APP = {
  schemaVersion: "CMO-REGISTRY-1.0",
  dbName: "cmo_registry_db",
  dbVersion: 1,
  stores: {
    patients: "patients",
    visits: "visits",
    interventions: "interventions",
    meta: "meta",
  },
  conditionList: [
    "PCSK9 / Dislipemia",
    "Riesgo cardiovascular",
    "Cardiopatía isquémica",
    "Insuficiencia cardiaca",
    "Fibrilación auricular",
    "Hipertensión arterial",
    "EPOC / Respiratorio",
    "Diabetes",
    "Otros",
  ],
  interventionCatalog: {
    Capacidad: [
      "Educación sobre enfermedad",
      "Educación sobre tratamiento",
      "Revisión técnica de administración",
      "Simplificación del régimen",
      "Material educativo entregado",
    ],
    Motivación: [
      "Entrevista motivacional",
      "Identificación de barreras",
      "Revisión de creencias/expectativas",
      "Reforzar objetivos terapéuticos",
      "Acuerdo de plan terapéutico",
    ],
    Oportunidad: [
      "Seguimiento telefarmacia",
      "Coordinación con médico",
      "Coordinación con enfermería",
      "Ajuste agenda / circuito",
      "Recordatorio / cita programada",
    ],
  },
  state: {
    db: null,
    patients: [],
    visits: [],
    interventions: [],
    selectedPatientId: null,
    selectedVisitId: null,
  },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeNum(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows, headers) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

// ---------------- IndexedDB ----------------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP.dbName, APP.dbVersion);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      if (!db.objectStoreNames.contains(APP.stores.patients)) {
        const s = db.createObjectStore(APP.stores.patients, { keyPath: "patientId" });
        s.createIndex("condition", "prevalentCondition", { unique: false });
        s.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(APP.stores.visits)) {
        const s = db.createObjectStore(APP.stores.visits, { keyPath: "visitId" });
        s.createIndex("patientId", "patientId", { unique: false });
        s.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(APP.stores.interventions)) {
        const s = db.createObjectStore(APP.stores.interventions, { keyPath: "interventionId" });
        s.createIndex("visitId", "visitId", { unique: false });
        s.createIndex("patientId", "patientId", { unique: false });
        s.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(APP.stores.meta)) {
        db.createObjectStore(APP.stores.meta, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = "readonly") {
  const t = APP.state.db.transaction(storeName, mode);
  return t.objectStore(storeName);
}

async function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, obj) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").put(obj);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetMeta(key) {
  return new Promise((resolve, reject) => {
    const req = tx(APP.stores.meta, "readonly").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function dbSetMeta(key, value) {
  return dbPut(APP.stores.meta, { key, value });
}

// ---------------- Data logic ----------------

function makeVisitId(patientId, dateISO) {
  const rnd = Math.random().toString(16).slice(2, 8);
  return `V-${patientId}-${dateISO}-${rnd}`;
}

function makeInterventionId(visitId, idx) {
  const rnd = Math.random().toString(16).slice(2, 8);
  return `I-${visitId}-${idx}-${rnd}`;
}

function patientLastVisit(patientId) {
  const visits = APP.state.visits.filter(v => v.patientId === patientId);
  visits.sort((a,b) => (a.date > b.date ? -1 : 1));
  return visits[0] || null;
}

function patientInterventions(patientId) {
  return APP.state.interventions.filter(i => i.patientId === patientId);
}

function visitInterventions(visitId) {
  return APP.state.interventions.filter(i => i.visitId === visitId);
}

function fmtDate(d) {
  if (!d) return "—";
  return d;
}

function levelLabel(level) {
  if (!level) return "—";
  const n = Number(level);
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  return String(level);
}

// ---------------- UI: Navigation ----------------

function setView(viewId) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#${viewId}`).classList.remove("hidden");

  $$(".navBtn").forEach(b => b.classList.remove("active"));
  $(`.navBtn[data-view="${viewId}"]`).classList.add("active");

  const titleMap = {
    patientsView: ["Pacientes", "Registro longitudinal con CMO + exportación para investigación"],
    exportsView: ["Exportación", "CSV (Excel) + Backup JSON + restauración"],
    aboutView: ["Ayuda", "Buenas prácticas en entorno hospitalario (local-first, RGPD, backups)"],
  };
  const [t, h] = titleMap[viewId] || ["", ""];
  $("#pageTitle").textContent = t;
  $("#pageHint").textContent = h;

  // show/hide topbar action
  if (viewId !== "patientsView") {
    $("#btnNewPatient").classList.add("hidden");
  } else {
    $("#btnNewPatient").classList.remove("hidden");
  }
}

// ---------------- UI: Patients list ----------------

function fillConditionSelectors() {
  // filter
  const filter = $("#conditionFilter");
  const current = filter.value;
  filter.innerHTML = `<option value="">Todas las patologías</option>` +
    APP.conditionList.map(c => `<option value="${c}">${c}</option>`).join("");
  if (APP.conditionList.includes(current)) filter.value = current;

  // patient modal selector
  const sel = $("#p_condition");
  sel.innerHTML = `<option value="">—</option>` +
    APP.conditionList.map(c => `<option value="${c}">${c}</option>`).join("");
}

function updateStats() {
  const patients = APP.state.patients;
  $("#patientsCount").textContent = String(patients.length);

  const active = patients.filter(p => p.status !== "inactive").length;
  $("#statActive").textContent = String(active);

  const withVisits = patients.filter(p => patientLastVisit(p.patientId)).length;
  $("#statWithVisits").textContent = String(withVisits);

  dbGetMeta("lastBackupAt").then(v => {
    $("#statLastBackup").textContent = v ? String(v) : "—";
  });
}

function matchesSearch(p, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  const last = patientLastVisit(p.patientId);
  const lastLDL = last?.ldl ?? "";
  return [
    p.patientId, p.prevalentCondition, p.sex, p.birthYear, p.notes, p.comorbidities, lastLDL
  ].some(x => String(x ?? "").toLowerCase().includes(s));
}

function matchesCondition(p, cond) {
  if (!cond) return true;
  return p.prevalentCondition === cond;
}

function renderPatientsTable() {
  const tbody = $("#patientsTable tbody");
  tbody.innerHTML = "";

  const q = $("#patientSearch").value.trim();
  const cond = $("#conditionFilter").value;

  const rows = APP.state.patients
    .filter(p => matchesSearch(p, q))
    .filter(p => matchesCondition(p, cond))
    .map(p => {
      const last = patientLastVisit(p.patientId);
      return { p, last };
    });

  for (const {p, last} of rows) {
    const tr = document.createElement("tr");

    const ldl = last?.ldl ?? "—";
    const tgt = last?.ldlTarget ?? "—";
    const lvl = last?.priorityLevel ?? "—";
    const lastDate = last?.date ?? "—";

    tr.innerHTML = `
      <td><span class="link" data-open-patient="${p.patientId}">${p.patientId}</span></td>
      <td>${p.prevalentCondition || "—"}</td>
      <td>${p.sex || "—"}</td>
      <td>${p.birthYear || "—"}</td>
      <td>${fmtDate(lastDate)}</td>
      <td>${levelLabel(lvl)}</td>
      <td>${ldl ?? "—"}</td>
      <td>${tgt ?? "—"}</td>
      <td>${p.status === "inactive" ? "Inactivo" : "Activo"}</td>
    `;
    tbody.appendChild(tr);
  }

  // open patient handlers
  $$('[data-open-patient]').forEach(el => {
    el.addEventListener("click", () => openPatient(el.getAttribute("data-open-patient")));
  });
}

function openPatient(patientId) {
  APP.state.selectedPatientId = patientId;
  $("#patientDetailCard").classList.remove("hidden");
  $("#patientsTable").closest(".card").classList.add("hidden");
  // Keep stats and list visible? We hide table card to focus
  $("#patientDetailTitle").textContent = `Ficha · ${patientId}`;

  const p = APP.state.patients.find(x => x.patientId === patientId);
  if (!p) return;

  $("#d_patientId").textContent = p.patientId;
  $("#d_condition").textContent = p.prevalentCondition || "—";
  $("#d_sex").textContent = p.sex || "—";
  $("#d_birthYear").textContent = p.birthYear || "—";
  $("#d_comorb").textContent = p.comorbidities || "—";
  $("#d_notes").textContent = p.notes || "—";

  // Dashboard mini-cards
  const last = patientLastVisit(patientId);
  $("#d_levelNow").textContent = last?.priorityLevel ? `Nivel ${last.priorityLevel}` : "—";
  $("#d_levelWhy").textContent = last?.priorityJustification || "—";

  const ldlLast = (last?.ldl ?? null);
  $("#d_ldlLast").textContent = ldlLast === null ? "—" : String(ldlLast);
  const goal = last?.ldlTarget ?? null;
  const ach = last?.ldlGoalAchieved;
  $("#d_ldlGoal").textContent = goal === null ? "—" : `Objetivo ${goal} · ${ach === true ? "Cumple" : ach === false ? "No cumple" : "—"}`;

  const ints = patientInterventions(patientId);
  $("#d_intervCount").textContent = String(ints.length);
  const mix = summarizeInterventionsMix(ints);
  $("#d_intervMix").textContent = mix;

  renderVisitsTable(patientId);
  drawLDLChart(patientId);
}

function closePatient() {
  APP.state.selectedPatientId = null;
  $("#patientDetailCard").classList.add("hidden");
  $("#patientsTable").closest(".card").classList.remove("hidden");
}

function summarizeInterventionsMix(ints) {
  if (!ints.length) return "—";
  const byStatus = { accepted: 0, rejected: 0, pending: 0 };
  for (const i of ints) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  return `✅${byStatus.accepted||0} · ❌${byStatus.rejected||0} · ⏳${byStatus.pending||0}`;
}

// ---------------- UI: Visits ----------------

function renderVisitsTable(patientId) {
  const tbody = $("#visitsTable tbody");
  tbody.innerHTML = "";

  const visits = APP.state.visits.filter(v => v.patientId === patientId);
  visits.sort((a,b) => (a.date > b.date ? -1 : 1));

  for (const v of visits) {
    const tr = document.createElement("tr");
    const goal = v.ldlGoalAchieved;
    const goalTxt = goal === true ? "Sí" : goal === false ? "No" : "—";

    tr.innerHTML = `
      <td>${v.date || "—"}</td>
      <td>${v.ldl ?? "—"}</td>
      <td>${v.ldlTarget ?? "—"}</td>
      <td>${goalTxt}</td>
      <td title="${(v.treatment||"").slice(0,120)}">${(v.treatment || "—").slice(0,42)}${(v.treatment||"").length>42 ? "…" : ""}</td>
      <td>${v.adherence || "—"}</td>
      <td>${v.ram || "—"}</td>
      <td>${v.priorityLevel ? `Nivel ${v.priorityLevel}` : "—"}</td>
      <td>
        <span class="link" data-open-visit="${v.visitId}">Ver</span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  $$('[data-open-visit]').forEach(el => {
    el.addEventListener("click", () => openVisitDetail(el.getAttribute("data-open-visit")));
  });
}

function openVisitDetail(visitId) {
  APP.state.selectedVisitId = visitId;
  const v = APP.state.visits.find(x => x.visitId === visitId);
  if (!v) return;

  $("#vd_header").textContent = `${v.patientId} · ${v.date}`;

  const kv = $("#vd_kv");
  kv.innerHTML = `
    <div class="k">LDL</div><div class="v">${v.ldl ?? "—"}</div>
    <div class="k">Objetivo LDL</div><div class="v">${v.ldlTarget ?? "—"}</div>
    <div class="k">¿Cumple objetivo?</div><div class="v">${v.ldlGoalAchieved === true ? "Sí" : v.ldlGoalAchieved === false ? "No" : "—"}</div>
    <div class="k">Tratamiento</div><div class="v">${v.treatment || "—"}</div>
    <div class="k">Adherencia</div><div class="v">${v.adherence || "—"}</div>
    <div class="k">RAM</div><div class="v">${v.ram || "—"}</div>
    <div class="k">Nivel</div><div class="v">${v.priorityLevel ? `Nivel ${v.priorityLevel}` : "—"}</div>
    <div class="k">Justificación</div><div class="v">${v.priorityJustification || "—"}</div>
    <div class="k">OFT</div><div class="v">${v.oftObjectives || "—"}</div>
    <div class="k">Plan seguimiento</div><div class="v">${v.followUpPlan || "—"}</div>
  `;

  const ints = visitInterventions(visitId);
  const cont = $("#vd_interventions");
  cont.innerHTML = ints.length ? "" : `<span class="smallMuted">Sin intervenciones registradas.</span>`;
  for (const i of ints) {
    const chip = document.createElement("span");
    chip.className = "chip " + (i.status === "accepted" ? "ok" : i.status === "rejected" ? "no" : "wait");
    const st = i.status === "accepted" ? "✅" : i.status === "rejected" ? "❌" : "⏳";
    chip.textContent = `${st} ${i.cmoDimension} · ${i.description}`;
    cont.appendChild(chip);
  }

  openModal("modalVisitDetail");
}

// ---------------- LDL Chart (canvas, simple) ----------------

function drawLDLChart(patientId) {
  const canvas = $("#ldlChart");
  const ctx = canvas.getContext("2d");

  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const visits = APP.state.visits
    .filter(v => v.patientId === patientId && v.ldl !== null && v.ldl !== undefined)
    .slice()
    .sort((a,b) => (a.date > b.date ? 1 : -1));

  // background grid
  const W = canvas.width, H = canvas.height;
  ctx.globalAlpha = 1;

  // panel background
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0,0,W,H);

  // axes padding
  const padL = 50, padR = 18, padT = 14, padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i=0;i<=5;i++){
    const y = padT + (ih*i/5);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W-padR, y);
    ctx.stroke();
  }

  // no data
  if (visits.length < 2) {
    ctx.fillStyle = "rgba(231,238,252,0.75)";
    ctx.font = "14px system-ui";
    ctx.fillText(visits.length === 1 ? "1 punto registrado (añade otra visita para ver tendencia)" : "Sin LDL longitudinal aún", padL, padT+22);
    // draw single point if exists
    if (visits.length === 1) {
      const y = padT + ih/2;
      ctx.fillRect(padL+iw/2 - 2, y - 2, 4, 4);
    }
    return;
  }

  const values = visits.map(v => Number(v.ldl)).filter(n => Number.isFinite(n));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(10, maxV - minV);

  const yMin = Math.max(0, minV - range*0.15);
  const yMax = maxV + range*0.15;

  // y labels
  ctx.fillStyle = "rgba(231,238,252,0.70)";
  ctx.font = "12px system-ui";
  for (let i=0;i<=5;i++){
    const y = padT + (ih*i/5);
    const val = (yMax - (yMax-yMin)*i/5);
    ctx.fillText(String(Math.round(val)), 8, y+4);
  }

  // x positions
  const n = visits.length;
  const points = visits.map((v, idx) => {
    const x = padL + (iw*idx/(n-1));
    const val = Number(v.ldl);
    const y = padT + (ih*(1 - (val - yMin)/(yMax - yMin)));
    return { x, y, date: v.date, ldl: val };
  });

  // line
  ctx.strokeStyle = "rgba(122,162,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(88,211,162,0.95)";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI*2);
    ctx.fill();
  }

  // x labels (first, mid, last)
  const idxs = [0, Math.floor((n-1)/2), n-1].filter((v,i,a)=>a.indexOf(v)===i);
  ctx.fillStyle = "rgba(231,238,252,0.65)";
  ctx.font = "11px system-ui";
  for (const idx of idxs) {
    const p = points[idx];
    const label = p.date;
    ctx.fillText(label, Math.max(padL, Math.min(p.x-28, W-padR-70)), H-10);
  }
}

// ---------------- Modal helpers ----------------

function openModal(id) {
  $(`#${id}`).classList.remove("hidden");
}
function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
}

// close by data-close
function bindModalClose() {
  $$("[data-close]").forEach(el => {
    el.addEventListener("click", () => closeModal(el.getAttribute("data-close")));
  });
}

// ---------------- Create patient ----------------

function resetPatientForm() {
  $("#p_patientId").value = "";
  $("#p_condition").value = "";
  $("#p_sex").value = "";
  $("#p_birthYear").value = "";
  $("#p_comorb").value = "";
  $("#p_notes").value = "";
  $("#p_status").value = "active";
}

async function savePatient() {
  const patientId = $("#p_patientId").value.trim();
  const prevalentCondition = $("#p_condition").value.trim();
  if (!patientId) return toast("ID pseudónimo obligatorio.");
  if (!prevalentCondition) return toast("Patología prevalente obligatoria.");

  // basic validation: avoid spaces
  if (/\s/.test(patientId)) return toast("El ID no debe contener espacios.");

  const birthYear = $("#p_birthYear").value.trim();
  const by = birthYear ? Number(birthYear) : null;
  if (birthYear && (!Number.isFinite(by) || by < 1900 || by > new Date().getFullYear())) {
    return toast("Año de nacimiento inválido.");
  }

  const p = {
    patientId,
    prevalentCondition,
    sex: $("#p_sex").value || null,
    birthYear: by,
    comorbidities: ($("#p_comorb").value || "").trim() || null,
    notes: ($("#p_notes").value || "").trim() || null,
    status: $("#p_status").value || "active",
    createdAt: new Date().toISOString(),
    schemaVersion: APP.schemaVersion,
  };

  // ensure unique id
  const exists = APP.state.patients.some(x => x.patientId === patientId);
  if (exists) return toast("Ese ID ya existe.");

  await dbPut(APP.stores.patients, p);
  APP.state.patients.push(p);

  fillConditionSelectors();
  updateStats();
  renderPatientsTable();
  closeModal("modalPatient");
  toast("Paciente guardado.");
}

// ---------------- Create visit + interventions ----------------

function buildInterventionsPicker() {
  const container = $("#interventionsPicker");
  container.innerHTML = "";

  for (const [dim, items] of Object.entries(APP.interventionCatalog)) {
    const title = document.createElement("div");
    title.className = "intervGroupTitle";
    title.textContent = dim;
    container.appendChild(title);

    for (const desc of items) {
      const row = document.createElement("div");
      row.className = "intervRow";
      row.innerHTML = `
        <div class="smallMuted">${desc}</div>
        <select class="select" data-int-status>
          <option value="">—</option>
          <option value="accepted">accepted</option>
          <option value="pending">pending</option>
          <option value="rejected">rejected</option>
        </select>
        <input class="input" data-int-note placeholder="Notas (opcional)" />
      `;
      row.dataset.dim = dim;
      row.dataset.desc = desc;
      container.appendChild(row);
    }
  }
}

function resetVisitForm() {
  $("#v_date").value = todayISO();
  $("#v_ldl").value = "";
  $("#v_ldlTarget").value = "";
  $("#v_goalAch").value = "";
  $("#v_treatment").value = "";
  $("#v_adherence").value = "";
  $("#v_ram").value = "";
  $("#v_level").value = "";
  $("#v_levelWhy").value = "";
  $("#v_oft").value = "";
  $("#v_follow").value = "";
  $("#v_hcText").value = "";
  buildInterventionsPicker();
}

function generateHCText(patient, visit, interventions) {
  const lines = [];
  lines.push(`Paciente ${patient.patientId} · Patología prevalente: ${patient.prevalentCondition || "—"}`);
  lines.push(`Fecha visita: ${visit.date || "—"}`);
  lines.push(`LDL: ${visit.ldl ?? "—"} mg/dL · Objetivo: ${visit.ldlTarget ?? "—"} mg/dL · Cumple: ${
    visit.ldlGoalAchieved === true ? "Sí" : visit.ldlGoalAchieved === false ? "No" : "—"
  }`);
  lines.push(`Tratamiento: ${visit.treatment || "—"}`);
  lines.push(`Adherencia: ${visit.adherence || "—"} · RAM: ${visit.ram || "—"}`);
  lines.push(`Nivel/Prioridad: ${visit.priorityLevel || "—"} · Justificación: ${visit.priorityJustification || "—"}`);
  if (visit.oftObjectives) lines.push(`OFT: ${visit.oftObjectives}`);
  if (visit.followUpPlan) lines.push(`Plan seguimiento: ${visit.followUpPlan}`);

  if (interventions.length) {
    lines.push(`Intervenciones CMO:`);
    for (const i of interventions) {
      const st = i.status === "accepted" ? "accepted" : i.status === "rejected" ? "rejected" : "pending";
      lines.push(`- ${i.cmoDimension}: ${i.description} [${st}]${i.outcomeNotes ? " — " + i.outcomeNotes : ""}`);
    }
  } else {
    lines.push(`Intervenciones CMO: —`);
  }
  return lines.join("\n");
}

function collectInterventionsFromPicker(patientId, visitId) {
  const rows = Array.from($("#interventionsPicker").querySelectorAll(".intervRow"));
  const picked = [];
  let idx = 0;
  for (const row of rows) {
    const status = row.querySelector("[data-int-status]").value;
    const note = row.querySelector("[data-int-note]").value.trim();
    if (!status) continue;
    picked.push({
      interventionId: makeInterventionId(visitId, idx++),
      patientId,
      visitId,
      cmoDimension: row.dataset.dim,
      type: "CMO",
      description: row.dataset.desc,
      status,
      outcomeNotes: note || null,
      createdAt: new Date().toISOString(),
      schemaVersion: APP.schemaVersion,
    });
  }
  return picked;
}

async function saveVisit() {
  const patientId = APP.state.selectedPatientId;
  if (!patientId) return toast("Selecciona un paciente.");

  const date = $("#v_date").value;
  if (!date) return toast("Fecha obligatoria.");

  const priorityLevel = $("#v_level").value;
  if (!priorityLevel) return toast("Nivel/Prioridad obligatorio (1/2/3).");

  const ldl = safeNum($("#v_ldl").value);
  const ldlTarget = safeNum($("#v_ldlTarget").value);

  let ldlGoalAchieved = $("#v_goalAch").value;
  ldlGoalAchieved = ldlGoalAchieved === "true" ? true : ldlGoalAchieved === "false" ? false : null;

  const visit = {
    visitId: makeVisitId(patientId, date),
    patientId,
    date,
    ldl,
    ldlTarget,
    ldlGoalAchieved,
    treatment: ($("#v_treatment").value || "").trim() || null,
    adherence: ($("#v_adherence").value || "").trim() || null,
    ram: ($("#v_ram").value || "").trim() || null,
    cmoScore: null, // preparado para integrar score completo
    priorityLevel: Number(priorityLevel),
    priorityJustification: ($("#v_levelWhy").value || "").trim() || null,
    oftObjectives: ($("#v_oft").value || "").trim() || null,
    followUpPlan: ($("#v_follow").value || "").trim() || null,
    nextVisitSuggested: null, // se puede auto-proponer según nivel
    createdAt: new Date().toISOString(),
    schemaVersion: APP.schemaVersion,
  };

  // interventions
  const interventions = collectInterventionsFromPicker(patientId, visit.visitId);

  await dbPut(APP.stores.visits, visit);
  APP.state.visits.push(visit);

  for (const i of interventions) {
    await dbPut(APP.stores.interventions, i);
    APP.state.interventions.push(i);
  }

  // Refresh patient view
  closeModal("modalVisit");
  openPatient(patientId);
  updateStats();
  toast("Visita guardada.");
}

// delete visit (+ interventions)
async function deleteSelectedVisit() {
  const visitId = APP.state.selectedVisitId;
  if (!visitId) return;

  const v = APP.state.visits.find(x => x.visitId === visitId);
  if (!v) return;

  if (!confirm("¿Eliminar esta visita y sus intervenciones?")) return;

  // delete interventions
  const ints = visitInterventions(visitId);
  for (const i of ints) {
    await dbDelete(APP.stores.interventions, i.interventionId);
  }
  APP.state.interventions = APP.state.interventions.filter(i => i.visitId !== visitId);

  // delete visit
  await dbDelete(APP.stores.visits, visitId);
  APP.state.visits = APP.state.visits.filter(x => x.visitId !== visitId);

  closeModal("modalVisitDetail");
  toast("Visita eliminada.");
  openPatient(v.patientId);
  updateStats();
}

// ---------------- Export / Backup ----------------

function patientsForCSV() {
  return APP.state.patients.map(p => ({
    patientId: p.patientId,
    prevalentCondition: p.prevalentCondition ?? "",
    sex: p.sex ?? "",
    birthYear: p.birthYear ?? "",
    comorbidities: p.comorbidities ?? "",
    notes: p.notes ?? "",
    status: p.status ?? "",
    createdAt: p.createdAt ?? "",
    schemaVersion: p.schemaVersion ?? "",
  }));
}

function visitsForCSV() {
  return APP.state.visits.map(v => ({
    visitId: v.visitId,
    patientId: v.patientId,
    date: v.date ?? "",
    ldl: v.ldl ?? "",
    ldlTarget: v.ldlTarget ?? "",
    ldlGoalAchieved: v.ldlGoalAchieved === true ? "true" : v.ldlGoalAchieved === false ? "false" : "",
    treatment: v.treatment ?? "",
    adherence: v.adherence ?? "",
    ram: v.ram ?? "",
    cmoScore: v.cmoScore ?? "",
    priorityLevel: v.priorityLevel ?? "",
    priorityJustification: v.priorityJustification ?? "",
    oftObjectives: v.oftObjectives ?? "",
    followUpPlan: v.followUpPlan ?? "",
    createdAt: v.createdAt ?? "",
    schemaVersion: v.schemaVersion ?? "",
  }));
}

function interventionsForCSV() {
  return APP.state.interventions.map(i => ({
    interventionId: i.interventionId,
    patientId: i.patientId,
    visitId: i.visitId,
    type: i.type ?? "",
    cmoDimension: i.cmoDimension ?? "",
    description: i.description ?? "",
    status: i.status ?? "",
    outcomeNotes: i.outcomeNotes ?? "",
    createdAt: i.createdAt ?? "",
    schemaVersion: i.schemaVersion ?? "",
  }));
}

async function exportPatientsCSV() {
  const rows = patientsForCSV();
  const headers = Object.keys(rows[0] || {
    patientId:"", prevalentCondition:"", sex:"", birthYear:"", comorbidities:"", notes:"", status:"", createdAt:"", schemaVersion:""
  });
  downloadText("patients.csv", toCSV(rows, headers), "text/csv;charset=utf-8");
  toast("patients.csv exportado.");
}

async function exportVisitsCSV() {
  const rows = visitsForCSV();
  const headers = Object.keys(rows[0] || {
    visitId:"", patientId:"", date:"", ldl:"", ldlTarget:"", ldlGoalAchieved:"", treatment:"", adherence:"", ram:"",
    cmoScore:"", priorityLevel:"", priorityJustification:"", oftObjectives:"", followUpPlan:"", createdAt:"", schemaVersion:""
  });
  downloadText("visits.csv", toCSV(rows, headers), "text/csv;charset=utf-8");
  toast("visits.csv exportado.");
}

async function exportInterventionsCSV() {
  const rows = interventionsForCSV();
  const headers = Object.keys(rows[0] || {
    interventionId:"", patientId:"", visitId:"", type:"", cmoDimension:"", description:"", status:"", outcomeNotes:"", createdAt:"", schemaVersion:""
  });
  downloadText("interventions.csv", toCSV(rows, headers), "text/csv;charset=utf-8");
  toast("interventions.csv exportado.");
}

async function backupJSON() {
  const payload = {
    schemaVersion: APP.schemaVersion,
    exportedAt: new Date().toISOString(),
    patients: APP.state.patients,
    visits: APP.state.visits,
    interventions: APP.state.interventions,
  };
  const txt = JSON.stringify(payload, null, 2);
  downloadText(`backup_${new Date().toISOString().slice(0,10)}.json`, txt, "application/json;charset=utf-8");
  const when = new Date().toISOString();
  await dbSetMeta("lastBackupAt", when);
  updateStats();
  toast("Backup JSON exportado.");
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (!payload || !payload.patients || !payload.visits || !payload.interventions) {
      return toast("Backup inválido (faltan secciones).");
    }

    // Basic schema guard
    if (payload.schemaVersion && payload.schemaVersion !== APP.schemaVersion) {
      // No bloqueamos: pero avisamos
      toast("Aviso: versión de esquema distinta. Se importará igualmente.");
    }

    if (!confirm("Esto mezclará (o sobrescribirá por ID) los datos actuales. ¿Continuar?")) return;

    // Upsert all
    for (const p of payload.patients) await dbPut(APP.stores.patients, p);
    for (const v of payload.visits) await dbPut(APP.stores.visits, v);
    for (const i of payload.interventions) await dbPut(APP.stores.interventions, i);

    toast("Importado. Recargando datos…");
    await loadAll();
    fillConditionSelectors();
    updateStats();
    renderPatientsTable();
  } catch (e) {
    console.error(e);
    toast("Error importando JSON.");
  }
}

// ---------------- UI: Visit modal HC ----------------

function generateHCFromForm() {
  const patientId = APP.state.selectedPatientId;
  if (!patientId) return toast("Selecciona un paciente.");
  const patient = APP.state.patients.find(p => p.patientId === patientId);
  if (!patient) return toast("Paciente no encontrado.");

  const visit = {
    date: $("#v_date").value || "—",
    ldl: safeNum($("#v_ldl").value),
    ldlTarget: safeNum($("#v_ldlTarget").value),
    ldlGoalAchieved: $("#v_goalAch").value === "true" ? true : $("#v_goalAch").value === "false" ? false : null,
    treatment: ($("#v_treatment").value || "").trim() || null,
    adherence: ($("#v_adherence").value || "").trim() || null,
    ram: ($("#v_ram").value || "").trim() || null,
    priorityLevel: $("#v_level").value ? Number($("#v_level").value) : null,
    priorityJustification: ($("#v_levelWhy").value || "").trim() || null,
    oftObjectives: ($("#v_oft").value || "").trim() || null,
    followUpPlan: ($("#v_follow").value || "").trim() || null,
  };

  // temp visitId for interventions preview
  const tempVisitId = `TEMP-${patientId}-${visit.date}`;
  const interventions = collectInterventionsFromPicker(patientId, tempVisitId).map(i => ({
    ...i,
    visitId: tempVisitId
  }));

  const text = generateHCText(patient, visit, interventions);
  $("#v_hcText").value = text;
  toast("Texto HC generado.");
}

async function copyHC() {
  const txt = $("#v_hcText").value || "";
  if (!txt) return toast("No hay texto para copiar.");
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copiado al portapapeles.");
  } catch {
    toast("No se pudo copiar (restricción del navegador).");
  }
}

// ---------------- Load ----------------

async function loadAll() {
  APP.state.patients = await dbGetAll(APP.stores.patients);
  APP.state.visits = await dbGetAll(APP.stores.visits);
  APP.state.interventions = await dbGetAll(APP.stores.interventions);
}

// ---------------- Bindings ----------------

function bindNav() {
  $$(".navBtn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
}

function bindPatientsUI() {
  $("#btnNewPatient").addEventListener("click", () => {
    resetPatientForm();
    openModal("modalPatient");
  });

  $("#btnSavePatient").addEventListener("click", savePatient);

  $("#patientSearch").addEventListener("input", renderPatientsTable);
  $("#conditionFilter").addEventListener("change", renderPatientsTable);

  $("#btnBackToList").addEventListener("click", closePatient);

  $("#btnNewVisit").addEventListener("click", () => {
    if (!APP.state.selectedPatientId) return toast("Selecciona un paciente.");
    resetVisitForm();
    $("#visitForPatient").textContent = `Paciente: ${APP.state.selectedPatientId}`;
    openModal("modalVisit");
  });

  $("#btnSaveVisit").addEventListener("click", saveVisit);

  $("#btnGenerateHC").addEventListener("click", generateHCFromForm);
  $("#btnCopyHC").addEventListener("click", copyHC);
}

function bindExportUI() {
  $("#btnExportPatientsCSV").addEventListener("click", exportPatientsCSV);
  $("#btnExportVisitsCSV").addEventListener("click", exportVisitsCSV);
  $("#btnExportInterventionsCSV").addEventListener("click", exportInterventionsCSV);
  $("#btnBackupJSON").addEventListener("click", backupJSON);

  $("#btnQuickBackup").addEventListener("click", backupJSON);

  $("#fileImportJSON").addEventListener("change", (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    importJSON(f);
    ev.target.value = "";
  });
}

function bindVisitDetailUI() {
  $("#btnDeleteVisit").addEventListener("click", deleteSelectedVisit);
}

// ---------------- Init ----------------

async function init() {
  APP.state.db = await openDB();
  await loadAll();

  fillConditionSelectors();
  updateStats();
  renderPatientsTable();

  bindNav();
  bindModalClose();
  bindPatientsUI();
  bindExportUI();
  bindVisitDetailUI();

  // Default view
  setView("patientsView");

  // Fill patient condition filter
  toast("Listo. Datos en local (IndexedDB).");
}

init().catch((e) => {
  console.error(e);
  alert("Error inicializando la app. Mira la consola del navegador.");
});
