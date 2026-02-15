/* CMO Registry — Local-first (IndexedDB) — GitHub Pages friendly
   - Patients, Visits, Interventions
   - Stratification variables per visit (prefill from last visit)
   - Cutoffs fixed: >=23 => Level 1, >=17 => Level 2, else Level 3
   - Overrides: Pregnancy (Prioridad 1) => Level 1 regardless of score
   - Hospital drugs list (PCSK9)
   - Export CSV + Backup JSON + Import JSON
   - Modern UI + LDL chart (canvas) no external libs
*/

const APP = {
  schemaVersion: "CMO-REGISTRY-1.2",
  dbName: "cmo_registry_db",
  dbVersion: 1,
  stores: {
    patients: "patients",
    visits: "visits",
    interventions: "interventions",
    meta: "meta",
  },

  // Patologías prevalentes (editable)
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

  // Fármacos hospitalarios (PCSK9)
  hospitalDrugs: [
    "—",
    "Alirocumab 75 mg",
    "Alirocumab 150 mg",
    "Evolocumab 140 mg",
    "Inclisiran 284 mg",
  ],

  // Cortes fijos para nivel/prioridad
  cutoffs: {
    level1: 23,
    level2: 17,
  },

  // ===== Estratificación: variables + puntos (según tu copia-pega) =====
  stratificationModel: [
    // ========= VARIABLES DEMOGRÁFICAS =========
    {
      id: "age_group",
      label: "Edad",
      type: "choice",
      options: [
        { value: "lt18", label: "Edad <18 años (usar modelo pediátrico)", points: 0 },
        { value: "19_49", label: "19–49 años", points: 0 },
        { value: "50_69", label: "50–69 años", points: 2 },
        { value: "ge70", label: "≥70 años", points: 3 },
      ],
    },

    // Embarazo: Prioridad 1 (override a Nivel 1)
    {
      id: "pregnancy_priority1",
      label: "Embarazo (Prioridad 1)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí (Prioridad 1)", points: 0 },
      ],
      overrides: { ifValue: "yes", level: 1 },
    },

    {
      id: "bmi_group",
      label: "Peso/Estado nutricional (IMC)",
      type: "choice",
      options: [
        { value: "malnutrition", label: "Desnutrición (IMC <18,4)", points: 1 },
        { value: "normal", label: "Normal (18,5–24,9)", points: 0 },
        { value: "overweight", label: "Sobrepeso (25–30)", points: 1 },
        { value: "obesity", label: "Obesidad (>30 y <40)", points: 2 },
        { value: "severe_obesity", label: "Obesidad grave (>40)", points: 3 },
      ],
    },

    {
      id: "female_highrisk_cv_pathology",
      label: "Sexo: mujer con FA / HT pulmonar (<45 o edad fértil) / cardiopatía isquémica",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    // ========= VARIABLES CLÍNICAS =========
    {
      id: "high_risk_base_cv_pathology",
      label:
        "Patología CV de base de mayor riesgo (FA / HT pulmonar / IC / prevención secundaria ECV aterosclerótica / SCA / trasplante cardiaco)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "cv_comorbidity_at_least_one",
      label:
        "Comorbilidad cardiovascular: ≥1 patología CV adicional (amiloidosis, CI/EAC/IAM previo, valvulopatía, EAP, FA, HT pulmonar, ictus, IC)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 2 },
      ],
    },

    {
      id: "combo_ic_ci",
      label: "Combinación: insuficiencia cardiaca + cardiopatía isquémica",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 3 },
      ],
    },

    {
      id: "combo_ic_fa",
      label: "Combinación: insuficiencia cardiaca + fibrilación auricular",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 3 },
      ],
    },

    {
      id: "noncv_comorbidity_at_least_one",
      label:
        "Comorbilidad NO cardiovascular: ≥1 (anemia, SAOS, inflamatorias/linfopenia, EPOC, VIH, cáncer activo, ERC TFGe<60, DM1/DM2)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "ldl_above_target",
      label: "Dislipemia: LDL por encima de objetivos (según riesgo)",
      type: "choice",
      options: [
        { value: "no", label: "No (en objetivo)", points: 0 },
        { value: "yes", label: "Sí (por encima de objetivo)", points: 2 },
      ],
    },

    {
      id: "lvef_lt40",
      label: "Gravedad: FEVI <40%",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "venous_thromboembolism",
      label: "Gravedad: tromboembolismo venoso",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "hypertension",
      label: "Hipertensión arterial: PAS ≥140 / PAD ≥90 o en tratamiento antihipertensivo por HTA",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 2 },
      ],
    },

    {
      id: "utilization_high",
      label:
        "Ingresos/urgencias último año por patología: ≥2 hospitalizaciones y/o ≥3 urgencias relacionadas",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 2 },
      ],
    },

    {
      id: "first_year_post_coronary_event",
      label: "Primer año tras evento coronario/revascularización (≤12 meses)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 2 },
      ],
    },

    // ========= VARIABLES FARMACOTERAPÉUTICAS =========
    {
      id: "significant_med_changes",
      label: "Cambios significativos en el régimen regular desde la última visita de AF",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "complex_regimen",
      label: "Complejidad del régimen: ≥1 medicamento con pautas complejas (p.ej. MRCI elevado)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 1 },
      ],
    },

    {
      id: "high_alert_meds_ismp",
      label: "Medicamentos de alto riesgo (ISMP España)",
      type: "choice",
      options: [
        { value: "no", label: "No", points: 0 },
        { value: "yes", label: "Sí", points: 4 },
      ],
    },

    {
      id: "pharmaco_goals_met",
      label: "Objetivos farmacoterapéuticos alcanzados (incluye comorbilidades)",
      type: "choice",
      options: [
        { value: "no", label: "No (no alcanzados / o sin objetivos previos)", points: 2 },
        { value: "yes", label: "Sí (alcanzados)", points: 0 },
      ],
    },

    {
      id: "polypharmacy_level",
      label: "Polimedicación (principios activos crónicos concurrentes)",
      type: "choice",
      options: [
        { value: "lt7", label: "<7", points: 0 },
        { value: "7_10", label: "7–10", points: 1 },
        { value: "ge10", label: "≥10", points: 2 },
      ],
    },

    {
      id: "adherence_status",
      label: "Sospecha o falta de adherencia",
      type: "choice",
      options: [
        { value: "adherent", label: "Adherente", points: 0 },
        { value: "risk", label: "Riesgo de falta de adherencia/persistencia subóptima", points: 1 },
        { value: "nonadherent", label: "Falta de adherencia", points: 2 },
      ],
    },

    // ========= VARIABLES SOCIOSANITARIAS =========
    {
      id: "physical_activity",
      label: "Actividad física",
      type: "choice",
      options: [
        { value: "normal", label: "No (actividad habitual)", points: 0 },
        { value: "sedentary", label: "Sedentario", points: 1 },
        { value: "elite", label: "Intensa (deportista élite)", points: 1 },
      ],
    },

    {
      id: "tobacco",
      label: "Tabaco",
      type: "choice",
      options: [
        { value: "no", label: "No fumador / exfumador >5 años", points: 0 },
        { value: "ex_lt5y", label: "Exfumador en últimos 5 años", points: 1 },
        { value: "current", label: "Fumador activo", points: 2 },
      ],
    },
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

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
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
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
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

// ---------------- IDs ----------------

function makeVisitId(patientId, dateISO) {
  const rnd = Math.random().toString(16).slice(2, 8);
  return `V-${patientId}-${dateISO}-${rnd}`;
}

function makeInterventionId(visitId, idx) {
  const rnd = Math.random().toString(16).slice(2, 8);
  return `I-${visitId}-${idx}-${rnd}`;
}

// ---------------- Core queries ----------------

function patientLastVisit(patientId) {
  const visits = APP.state.visits.filter((v) => v.patientId === patientId);
  visits.sort((a, b) => (a.date > b.date ? -1 : 1));
  return visits[0] || null;
}

function visitInterventions(visitId) {
  return APP.state.interventions.filter((i) => i.visitId === visitId);
}

function fmtDate(d) {
  if (!d) return "—";
  return d;
}

function levelFromScore(score) {
  const s = Number(score || 0);
  if (s >= APP.cutoffs.level1) return 1;
  if (s >= APP.cutoffs.level2) return 2;
  return 3;
}

function levelFromScoreWithOverrides(score, selections) {
  // Overrides (ej: embarazo prioridad 1)
  for (const v of APP.stratificationModel) {
    if (!v.overrides) continue;
    const chosen = selections?.[v.id];
    if (chosen === undefined) continue;
    if (String(chosen) === String(v.overrides.ifValue)) {
      return v.overrides.level; // e.g., 1
    }
  }
  return levelFromScore(score);
}

// ---------------- UI: Navigation ----------------

function setView(viewId) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#${viewId}`).classList.remove("hidden");

  $$(".navBtn").forEach((b) => b.classList.remove("active"));
  $(`.navBtn[data-view="${viewId}"]`).classList.add("active");

  const titleMap = {
    patientsView: ["Pacientes", "Registro longitudinal con CMO + exportación para investigación"],
    dashboardView: ["Dashboard", "Indicadores de seguimiento, estratificación y respuesta"],
    exportsView: ["Exportación", "CSV (Excel) + Backup JSON + restauración"],
    aboutView: ["Ayuda", "Buenas prácticas (local-first, RGPD, backups)"],
  };
  const [t, h] = titleMap[viewId] || ["", ""];
  $("#pageTitle").textContent = t;
  $("#pageHint").textContent = h;

  if (viewId !== "patientsView") $("#btnNewPatient").classList.add("hidden");
  else $("#btnNewPatient").classList.remove("hidden");

  if (viewId === "dashboardView") renderDashboard();
}

// ---------------- UI: selectors ----------------

function fillConditionSelectors() {
  const filter = $("#conditionFilter");
  const current = filter.value;
  filter.innerHTML =
    `<option value="">Todas las patologías</option>` +
    APP.conditionList.map((c) => `<option value="${c}">${c}</option>`).join("");
  if (APP.conditionList.includes(current)) filter.value = current;

  const sel = $("#p_condition");
  sel.innerHTML =
    `<option value="">—</option>` + APP.conditionList.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function fillHospitalDrugs() {
  const sel = $("#v_hospDrug");
  sel.innerHTML = APP.hospitalDrugs.map((d) => `<option value="${d}">${d}</option>`).join("");
}

// ---------------- Stats ----------------

function updateStats() {
  const patients = APP.state.patients;
  $("#patientsCount").textContent = String(patients.length);

  const active = patients.filter((p) => p.status !== "inactive").length;
  $("#statActive").textContent = String(active);

  const withVisits = patients.filter((p) => patientLastVisit(p.patientId)).length;
  $("#statWithVisits").textContent = String(withVisits);

  dbGetMeta("lastBackupAt").then((v) => {
    $("#statLastBackup").textContent = v ? String(v) : "—";
  });
}

// ---------------- Dashboard ----------------

function renderDashboard() {
  const patients = APP.state.patients;
  const active = patients.filter((p) => p.status !== "inactive");

  // Summary cards
  const withVisits = active.filter((p) => patientLastVisit(p.patientId));
  const goalYes = active.filter((p) => {
    const last = patientLastVisit(p.patientId);
    return last && last.ldlGoalAchieved === true;
  });

  $("#dash_active").textContent = String(active.length);
  $("#dash_withVisits").textContent = String(withVisits.length);
  $("#dash_goalYes").textContent = String(goalYes.length);

  // By stratification level
  const byLevel = { 1: 0, 2: 0, 3: 0 };
  for (const p of active) {
    const lvl = p.priorityLevel || 3;
    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
  }
  $("#dash_byLevel").innerHTML =
    `<div class="kv">` +
    `<div class="k">Nivel 1 (alta)</div><div class="v">${byLevel[1]}</div>` +
    `<div class="k">Nivel 2 (media)</div><div class="v">${byLevel[2]}</div>` +
    `<div class="k">Nivel 3 (baja)</div><div class="v">${byLevel[3]}</div>` +
    `</div>`;

  // By treatment (last visit hospital drug)
  const byTreat = {};
  for (const p of active) {
    const last = patientLastVisit(p.patientId);
    const drug = (last && last.hospitalDrug) || "Sin visita";
    byTreat[drug] = (byTreat[drug] || 0) + 1;
  }
  const treatEntries = Object.entries(byTreat).sort((a, b) => b[1] - a[1]);
  $("#dash_byTreatment").innerHTML =
    `<div class="kv">` +
    treatEntries.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${v}</div>`).join("") +
    `</div>`;

  // By service / prevalent condition
  const bySvc = {};
  for (const p of active) {
    const svc = p.prevalentCondition || "Sin asignar";
    bySvc[svc] = (bySvc[svc] || 0) + 1;
  }
  const svcEntries = Object.entries(bySvc).sort((a, b) => b[1] - a[1]);
  $("#dash_byService").innerHTML =
    `<div class="kv">` +
    svcEntries.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${v}</div>`).join("") +
    `</div>`;

  // Response table
  const tbody = $("#dash_responseBody");
  tbody.innerHTML = "";
  for (const p of active) {
    const last = patientLastVisit(p.patientId);
    const drug = last ? (last.hospitalDrug || "—") : "—";
    const ldl = last && last.ldl != null ? String(last.ldl) : "—";
    const target = last && last.ldlTarget != null ? String(last.ldlTarget) : "—";
    const goal = last ? last.ldlGoalAchieved : null;
    const goalLabel = goal === true ? "Si" : goal === false ? "No" : "—";
    const goalClass = goal === true ? "ok" : goal === false ? "no" : "";
    const lvl = p.priorityLevel || 3;

    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(p.patientId)}</td>` +
      `<td>${esc(p.prevalentCondition || "—")}</td>` +
      `<td>Nivel ${lvl}</td>` +
      `<td>${esc(drug)}</td>` +
      `<td>${ldl}</td>` +
      `<td>${target}</td>` +
      `<td><span class="chip ${goalClass}">${goalLabel}</span></td>`;
    tbody.appendChild(tr);
  }
}

function matchesSearch(p, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  const last = patientLastVisit(p.patientId);
  const lastLDL = last?.ldl ?? "";
  return [p.patientId, p.prevalentCondition, p.sex, p.birthYear, p.notes, p.comorbidities, lastLDL].some((x) =>
    String(x ?? "").toLowerCase().includes(s)
  );
}

function matchesCondition(p, cond) {
  if (!cond) return true;
  return p.prevalentCondition === cond;
}

// ---------------- Tables ----------------

function renderPatientsTable() {
  const tbody = $("#patientsTable tbody");
  tbody.innerHTML = "";

  const q = $("#patientSearch").value.trim();
  const cond = $("#conditionFilter").value;

  const rows = APP.state.patients
    .filter((p) => matchesSearch(p, q))
    .filter((p) => matchesCondition(p, cond))
    .map((p) => {
      const last = patientLastVisit(p.patientId);
      return { p, last };
    });

  for (const { p, last } of rows) {
    const tr = document.createElement("tr");

    const ldl = last?.ldl ?? "—";
    const tgt = last?.ldlTarget ?? "—";
    const lvl = last?.priorityLevel ?? "—";
    const score = last?.cmoScore ?? "—";
    const lastDate = last?.date ?? "—";

    tr.innerHTML = `
      <td><span class="link" data-open-patient="${p.patientId}">${p.patientId}</span></td>
      <td>${p.prevalentCondition || "—"}</td>
      <td>${p.sex || "—"}</td>
      <td>${p.birthYear || "—"}</td>
      <td>${fmtDate(lastDate)}</td>
      <td>${lvl === "—" ? "—" : `Nivel ${lvl}`}</td>
      <td>${score}</td>
      <td>${ldl}</td>
      <td>${tgt}</td>
      <td>${p.status === "inactive" ? "Inactivo" : "Activo"}</td>
    `;
    tbody.appendChild(tr);
  }

  $$("[data-open-patient]").forEach((el) => {
    el.addEventListener("click", () => openPatient(el.getAttribute("data-open-patient")));
  });
}

function openPatient(patientId) {
  APP.state.selectedPatientId = patientId;
  $("#patientDetailCard").classList.remove("hidden");
  $("#patientsTable").closest(".card").classList.add("hidden");

  $("#patientDetailTitle").textContent = `Ficha · ${patientId}`;

  const p = APP.state.patients.find((x) => x.patientId === patientId);
  if (!p) return;

  $("#d_patientId").textContent = p.patientId;
  $("#d_condition").textContent = p.prevalentCondition || "—";
  $("#d_sex").textContent = p.sex || "—";
  $("#d_birthYear").textContent = p.birthYear || "—";
  $("#d_comorb").textContent = p.comorbidities || "—";
  $("#d_notes").textContent = p.notes || "—";

  const last = patientLastVisit(patientId);
  $("#d_levelNow").textContent = last?.priorityLevel ? `Nivel ${last.priorityLevel}` : "—";
  $("#d_levelWhy").textContent = last?.priorityJustification || "—";
  $("#d_scoreNow").textContent = last?.cmoScore ?? "—";

  const ldlLast = last?.ldl ?? null;
  $("#d_ldlLast").textContent = ldlLast === null ? "—" : String(ldlLast);
  const goal = last?.ldlTarget ?? null;
  const ach = last?.ldlGoalAchieved;
  $("#d_ldlGoal").textContent =
    goal === null ? "—" : `Objetivo ${goal} · ${ach === true ? "Cumple" : ach === false ? "No cumple" : "—"}`;

  renderVisitsTable(patientId);
  drawLDLChart(patientId);
}

function closePatient() {
  APP.state.selectedPatientId = null;
  $("#patientDetailCard").classList.add("hidden");
  $("#patientsTable").closest(".card").classList.remove("hidden");
}

function renderVisitsTable(patientId) {
  const tbody = $("#visitsTable tbody");
  tbody.innerHTML = "";

  const visits = APP.state.visits.filter((v) => v.patientId === patientId);
  visits.sort((a, b) => (a.date > b.date ? -1 : 1));

  for (const v of visits) {
    const tr = document.createElement("tr");
    const goal = v.ldlGoalAchieved;
    const goalTxt = goal === true ? "Sí" : goal === false ? "No" : "—";

    tr.innerHTML = `
      <td>${v.date || "—"}</td>
      <td>${v.hospitalDrug || "—"}</td>
      <td>${v.ldl ?? "—"}</td>
      <td>${v.ldlTarget ?? "—"}</td>
      <td>${goalTxt}</td>
      <td>${v.cmoScore ?? "—"}</td>
      <td>${v.priorityLevel ? `Nivel ${v.priorityLevel}` : "—"}</td>
      <td title="${(v.treatment || "").slice(0, 160)}">${(v.treatment || "—").slice(0, 38)}${
      (v.treatment || "").length > 38 ? "…" : ""
    }</td>
      <td>${v.adherence || "—"}</td>
      <td>${v.ram || "—"}</td>
      <td><span class="link" data-open-visit="${v.visitId}">Ver</span></td>
    `;
    tbody.appendChild(tr);
  }

  $$("[data-open-visit]").forEach((el) => {
    el.addEventListener("click", () => openVisitDetail(el.getAttribute("data-open-visit")));
  });
}

function openVisitDetail(visitId) {
  APP.state.selectedVisitId = visitId;
  const v = APP.state.visits.find((x) => x.visitId === visitId);
  if (!v) return;

  $("#vd_header").textContent = `${v.patientId} · ${v.date}`;

  const kv = $("#vd_kv");
  kv.innerHTML = `
    <div class="k">Fármaco hospitalario</div><div class="v">${v.hospitalDrug || "—"}</div>
    <div class="k">LDL</div><div class="v">${v.ldl ?? "—"}</div>
    <div class="k">Objetivo LDL</div><div class="v">${v.ldlTarget ?? "—"}</div>
    <div class="k">¿Cumple objetivo?</div><div class="v">${
      v.ldlGoalAchieved === true ? "Sí" : v.ldlGoalAchieved === false ? "No" : "—"
    }</div>
    <div class="k">Score</div><div class="v">${v.cmoScore ?? "—"}</div>
    <div class="k">Nivel</div><div class="v">${v.priorityLevel ? `Nivel ${v.priorityLevel}` : "—"}</div>
    <div class="k">Justificación</div><div class="v">${v.priorityJustification || "—"}</div>
    <div class="k">Tratamiento (texto)</div><div class="v">${v.treatment || "—"}</div>
    <div class="k">Adherencia</div><div class="v">${v.adherence || "—"}</div>
    <div class="k">RAM</div><div class="v">${v.ram || "—"}</div>
    <div class="k">OFT</div><div class="v">${v.oftObjectives || "—"}</div>
    <div class="k">Plan seguimiento</div><div class="v">${v.followUpPlan || "—"}</div>
  `;

  const ints = visitInterventions(visitId);
  const cont = $("#vd_interventions");
  cont.innerHTML = ints.length ? "" : `<span class="smallMuted">Sin intervenciones registradas.</span>`;
  for (const i of ints) {
    const chip = document.createElement("span");
    chip.className =
      "chip " + (i.status === "accepted" ? "ok" : i.status === "rejected" ? "no" : "wait");
    const st = i.status === "accepted" ? "✅" : i.status === "rejected" ? "❌" : "⏳";
    chip.textContent = `${st} ${i.cmoDimension} · ${i.description}`;
    cont.appendChild(chip);
  }

  openModal("modalVisitDetail");
}

// ---------------- LDL Chart (canvas) ----------------

function drawLDLChart(patientId) {
  const canvas = $("#ldlChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const visits = APP.state.visits
    .filter((v) => v.patientId === patientId && v.ldl !== null && v.ldl !== undefined)
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const W = canvas.width,
    H = canvas.height;
  ctx.fillStyle = "#fafbfd";
  ctx.fillRect(0, 0, W, H);

  const padL = 50,
    padR = 18,
    padT = 14,
    padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (ih * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  if (visits.length < 2) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.font = "14px system-ui";
    ctx.fillText(
      visits.length === 1 ? "1 punto registrado (añade otra visita para ver tendencia)" : "Sin LDL longitudinal aún",
      padL,
      padT + 22
    );
    return;
  }

  const values = visits.map((v) => Number(v.ldl)).filter((n) => Number.isFinite(n));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(10, maxV - minV);

  const yMin = Math.max(0, minV - range * 0.15);
  const yMax = maxV + range * 0.15;

  ctx.fillStyle = "rgba(0,0,0,0.50)";
  ctx.font = "12px system-ui";
  for (let i = 0; i <= 5; i++) {
    const y = padT + (ih * i) / 5;
    const val = yMax - ((yMax - yMin) * i) / 5;
    ctx.fillText(String(Math.round(val)), 8, y + 4);
  }

  const n = visits.length;
  const points = visits.map((v, idx) => {
    const x = padL + (iw * idx) / (n - 1);
    const val = Number(v.ldl);
    const y = padT + ih * (1 - (val - yMin) / (yMax - yMin));
    return { x, y, date: v.date, ldl: val };
  });

  ctx.strokeStyle = "rgba(59,109,224,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  ctx.fillStyle = "rgba(42,157,110,0.90)";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const idxs = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.font = "11px system-ui";
  for (const idx of idxs) {
    const p = points[idx];
    ctx.fillText(p.date, Math.max(padL, Math.min(p.x - 28, W - padR - 70)), H - 10);
  }
}

// ---------------- Modal helpers ----------------

function openModal(id) {
  $(`#${id}`).classList.remove("hidden");
}
function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
}

function bindModalClose() {
  $$("[data-close]").forEach((el) => {
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
  $("#p_score").value = "0";
  $("#p_levelAuto").value = "Nivel 3";
  buildStratVarsPicker({});
}

async function savePatient() {
  const patientId = $("#p_patientId").value.trim();
  const prevalentCondition = $("#p_condition").value.trim();
  if (!patientId) return toast("ID pseudónimo obligatorio.");
  if (!prevalentCondition) return toast("Patología prevalente obligatoria.");
  if (/\s/.test(patientId)) return toast("El ID no debe contener espacios.");

  const birthYear = $("#p_birthYear").value.trim();
  const by = birthYear ? Number(birthYear) : null;
  if (birthYear && (!Number.isFinite(by) || by < 1900 || by > new Date().getFullYear())) {
    return toast("Año de nacimiento inválido.");
  }

  const stratVars = getStratSelections();
  const score = computeStratScore(stratVars);
  const priorityLevel = levelFromScoreWithOverrides(score, stratVars);

  const p = {
    patientId,
    prevalentCondition,
    sex: $("#p_sex").value || null,
    birthYear: by,
    comorbidities: ($("#p_comorb").value || "").trim() || null,
    notes: ($("#p_notes").value || "").trim() || null,
    status: $("#p_status").value || "active",
    stratVars,
    cmoScore: score,
    priorityLevel,
    createdAt: new Date().toISOString(),
    schemaVersion: APP.schemaVersion,
  };

  const exists = APP.state.patients.some((x) => x.patientId === patientId);
  if (exists) return toast("Ese ID ya existe.");

  await dbPut(APP.stores.patients, p);
  APP.state.patients.push(p);

  fillConditionSelectors();
  updateStats();
  renderPatientsTable();
  closeModal("modalPatient");
  toast("Paciente guardado.");
}

// ---------------- Stratification variables UI ----------------

function buildStratVarsPicker(defaultValues = {}) {
  const container = $("#stratVarsPicker");
  container.innerHTML = "";

  for (const v of APP.stratificationModel) {
    const row = document.createElement("div");
    row.className = "intervRow";
    row.style.gridTemplateColumns = "1.6fr 1fr 1fr";
    row.dataset.varId = v.id;

    const sel = document.createElement("select");
    sel.className = "select";
    sel.setAttribute("data-strat-sel", "1");

    sel.innerHTML =
      `<option value="">—</option>` +
      v.options.map((o) => `<option value="${o.value}">${o.label} (${o.points})</option>`).join("");

    if (defaultValues && defaultValues[v.id] !== undefined && defaultValues[v.id] !== null) {
      sel.value = String(defaultValues[v.id]);
    }

    const pts = document.createElement("div");
    pts.className = "smallMuted";
    pts.setAttribute("data-strat-pts", "1");
    pts.textContent = "0 pts";

    const label = document.createElement("div");
    label.className = "smallMuted";
    label.textContent = v.label;

    row.appendChild(label);
    row.appendChild(sel);
    row.appendChild(pts);

    container.appendChild(row);

    sel.addEventListener("change", () => {
      updateStratScoreUI();
      autoFillLevelFromScore();
    });
  }

  updateStratScoreUI();
  autoFillLevelFromScore();
}

function getStratSelections() {
  const out = {};
  const rows = Array.from($("#stratVarsPicker").querySelectorAll(".intervRow"));
  for (const r of rows) {
    const id = r.dataset.varId;
    const sel = r.querySelector('[data-strat-sel]');
    if (sel && sel.value !== "") out[id] = sel.value;
  }
  return out;
}

function computeStratScore(selections) {
  let total = 0;
  for (const v of APP.stratificationModel) {
    const chosen = selections[v.id];
    if (chosen === undefined) continue;
    const opt = v.options.find((o) => String(o.value) === String(chosen));
    if (opt) total += Number(opt.points || 0);
  }
  return total;
}

function updateStratScoreUI() {
  const selections = getStratSelections();
  const rows = Array.from($("#stratVarsPicker").querySelectorAll(".intervRow"));
  for (const r of rows) {
    const id = r.dataset.varId;
    const sel = r.querySelector("[data-strat-sel]");
    const ptsEl = r.querySelector("[data-strat-pts]");
    const varDef = APP.stratificationModel.find((v) => v.id === id);
    const opt = varDef?.options?.find((o) => String(o.value) === String(sel.value));
    const pts = opt ? Number(opt.points || 0) : 0;
    ptsEl.textContent = `${pts} pts`;
  }
  const total = computeStratScore(selections);
  $("#p_score").value = String(total);
}

function autoFillLevelFromScore() {
  const selections = getStratSelections();
  const score = safeNum($("#p_score").value) ?? 0;
  const lvl = levelFromScoreWithOverrides(score, selections);
  $("#p_levelAuto").value = `Nivel ${lvl}`;
}

// ---------------- Interventions UI ----------------

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

function collectInterventionsFromPicker(patientId, visitId) {
  const rows = Array.from($("#interventionsPicker").querySelectorAll(".intervRow"));
  const picked = [];
  let idx = 0;
  for (const row of rows) {
    const statusSel = row.querySelector("[data-int-status]");
    const noteIn = row.querySelector("[data-int-note]");
    if (!statusSel) continue;
    const status = statusSel.value;
    const note = (noteIn?.value || "").trim();
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

// ---------------- Visit form ----------------

function resetVisitForm(defaults = {}) {
  $("#v_date").value = todayISO();
  $("#v_hospDrug").value = "—";
  $("#v_ldl").value = "";
  $("#v_ldlTarget").value = "";
  $("#v_goalAch").value = "";
  $("#v_treatment").value = "";
  $("#v_adherence").value = "";
  $("#v_ram").value = "";
  $("#v_levelWhy").value = "";
  $("#v_oft").value = "";
  $("#v_follow").value = "";
  $("#v_hcText").value = "";

  buildInterventionsPicker();

  if (defaults.hospitalDrug) $("#v_hospDrug").value = defaults.hospitalDrug;
  if (defaults.ldlTarget !== undefined && defaults.ldlTarget !== null) $("#v_ldlTarget").value = String(defaults.ldlTarget);
  if (defaults.treatment) $("#v_treatment").value = defaults.treatment;
  if (defaults.adherence) $("#v_adherence").value = defaults.adherence;
  if (defaults.ram) $("#v_ram").value = defaults.ram;
}

function getDefaultsFromLastVisit(patientId) {
  const last = patientLastVisit(patientId);
  if (!last) return {};
  return {
    hospitalDrug: last.hospitalDrug || "—",
    ldlTarget: last.ldlTarget ?? null,
    treatment: last.treatment ?? null,
    adherence: last.adherence ?? null,
    ram: last.ram ?? null,
  };
}

function generateHCText(patient, visit, interventions) {
  const lines = [];
  lines.push(`Paciente ${patient.patientId} · Patología prevalente: ${patient.prevalentCondition || "—"}`);
  lines.push(`Fecha visita: ${visit.date || "—"}`);
  lines.push(`Fármaco hospitalario: ${visit.hospitalDrug || "—"}`);
  lines.push(
    `LDL: ${visit.ldl ?? "—"} mg/dL · Objetivo: ${visit.ldlTarget ?? "—"} mg/dL · Cumple: ${
      visit.ldlGoalAchieved === true ? "Sí" : visit.ldlGoalAchieved === false ? "No" : "—"
    }`
  );
  lines.push(`Tratamiento (texto): ${visit.treatment || "—"}`);
  lines.push(`Adherencia: ${visit.adherence || "—"} · RAM: ${visit.ram || "—"}`);

  lines.push(`Estratificación: Score ${visit.cmoScore ?? "—"} · Nivel ${visit.priorityLevel ?? "—"} · ${visit.priorityJustification || "—"}`);

  if (visit.stratVars && Object.keys(visit.stratVars).length) {
    lines.push(`Variables estratificación (selección):`);
    for (const v of APP.stratificationModel) {
      const val = visit.stratVars[v.id];
      if (val === undefined) continue;
      const opt = v.options.find((o) => String(o.value) === String(val));
      const txt = opt ? `${opt.label} (${opt.points})` : String(val);
      lines.push(`- ${v.label}: ${txt}`);
    }
  }

  if (visit.oftObjectives) lines.push(`OFT: ${visit.oftObjectives}`);
  if (visit.followUpPlan) lines.push(`Plan seguimiento: ${visit.followUpPlan}`);

  if (interventions.length) {
    lines.push(`Intervenciones CMO:`);
    for (const i of interventions) {
      lines.push(`- ${i.cmoDimension}: ${i.description} [${i.status}]${i.outcomeNotes ? " — " + i.outcomeNotes : ""}`);
    }
  } else {
    lines.push(`Intervenciones CMO: —`);
  }
  return lines.join("\n");
}

function generateHCFromForm() {
  const patientId = APP.state.selectedPatientId;
  if (!patientId) return toast("Selecciona un paciente.");
  const patient = APP.state.patients.find((p) => p.patientId === patientId);
  if (!patient) return toast("Paciente no encontrado.");

  const stratVars = (patient && patient.stratVars) || {};
  const score = computeStratScore(stratVars);
  const lvl = levelFromScoreWithOverrides(score, stratVars);

  const visit = {
    date: $("#v_date").value || "—",
    hospitalDrug: $("#v_hospDrug").value || "—",
    ldl: safeNum($("#v_ldl").value),
    ldlTarget: safeNum($("#v_ldlTarget").value),
    ldlGoalAchieved:
      $("#v_goalAch").value === "true" ? true : $("#v_goalAch").value === "false" ? false : null,
    treatment: ($("#v_treatment").value || "").trim() || null,
    adherence: ($("#v_adherence").value || "").trim() || null,
    ram: ($("#v_ram").value || "").trim() || null,
    stratVars,
    cmoScore: score,
    priorityLevel: lvl,
    priorityJustification: ($("#v_levelWhy").value || "").trim() || null,
    oftObjectives: ($("#v_oft").value || "").trim() || null,
    followUpPlan: ($("#v_follow").value || "").trim() || null,
  };

  const tempVisitId = `TEMP-${patientId}-${visit.date}`;
  const interventions = collectInterventionsFromPicker(patientId, tempVisitId);

  $("#v_hcText").value = generateHCText(patient, visit, interventions);
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

async function saveVisit() {
  const patientId = APP.state.selectedPatientId;
  if (!patientId) return toast("Selecciona un paciente.");

  const date = $("#v_date").value;
  if (!date) return toast("Fecha obligatoria.");

  const patient = APP.state.patients.find((p) => p.patientId === patientId);
  const stratVars = (patient && patient.stratVars) || {};
  const score = computeStratScore(stratVars);
  const priorityLevel = levelFromScoreWithOverrides(score, stratVars);

  const ldl = safeNum($("#v_ldl").value);
  const ldlTarget = safeNum($("#v_ldlTarget").value);

  let ldlGoalAchieved = $("#v_goalAch").value;
  ldlGoalAchieved = ldlGoalAchieved === "true" ? true : ldlGoalAchieved === "false" ? false : null;

  const visit = {
    visitId: makeVisitId(patientId, date),
    patientId,
    date,
    hospitalDrug: $("#v_hospDrug").value || "—",
    ldl,
    ldlTarget,
    ldlGoalAchieved,
    treatment: ($("#v_treatment").value || "").trim() || null,
    adherence: ($("#v_adherence").value || "").trim() || null,
    ram: ($("#v_ram").value || "").trim() || null,

    stratVars,
    cmoScore: score,
    priorityLevel,
    priorityJustification: ($("#v_levelWhy").value || "").trim() || null,

    oftObjectives: ($("#v_oft").value || "").trim() || null,
    followUpPlan: ($("#v_follow").value || "").trim() || null,
    nextVisitSuggested: null,

    createdAt: new Date().toISOString(),
    schemaVersion: APP.schemaVersion,
  };

  const interventions = collectInterventionsFromPicker(patientId, visit.visitId);

  await dbPut(APP.stores.visits, visit);
  APP.state.visits.push(visit);

  for (const i of interventions) {
    await dbPut(APP.stores.interventions, i);
    APP.state.interventions.push(i);
  }

  closeModal("modalVisit");
  openPatient(patientId);
  updateStats();
  toast("Visita guardada.");
}

async function deleteSelectedVisit() {
  const visitId = APP.state.selectedVisitId;
  if (!visitId) return;

  const v = APP.state.visits.find((x) => x.visitId === visitId);
  if (!v) return;

  if (!confirm("¿Eliminar esta visita y sus intervenciones?")) return;

  const ints = visitInterventions(visitId);
  for (const i of ints) await dbDelete(APP.stores.interventions, i.interventionId);
  APP.state.interventions = APP.state.interventions.filter((i) => i.visitId !== visitId);

  await dbDelete(APP.stores.visits, visitId);
  APP.state.visits = APP.state.visits.filter((x) => x.visitId !== visitId);

  closeModal("modalVisitDetail");
  toast("Visita eliminada.");
  openPatient(v.patientId);
  updateStats();
}

async function deleteSelectedPatient() {
  const patientId = APP.state.selectedPatientId;
  if (!patientId) return;

  const p = APP.state.patients.find((x) => x.patientId === patientId);
  if (!p) return;

  const visits = APP.state.visits.filter((v) => v.patientId === patientId);
  const intCount = APP.state.interventions.filter((i) => i.patientId === patientId).length;

  const msg =
    `¿Eliminar el paciente "${patientId}" con ${visits.length} visita(s) y ${intCount} intervención(es)?\n\nEsta acción es irreversible.`;
  if (!confirm(msg)) return;

  // Delete all interventions for this patient
  const ints = APP.state.interventions.filter((i) => i.patientId === patientId);
  for (const i of ints) await dbDelete(APP.stores.interventions, i.interventionId);
  APP.state.interventions = APP.state.interventions.filter((i) => i.patientId !== patientId);

  // Delete all visits for this patient
  for (const v of visits) await dbDelete(APP.stores.visits, v.visitId);
  APP.state.visits = APP.state.visits.filter((v) => v.patientId !== patientId);

  // Delete the patient
  await dbDelete(APP.stores.patients, patientId);
  APP.state.patients = APP.state.patients.filter((x) => x.patientId !== patientId);

  closePatient();
  fillConditionSelectors();
  updateStats();
  renderPatientsTable();
  toast("Paciente eliminado.");
}

// ---------------- Export / Backup ----------------

function patientsForCSV() {
  return APP.state.patients.map((p) => ({
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
  return APP.state.visits.map((v) => ({
    visitId: v.visitId,
    patientId: v.patientId,
    date: v.date ?? "",
    hospitalDrug: v.hospitalDrug ?? "",
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
    stratVars_json: v.stratVars ? JSON.stringify(v.stratVars) : "",
    createdAt: v.createdAt ?? "",
    schemaVersion: v.schemaVersion ?? "",
  }));
}

function interventionsForCSV() {
  return APP.state.interventions.map((i) => ({
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
  const headers = Object.keys(rows[0] || {});
  downloadText("patients.csv", toCSV(rows, headers), "text/csv;charset=utf-8");
  toast("patients.csv exportado.");
}

async function exportVisitsCSV() {
  const rows = visitsForCSV();
  const headers = Object.keys(rows[0] || {});
  downloadText("visits.csv", toCSV(rows, headers), "text/csv;charset=utf-8");
  toast("visits.csv exportado.");
}

async function exportInterventionsCSV() {
  const rows = interventionsForCSV();
  const headers = Object.keys(rows[0] || {});
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
  downloadText(`backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
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

    if (!confirm("Esto mezclará (o sobrescribirá por ID) los datos actuales. ¿Continuar?")) return;

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

// ---------------- Bindings ----------------

async function loadAll() {
  APP.state.patients = await dbGetAll(APP.stores.patients);
  APP.state.visits = await dbGetAll(APP.stores.visits);
  APP.state.interventions = await dbGetAll(APP.stores.interventions);
}

function bindNav() {
  $$(".navBtn").forEach((btn) => {
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
  $("#btnDeletePatient").addEventListener("click", deleteSelectedPatient);

  $("#btnNewVisit").addEventListener("click", () => {
    if (!APP.state.selectedPatientId) return toast("Selecciona un paciente.");
    const defaults = getDefaultsFromLastVisit(APP.state.selectedPatientId);
    resetVisitForm(defaults);
    $("#visitForPatient").textContent = `Paciente: ${APP.state.selectedPatientId} (variables precargadas de última visita si existe)`;
    openModal("modalVisit");
  });

  $("#btnSaveVisit").addEventListener("click", saveVisit);

  $("#btnGenerateHC").addEventListener("click", generateHCFromForm);
  $("#btnCopyHC").addEventListener("click", copyHC);

  // no-op hooks (por si luego quieres lógica automática)
  ["#v_ldl", "#v_ldlTarget", "#v_goalAch", "#v_hospDrug"].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener("change", () => {});
  });
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
  fillHospitalDrugs();
  updateStats();
  renderPatientsTable();

  bindNav();
  bindModalClose();
  bindPatientsUI();
  bindExportUI();
  bindVisitDetailUI();

  setView("patientsView");
  toast("Listo. Datos en local (IndexedDB).");
}

init().catch((e) => {
  console.error(e);
  alert("Error inicializando la app. Mira la consola del navegador.");
});
