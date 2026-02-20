/* Herramienta de seguimiento CMO para Riesgo Cardiovascular (RCV)
   Creado por Ramon Morillo — Febrero 2026
   ---
   Local-first (IndexedDB) — GitHub Pages friendly
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
    // Pending CSV batches (set by prepare*, consumed by apply*)
    csvPending: { patients: null, visits: null, interventions: null },
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

// Default export: comma separator, no BOM (compatible with all tools)
function toCSV(rows, headers) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h] ?? "")).join(","));
  return lines.join("\r\n");
}

// Excel España export: semicolon separator, UTF-8 BOM
function csvEscapeSemi(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[;",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCSVExcelES(rows, headers) {
  const lines = [headers.map(csvEscapeSemi).join(";")];
  for (const r of rows) lines.push(headers.map((h) => csvEscapeSemi(r[h] ?? "")).join(";"));
  return "\uFEFF" + lines.join("\r\n"); // UTF-8 BOM + CRLF
}

// Normalize various date formats → YYYY-MM-DD. Returns null if unparseable.
function parseFlexDate(str) {
  if (!str) return null;
  const s = str.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY (Spain / Excel ES)
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  // YYYY/MM/DD
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2,"0")}-${m2[3].padStart(2,"0")}`;
  return null;
}

// ---------------- CSV parser (RFC4180, BOM-aware, auto-delimiter) ----------------

function parseCSV(rawText) {
  // Strip UTF-8 BOM if present
  let text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText;

  // Auto-detect delimiter: count occurrences in first line outside quotes
  let inQ = false, semiCount = 0, commaCount = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (c === "\n") break;
    if (c === ";") semiCount++;
    else if (c === ",") commaCount++;
  }
  const sep = semiCount >= commaCount ? ";" : ",";

  // RFC4180 character-by-character parser (handles quoted fields, CRLF, embedded newlines)
  const rows = [];
  let row = [], field = "";
  inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped ""
        else inQ = false;                               // closing quote
      } else field += c;
    } else {
      if (c === '"') { inQ = true; }
      else if (c === sep)  { row.push(field); field = ""; }
      else if (c === "\r" && text[i + 1] === "\n") { row.push(field); field = ""; rows.push(row); row = []; i++; }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);

  // Drop trailing blank rows
  while (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();

  if (!rows.length) return { headers: [], records: [], sep };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });

  return { headers, records, sep };
}

// Validates parsed records against a CSV_SCHEMA field list.
// Returns array of error strings (empty = valid).
function validateCSVImport(records, schemaFields) {
  const errors = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rowNum = i + 2; // row 1 = header, data starts at row 2
    for (const field of schemaFields) {
      const val = rec[field.key] ?? "";
      if (field.required && val === "") {
        errors.push(`Fila ${rowNum}: columna obligatoria "${field.key}" está vacía.`);
        continue;
      }
      if (!val) continue; // optional & empty → skip type checks
      if (field.type === "number") {
        if (safeNum(val) === null) errors.push(`Fila ${rowNum}: "${field.key}" debe ser número (se encontró "${val}").`);
      } else if (field.type === "date") {
        if (!parseFlexDate(val)) errors.push(`Fila ${rowNum}: "${field.key}" debe ser fecha YYYY-MM-DD o DD/MM/YYYY (se encontró "${val}").`);
      } else if (field.type === "boolean") {
        if (!["true", "false"].includes(val.toLowerCase())) errors.push(`Fila ${rowNum}: "${field.key}" debe ser "true" o "false" (se encontró "${val}").`);
      } else if (field.type === "enum" && field.values) {
        if (!field.values.includes(val)) errors.push(`Fila ${rowNum}: "${field.key}" debe ser uno de [${field.values.join(", ")}] (se encontró "${val}").`);
      }
    }
  }
  return errors;
}

// ---------------- CSV Schema (data dictionary) ----------------
// Single source of truth for CSV headers, types and validation.
// To add/rename fields: edit here; exports and imports update automatically.

const CSV_SCHEMA = {
  patients: [
    { key: "patientId",           required: true,  type: "string" },
    { key: "prevalentCondition",  required: true,  type: "string" },
    { key: "sex",                 required: false, type: "string" },
    { key: "birthYear",           required: false, type: "number" },
    { key: "comorbidities",       required: false, type: "string" },
    { key: "notes",               required: false, type: "string" },
    { key: "status",              required: false, type: "enum",   values: ["active", "inactive"] },
    { key: "createdAt",           required: false, type: "string" },
    { key: "schemaVersion",       required: false, type: "string" },
  ],
  visits: [
    { key: "visitId",             required: true,  type: "string" },
    { key: "patientId",           required: true,  type: "string" },
    { key: "date",                required: true,  type: "date"   },
    { key: "hospitalDrug",        required: false, type: "string" },
    { key: "ldl",                 required: false, type: "number" },
    { key: "ldlTarget",           required: false, type: "number" },
    { key: "ldlGoalAchieved",     required: false, type: "boolean" },
    { key: "treatment",           required: false, type: "string" },
    { key: "adherence",           required: false, type: "string" },
    { key: "ram",                 required: false, type: "string" },
    { key: "cmoScore",            required: false, type: "number" },
    { key: "priorityLevel",       required: false, type: "number" },
    { key: "priorityJustification", required: false, type: "string" },
    { key: "oftObjectives",       required: false, type: "string" },
    { key: "followUpPlan",        required: false, type: "string" },
    { key: "stratVars_json",      required: false, type: "string" }, // JSON-serialized stratification vars
    { key: "createdAt",           required: false, type: "string" },
    { key: "schemaVersion",       required: false, type: "string" },
  ],
  interventions: [
    { key: "interventionId",  required: true,  type: "string" },
    { key: "patientId",       required: true,  type: "string" },
    { key: "visitId",         required: true,  type: "string" },
    { key: "type",            required: false, type: "string" },
    { key: "cmoDimension",    required: true,  type: "string" },
    { key: "description",     required: true,  type: "string" },
    { key: "status",          required: true,  type: "enum",   values: ["accepted", "pending", "rejected"] },
    { key: "outcomeNotes",    required: false, type: "string" },
    { key: "createdAt",       required: false, type: "string" },
    { key: "schemaVersion",   required: false, type: "string" },
  ],
};

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
    interventionsView: ["Intervenciones", "Registro de intervenciones CMO por paciente y estado"],
    exportsView: ["Exportación", "CSV (Excel) + Backup JSON + restauración"],
    aboutView: ["Ayuda", "Buenas prácticas (local-first, RGPD, backups)"],
  };
  const [t, h] = titleMap[viewId] || ["", ""];
  $("#pageTitle").textContent = t;
  $("#pageHint").textContent = h;

  if (viewId !== "patientsView") $("#btnNewPatient").classList.add("hidden");
  else $("#btnNewPatient").classList.remove("hidden");

  if (viewId === "dashboardView") renderDashboard();
  if (viewId === "interventionsView") renderInterventions();
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

// ---------------- Canvas polyfill ----------------

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    const r = Array.isArray(radii) ? radii : [radii || 0];
    const tl = r[0] || 0, tr = r[1] !== undefined ? r[1] : tl;
    const br = r[2] !== undefined ? r[2] : tl, bl = r[3] !== undefined ? r[3] : tr;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

// ---------------- Dashboard: Chart utilities ----------------

const CHART_COLORS = [
  "#3b6de0", "#2a9d6e", "#e0873b", "#d63a55", "#8b5cf6",
  "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#6366f1",
];

function _dpr(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, W: rect.width || canvas.width / dpr, H: rect.height || canvas.height / dpr };
}

function drawDonutChart(canvasId, legendId, data, title) {
  const canvas = $(`#${canvasId}`);
  const { ctx, W, H } = _dpr(canvas);
  ctx.clearRect(0, 0, W, H);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sin datos", W / 2, H / 2);
    if (legendId) $(`#${legendId}`).innerHTML = "";
    return;
  }

  const cx = W / 2, cy = H / 2 - 6;
  const R = Math.min(cx, cy) - 14;
  const r = R * 0.55;
  let startAngle = -Math.PI / 2;

  for (let i = 0; i < data.length; i++) {
    const slice = (data[i].value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, startAngle + slice);
    ctx.arc(cx, cy, r, startAngle + slice, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = data[i].color || CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    startAngle += slice;
  }

  // Center text
  ctx.fillStyle = "var(--text, #1a2332)";
  ctx.font = "bold 22px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 4);
  ctx.font = "11px system-ui";
  ctx.fillStyle = "rgba(0,0,0,.50)";
  ctx.fillText(title || "total", cx, cy + 14);

  // Legend
  if (legendId) {
    $(`#${legendId}`).innerHTML = data
      .map(
        (d, i) =>
          `<span class="legendItem"><span class="legendDot" style="background:${d.color || CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(d.label)} <b>${d.value}</b> (${total ? Math.round((d.value / total) * 100) : 0}%)</span>`
      )
      .join("");
  }
}

function drawBarChart(canvasId, data, { horizontal = false, showValues = true } = {}) {
  const canvas = $(`#${canvasId}`);
  const { ctx, W, H } = _dpr(canvas);
  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sin datos", W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  if (horizontal) {
    const barH = Math.min(28, (H - 10) / data.length - 6);
    const labelW = 110;
    const chartW = W - labelW - 40;

    for (let i = 0; i < data.length; i++) {
      const y = 8 + i * (barH + 6);
      const bw = (data[i].value / maxVal) * chartW;

      // Label
      ctx.fillStyle = "rgba(0,0,0,.60)";
      ctx.font = "11px system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label = data[i].label.length > 16 ? data[i].label.slice(0, 15) + "…" : data[i].label;
      ctx.fillText(label, labelW - 6, y + barH / 2);

      // Bar
      ctx.beginPath();
      const radius = Math.min(6, barH / 2);
      ctx.roundRect(labelW, y, Math.max(bw, 2), barH, [radius]);
      ctx.fillStyle = data[i].color || CHART_COLORS[i % CHART_COLORS.length];
      ctx.fill();

      // Value
      if (showValues) {
        ctx.fillStyle = "rgba(0,0,0,.70)";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(String(data[i].value), labelW + bw + 6, y + barH / 2);
      }
    }
  } else {
    // Vertical bars
    const padB = 40, padT = 16, padL = 30, padR = 10;
    const chartH = H - padT - padB;
    const chartW = W - padL - padR;
    const barW = Math.min(40, chartW / data.length - 8);
    const gap = (chartW - barW * data.length) / (data.length + 1);

    // Y-axis grid
    ctx.strokeStyle = "rgba(0,0,0,.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.40)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(String(Math.round(maxVal - (maxVal * i) / 4)), padL - 4, y + 3);
    }

    for (let i = 0; i < data.length; i++) {
      const x = padL + gap + i * (barW + gap);
      const bh = (data[i].value / maxVal) * chartH;
      const y = padT + chartH - bh;

      ctx.beginPath();
      const radius = Math.min(6, barW / 2);
      ctx.roundRect(x, y, barW, bh, [radius, radius, 0, 0]);
      ctx.fillStyle = data[i].color || CHART_COLORS[i % CHART_COLORS.length];
      ctx.fill();

      // Value on top
      if (showValues && data[i].value > 0) {
        ctx.fillStyle = "rgba(0,0,0,.70)";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(String(data[i].value), x + barW / 2, y - 5);
      }

      // Label below
      ctx.save();
      ctx.translate(x + barW / 2, H - padB + 8);
      ctx.rotate(-0.45);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      const lbl = data[i].label.length > 12 ? data[i].label.slice(0, 11) + "…" : data[i].label;
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }
  }
}

function drawLineChart(canvasId, seriesData, { yLabel = "", xLabels = [] } = {}) {
  const canvas = $(`#${canvasId}`);
  const { ctx, W, H } = _dpr(canvas);
  ctx.clearRect(0, 0, W, H);

  if (!seriesData.length) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sin datos de LDL longitudinal", W / 2, H / 2);
    return;
  }

  const padL = 44, padR = 14, padT = 14, padB = 36;
  const cw = W - padL - padR, ch = H - padT - padB;

  const allVals = seriesData.map((d) => d.value);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = Math.max(10, maxV - minV);
  const yMin = Math.max(0, minV - range * 0.12);
  const yMax = maxV + range * 0.12;

  // Grid
  ctx.strokeStyle = "rgba(0,0,0,.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (ch * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(yMax - ((yMax - yMin) * i) / 5)), padL - 5, y + 3);
  }

  // Area fill
  const n = seriesData.length;
  const points = seriesData.map((d, i) => ({
    x: padL + (cw * i) / Math.max(n - 1, 1),
    y: padT + ch * (1 - (d.value - yMin) / (yMax - yMin)),
  }));

  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + ch);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, padT + ch);
  ctx.closePath();
  ctx.fillStyle = "rgba(59,109,224,.10)";
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = "rgba(59,109,224,.85)";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Dots
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#3b6de0";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // X labels
  const labelIdxs =
    n <= 6 ? seriesData.map((_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  for (const i of labelIdxs) {
    const lbl = xLabels[i] || seriesData[i].label || "";
    ctx.fillText(lbl, points[i].x, H - 8);
  }

  // Y label
  if (yLabel) {
    ctx.save();
    ctx.translate(10, padT + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,.40)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

// ---------------- Dashboard ----------------

function renderDashboard() {
  const patients = APP.state.patients;
  const active = patients.filter((p) => p.status !== "inactive");
  const allVisits = APP.state.visits;
  const allInterventions = APP.state.interventions;

  // === Summary cards ===
  const withVisits = active.filter((p) => patientLastVisit(p.patientId));
  const goalYes = active.filter((p) => {
    const last = patientLastVisit(p.patientId);
    return last && last.ldlGoalAchieved === true;
  });
  const goalNo = active.filter((p) => {
    const last = patientLastVisit(p.patientId);
    return last && last.ldlGoalAchieved === false;
  });
  const pendingIV = allInterventions.filter((iv) => iv.status === "pending" || iv.status === "pendiente");

  $("#dash_active").textContent = String(active.length);
  $("#dash_activePct").textContent = patients.length ? `de ${patients.length} registrados` : "";
  $("#dash_withVisits").textContent = String(withVisits.length);
  $("#dash_withVisitsPct").textContent = active.length
    ? `${Math.round((withVisits.length / active.length) * 100)}% de activos`
    : "";
  $("#dash_goalYes").textContent = String(goalYes.length);
  $("#dash_goalYesPct").textContent = withVisits.length
    ? `${Math.round((goalYes.length / withVisits.length) * 100)}% de visitados`
    : "";
  $("#dash_pendingIV").textContent = String(pendingIV.length);
  $("#dash_pendingIVHint").textContent = pendingIV.length === 1 ? "intervencion" : "intervenciones";

  // === Chart: LDL Goal donut ===
  const goalNd = withVisits.length - goalYes.length - goalNo.length;
  drawDonutChart("chartGoalDonut", "legendGoal", [
    { label: "Alcanzado", value: goalYes.length, color: "#2a9d6e" },
    { label: "No alcanzado", value: goalNo.length, color: "#d63a55" },
    { label: "Sin dato", value: goalNd, color: "#cbd5e1" },
  ], "pacientes");

  // === Chart: Stratification levels bar ===
  const byLevel = { 1: 0, 2: 0, 3: 0 };
  for (const p of active) {
    const last = patientLastVisit(p.patientId);
    const lvl = (last && last.priorityLevel) || p.priorityLevel || 3;
    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
  }
  drawDonutChart("chartLevelBar", "legendLevel", [
    { label: "Nivel 1 (alta)", value: byLevel[1], color: "#d63a55" },
    { label: "Nivel 2 (media)", value: byLevel[2], color: "#e0873b" },
    { label: "Nivel 3 (baja)", value: byLevel[3], color: "#2a9d6e" },
  ], "pacientes");

  // === Chart: By service / pathology (horizontal bars) ===
  const bySvc = {};
  for (const p of active) {
    const svc = p.prevalentCondition || "Sin asignar";
    bySvc[svc] = (bySvc[svc] || 0) + 1;
  }
  const svcEntries = Object.entries(bySvc).sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawBarChart("chartServiceBar", svcEntries.map(([k, v], i) => ({
    label: k, value: v, color: CHART_COLORS[i % CHART_COLORS.length],
  })), { horizontal: true });

  // === Chart: By treatment (vertical bars) ===
  const byTreat = {};
  for (const p of active) {
    const last = patientLastVisit(p.patientId);
    const drug = (last && last.hospitalDrug) || "Sin visita";
    if (drug !== "—") byTreat[drug] = (byTreat[drug] || 0) + 1;
  }
  const treatEntries = Object.entries(byTreat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawBarChart("chartTreatBar", treatEntries.map(([k, v], i) => ({
    label: k, value: v, color: CHART_COLORS[i % CHART_COLORS.length],
  })), { horizontal: true });

  // === Chart: LDL trend (average per visit ordinal) ===
  const patientVisitSeries = {};
  for (const v of allVisits) {
    if (v.ldl == null) continue;
    const ldl = Number(v.ldl);
    if (!Number.isFinite(ldl)) continue;
    if (!patientVisitSeries[v.patientId]) patientVisitSeries[v.patientId] = [];
    patientVisitSeries[v.patientId].push({ date: v.date, ldl });
  }
  // Sort each patient's visits by date
  for (const pid of Object.keys(patientVisitSeries)) {
    patientVisitSeries[pid].sort((a, b) => (a.date > b.date ? 1 : -1));
  }
  // Compute average LDL per visit ordinal (V1, V2, V3...)
  const maxVisitCount = Math.max(0, ...Object.values(patientVisitSeries).map((s) => s.length));
  const ldlTrendData = [];
  for (let i = 0; i < Math.min(maxVisitCount, 12); i++) {
    let sum = 0, count = 0;
    for (const pid of Object.keys(patientVisitSeries)) {
      if (patientVisitSeries[pid][i]) {
        sum += patientVisitSeries[pid][i].ldl;
        count++;
      }
    }
    if (count > 0) {
      ldlTrendData.push({ label: `V${i + 1}`, value: Math.round(sum / count) });
    }
  }
  drawLineChart("chartLDLTrend", ldlTrendData, { yLabel: "LDL medio (mg/dL)" });

  // === Chart: Interventions by type (Capacidad / Motivacion / Oportunidad) ===
  const ivByType = { Capacidad: 0, Motivacion: 0, Oportunidad: 0 };
  for (const iv of allInterventions) {
    const dim = iv.cmoDimension || iv.dimension || iv.type || "";
    if (dim.toLowerCase().includes("capac")) ivByType.Capacidad++;
    else if (dim.toLowerCase().includes("motiv")) ivByType.Motivacion++;
    else if (dim.toLowerCase().includes("oport")) ivByType.Oportunidad++;
  }
  drawDonutChart("chartIVType", "legendIVType", [
    { label: "Capacidad", value: ivByType.Capacidad, color: "#3b6de0" },
    { label: "Motivacion", value: ivByType.Motivacion, color: "#8b5cf6" },
    { label: "Oportunidad", value: ivByType.Oportunidad, color: "#06b6d4" },
  ], "intervenciones");

  // === Chart: Intervention status ===
  const ivByStatus = { accepted: 0, pending: 0, rejected: 0 };
  for (const iv of allInterventions) {
    const st = (iv.status || "").toLowerCase();
    if (st === "accepted" || st === "aceptada") ivByStatus.accepted++;
    else if (st === "pending" || st === "pendiente") ivByStatus.pending++;
    else if (st === "rejected" || st === "rechazada") ivByStatus.rejected++;
  }
  drawDonutChart("chartIVStatus", "legendIVStatus", [
    { label: "Aceptadas", value: ivByStatus.accepted, color: "#2a9d6e" },
    { label: "Pendientes", value: ivByStatus.pending, color: "#f59e0b" },
    { label: "Rechazadas", value: ivByStatus.rejected, color: "#d63a55" },
  ], "intervenciones");

  // === Chart: Adherence ===
  const adherenceMap = {};
  for (const p of active) {
    const last = patientLastVisit(p.patientId);
    if (!last) continue;
    const adh = last.adherence || last.adherencia || "Sin dato";
    adherenceMap[adh] = (adherenceMap[adh] || 0) + 1;
  }
  const adhColors = { "Buena": "#2a9d6e", "Regular": "#f59e0b", "Mala": "#d63a55", "Sin dato": "#cbd5e1" };
  const adhData = Object.entries(adherenceMap).map(([k, v]) => ({
    label: k, value: v, color: adhColors[k] || "#94a3b8",
  }));
  drawDonutChart("chartAdherence", "legendAdherence", adhData, "pacientes");

  // === Response table ===
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
    const lvl = (last && last.priorityLevel) || p.priorityLevel || 3;

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

// ---------------- Interventions view ----------------

function renderInterventions(statusFilter) {
  const all = APP.state.interventions;
  const accepted = all.filter((i) => i.status === "accepted");
  const pending = all.filter((i) => i.status === "pending");
  const rejected = all.filter((i) => i.status === "rejected");

  $("#iv_total").textContent = String(all.length);
  $("#iv_accepted").textContent = String(accepted.length);
  $("#iv_pending").textContent = String(pending.length);
  $("#iv_rejected").textContent = String(rejected.length);

  const decided = accepted.length + rejected.length;
  $("#iv_rate").textContent = decided > 0 ? Math.round((accepted.length / decided) * 100) + "%" : "—";

  const patientIds = new Set(all.map((i) => i.patientId));
  $("#iv_patients").textContent = String(patientIds.size);

  // By CMO dimension
  const byDim = {};
  for (const i of all) {
    const dim = i.cmoDimension || "Otra";
    if (!byDim[dim]) byDim[dim] = { accepted: 0, pending: 0, rejected: 0, total: 0 };
    byDim[dim].total++;
    if (i.status === "accepted") byDim[dim].accepted++;
    else if (i.status === "pending") byDim[dim].pending++;
    else if (i.status === "rejected") byDim[dim].rejected++;
  }
  const dimEntries = Object.entries(byDim);
  $("#iv_byDimension").innerHTML =
    `<div class="kv">` +
    dimEntries.map(([k, v]) =>
      `<div class="k">${esc(k)}</div>` +
      `<div class="v"><span class="chip ok">${v.accepted}</span> <span class="chip wait">${v.pending}</span> <span class="chip no">${v.rejected}</span></div>`
    ).join("") +
    `</div>`;

  // By intervention type
  const byType = {};
  for (const i of all) {
    const desc = i.description || "—";
    if (!byType[desc]) byType[desc] = { accepted: 0, pending: 0, rejected: 0, total: 0 };
    byType[desc].total++;
    if (i.status === "accepted") byType[desc].accepted++;
    else if (i.status === "pending") byType[desc].pending++;
    else if (i.status === "rejected") byType[desc].rejected++;
  }
  const typeEntries = Object.entries(byType).sort((a, b) => b[1].total - a[1].total);
  $("#iv_byType").innerHTML =
    `<div class="kv">` +
    typeEntries.map(([k, v]) =>
      `<div class="k">${esc(k)}</div>` +
      `<div class="v"><span class="chip ok">${v.accepted}</span> <span class="chip wait">${v.pending}</span> <span class="chip no">${v.rejected}</span></div>`
    ).join("") +
    `</div>`;

  // Table
  const filter = statusFilter || ($("#ivFilterStatus") && $("#ivFilterStatus").value) || "";
  const filtered = filter ? all.filter((i) => i.status === filter) : all;

  const tbody = $("#iv_tbody");
  tbody.innerHTML = "";
  for (const i of filtered) {
    const visit = APP.state.visits.find((v) => v.visitId === i.visitId);
    const dateStr = visit ? visit.date : "—";
    const statusLabel = i.status === "accepted" ? "Aceptada" : i.status === "pending" ? "Pendiente" : "Rechazada";
    const statusClass = i.status === "accepted" ? "ok" : i.status === "pending" ? "wait" : "no";

    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(i.patientId)}</td>` +
      `<td>${esc(dateStr)}</td>` +
      `<td>${esc(i.cmoDimension || "—")}</td>` +
      `<td>${esc(i.description || "—")}</td>` +
      `<td><span class="chip ${statusClass}">${statusLabel}</span></td>`;
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
  toast(`interventions.csv exportado (${rows.length} filas).`);
}

// --- CSV Template downloads (header + 1 example row) ---

function downloadPatientsTemplate() {
  const headers = CSV_SCHEMA.patients.map((f) => f.key);
  const example = {
    patientId: "PCSK9-000001", prevalentCondition: "PCSK9 / Dislipemia",
    sex: "M", birthYear: "1972", comorbidities: "DM2; ERC",
    notes: "Observaciones del caso", status: "active", createdAt: "", schemaVersion: "",
  };
  downloadText("patients_template.csv", toCSV([example], headers), "text/csv;charset=utf-8");
  toast("patients_template.csv descargada.");
}

function downloadVisitsTemplate() {
  const headers = CSV_SCHEMA.visits.map((f) => f.key);
  const example = {
    visitId: "V-PCSK9-000001-2026-02-20-abc123", patientId: "PCSK9-000001",
    date: "2026-02-20", hospitalDrug: "Evolocumab 140 mg",
    ldl: "55", ldlTarget: "55", ldlGoalAchieved: "true",
    treatment: "PCSK9 + estatina + ezetimiba", adherence: "Buena", ram: "",
    cmoScore: "18", priorityLevel: "2",
    priorityJustification: "No objetivo + baja adherencia",
    oftObjectives: "Reducir LDL <55 mg/dL", followUpPlan: "Revisión 3 meses",
    stratVars_json: "", createdAt: "", schemaVersion: "",
  };
  downloadText("visits_template.csv", toCSV([example], headers), "text/csv;charset=utf-8");
  toast("visits_template.csv descargada.");
}

function downloadInterventionsTemplate() {
  const headers = CSV_SCHEMA.interventions.map((f) => f.key);
  const example = {
    interventionId: "I-V-PCSK9-000001-2026-02-20-0-def456",
    patientId: "PCSK9-000001", visitId: "V-PCSK9-000001-2026-02-20-abc123",
    type: "CMO", cmoDimension: "Capacidad",
    description: "Educación sobre tratamiento",
    status: "accepted", outcomeNotes: "Paciente refiere comprensión correcta",
    createdAt: "", schemaVersion: "",
  };
  downloadText("interventions_template.csv", toCSV([example], headers), "text/csv;charset=utf-8");
  toast("interventions_template.csv descargada.");
}

// --- CSV Import: UI preview helpers ---

// Renders a result panel for a given entity ("patients"|"visits"|"interventions").
// result: { valid, errors, created, updated, extraCols }
function showImportPreview(entity, result) {
  const previewEl = document.getElementById(`impPreview_${entity}`);
  const statsEl   = document.getElementById(`impStats_${entity}`);
  const errorsEl  = document.getElementById(`impErrors_${entity}`);
  const applyBtn  = document.getElementById(`btnApply_${entity}`);
  if (!previewEl || !statsEl || !errorsEl) return;

  const { valid, errors, created, updated, extraCols } = result;

  let statsHtml =
    `<div class="impStatRow">` +
    `<span class="impStat impStat--ok"><b>${created}</b> nuevos</span>` +
    `<span class="impStat impStat--upd"><b>${updated}</b> actualizados</span>` +
    `<span class="impStat impStat--err"><b>${errors.length}</b> error${errors.length !== 1 ? "es" : ""}</span>` +
    `</div>`;

  if (extraCols.length) {
    statsHtml += `<div class="smallMuted" style="margin-top:6px">⚠ Columnas extra ignoradas: ${extraCols.map((c) => `<code class="inlineCode">${esc(c)}</code>`).join(", ")}</div>`;
  }
  statsEl.innerHTML = statsHtml;

  if (errors.length) {
    errorsEl.classList.remove("hidden");
    errorsEl.innerHTML =
      `<div class="impErrorTitle">${errors.length > 8 ? `Primeros 8 de ${errors.length} errores:` : `${errors.length} error(es):`}</div>` +
      errors.slice(0, 8).map((e) => `<div class="impErrorRow">${esc(e)}</div>`).join("");
  } else {
    errorsEl.classList.add("hidden");
    errorsEl.innerHTML = "";
  }

  previewEl.classList.remove("hidden");

  if (applyBtn) {
    applyBtn.disabled = valid.length === 0;
    applyBtn.textContent = `Aplicar (${valid.length} fila${valid.length !== 1 ? "s" : ""})`;
  }
}

function hideImportPreview(entity) {
  const el = document.getElementById(`impPreview_${entity}`);
  if (el) el.classList.add("hidden");
  APP.state.csvPending[entity] = null;
  // Reset the file input so the same file can be re-selected
  const fileInputId = { patients: "fileImportPatientsCSV", visits: "fileImportVisitsCSV", interventions: "fileImportInterventionsCSV" };
  const fi = document.getElementById(fileInputId[entity]);
  if (fi) fi.value = "";
}

// Parses and validates a CSV file, populates APP.state.csvPending[entity], shows preview.
// Referential integrity knownPatientIds / knownVisitIds are optional Sets for visit/intervention checks.
function _parseCsvAndPreview(entity, rawText, schema, buildRow, knownPatientIds, knownVisitIds) {
  const { headers, records } = parseCSV(rawText);
  if (!records.length) { toast("El CSV no contiene datos."); return; }

  const schemaKeys   = schema.map((f) => f.key);
  const requiredKeys = schema.filter((f) => f.required).map((f) => f.key);

  const missingRequired = requiredKeys.filter((k) => !headers.includes(k));
  if (missingRequired.length) {
    alert(`CSV inválido: faltan columnas obligatorias:\n${missingRequired.join(", ")}`);
    return;
  }

  const extraCols = headers.filter((h) => !schemaKeys.includes(h));
  const errors    = validateCSVImport(records, schema); // schema-level errors

  // Determine existing IDs for upsert stats
  const existingPatIds = new Set(APP.state.patients.map((p) => p.patientId));
  const existingVisIds = new Set(APP.state.visits.map((v) => v.visitId));
  const existingIvIds  = new Set(APP.state.interventions.map((i) => i.interventionId));

  // Row-error index for quick skip
  const rowsWithSchemaError = new Set(
    errors.map((e) => { const m = e.match(/^Fila (\d+):/); return m ? Number(m[1]) : -1; })
  );

  const valid   = [];
  let created   = 0;
  let updated   = 0;

  for (let i = 0; i < records.length; i++) {
    const rec    = records[i];
    const rowNum = i + 2;
    if (rowsWithSchemaError.has(rowNum)) continue;

    // Referential integrity for visits
    if (knownPatientIds && !knownPatientIds.has(rec.patientId)) {
      errors.push(`Fila ${rowNum}: patientId "${rec.patientId}" no existe en la BD ni en este lote.`);
      continue;
    }
    // Referential integrity for interventions
    if (knownVisitIds && !knownVisitIds.has(rec.visitId)) {
      errors.push(`Fila ${rowNum}: visitId "${rec.visitId}" no existe en la BD ni en este lote.`);
      continue;
    }
    if (knownVisitIds && knownPatientIds && !knownPatientIds.has(rec.patientId)) {
      errors.push(`Fila ${rowNum}: patientId "${rec.patientId}" no existe en la BD ni en este lote.`);
      continue;
    }

    const row = buildRow(rec);
    valid.push(row);

    // Count create vs update
    if (entity === "patients") {
      if (existingPatIds.has(row.patientId)) updated++; else created++;
    } else if (entity === "visits") {
      if (existingVisIds.has(row.visitId))   updated++; else created++;
    } else {
      if (existingIvIds.has(row.interventionId)) updated++; else created++;
    }
  }

  APP.state.csvPending[entity] = valid;
  showImportPreview(entity, { valid, errors, created, updated, extraCols });
}

// --- Prepare functions (parse → validate → store pending → show preview) ---

async function prepareImportPatientsCSV(file) {
  let rawText; try { rawText = await file.text(); } catch { return toast("Error leyendo archivo."); }
  const buildRow = (rec) => ({
    patientId:          rec.patientId,
    prevalentCondition: rec.prevalentCondition || "",
    sex:                rec.sex || null,
    birthYear:          rec.birthYear ? safeNum(rec.birthYear) : null,
    comorbidities:      rec.comorbidities || null,
    notes:              rec.notes || null,
    status:             rec.status || "active",
    stratVars: {}, cmoScore: 0, priorityLevel: 3,
    createdAt:          rec.createdAt || new Date().toISOString(),
    schemaVersion:      APP.schemaVersion,
  });
  _parseCsvAndPreview("patients", rawText, CSV_SCHEMA.patients, buildRow);
}

async function prepareImportVisitsCSV(file) {
  let rawText; try { rawText = await file.text(); } catch { return toast("Error leyendo archivo."); }
  // Known patient IDs: existing DB + any pending patients batch
  const knownPatIds = new Set([
    ...APP.state.patients.map((p) => p.patientId),
    ...(APP.state.csvPending.patients || []).map((p) => p.patientId),
  ]);
  const buildRow = (rec) => {
    let stratVars = {};
    if (rec.stratVars_json) { try { stratVars = JSON.parse(rec.stratVars_json); } catch {} }
    const goal = (rec.ldlGoalAchieved || "").toLowerCase();
    return {
      visitId:               rec.visitId,
      patientId:             rec.patientId,
      date:                  parseFlexDate(rec.date) || rec.date,
      hospitalDrug:          rec.hospitalDrug || "—",
      ldl:                   rec.ldl ? safeNum(rec.ldl) : null,
      ldlTarget:             rec.ldlTarget ? safeNum(rec.ldlTarget) : null,
      ldlGoalAchieved:       goal === "true" ? true : goal === "false" ? false : null,
      treatment:             rec.treatment || null,
      adherence:             rec.adherence || null,
      ram:                   rec.ram || null,
      cmoScore:              rec.cmoScore ? safeNum(rec.cmoScore) : 0,
      priorityLevel:         rec.priorityLevel ? safeNum(rec.priorityLevel) : 3,
      priorityJustification: rec.priorityJustification || null,
      oftObjectives:         rec.oftObjectives || null,
      followUpPlan:          rec.followUpPlan || null,
      nextVisitSuggested:    null,
      stratVars,
      createdAt:    rec.createdAt || new Date().toISOString(),
      schemaVersion: APP.schemaVersion,
    };
  };
  _parseCsvAndPreview("visits", rawText, CSV_SCHEMA.visits, buildRow, knownPatIds, null);
}

async function prepareImportInterventionsCSV(file) {
  let rawText; try { rawText = await file.text(); } catch { return toast("Error leyendo archivo."); }
  const knownPatIds = new Set([
    ...APP.state.patients.map((p) => p.patientId),
    ...(APP.state.csvPending.patients || []).map((p) => p.patientId),
  ]);
  const knownVisIds = new Set([
    ...APP.state.visits.map((v) => v.visitId),
    ...(APP.state.csvPending.visits || []).map((v) => v.visitId),
  ]);
  const buildRow = (rec) => ({
    interventionId: rec.interventionId,
    patientId:      rec.patientId,
    visitId:        rec.visitId,
    type:           rec.type || "CMO",
    cmoDimension:   rec.cmoDimension,
    description:    rec.description,
    status:         rec.status,
    outcomeNotes:   rec.outcomeNotes || null,
    createdAt:      rec.createdAt || new Date().toISOString(),
    schemaVersion:  APP.schemaVersion,
  });
  _parseCsvAndPreview("interventions", rawText, CSV_SCHEMA.interventions, buildRow, knownPatIds, knownVisIds);
}

// --- Apply functions (write pending batch to IndexedDB) ---

async function applyImportPatientsCSV() {
  const pending = APP.state.csvPending.patients;
  if (!pending?.length) return toast("Nada pendiente.");
  for (const p of pending) {
    await dbPut(APP.stores.patients, p);
    const idx = APP.state.patients.findIndex((x) => x.patientId === p.patientId);
    if (idx >= 0) APP.state.patients[idx] = p; else APP.state.patients.push(p);
  }
  hideImportPreview("patients");
  fillConditionSelectors(); updateStats(); renderPatientsTable();
  toast(`✔ ${pending.length} paciente(s) aplicados.`);
}

async function applyImportVisitsCSV() {
  const pending = APP.state.csvPending.visits;
  if (!pending?.length) return toast("Nada pendiente.");
  for (const v of pending) {
    await dbPut(APP.stores.visits, v);
    const idx = APP.state.visits.findIndex((x) => x.visitId === v.visitId);
    if (idx >= 0) APP.state.visits[idx] = v; else APP.state.visits.push(v);
  }
  hideImportPreview("visits");
  updateStats(); renderPatientsTable();
  if (APP.state.selectedPatientId) openPatient(APP.state.selectedPatientId);
  toast(`✔ ${pending.length} visita(s) aplicadas.`);
}

async function applyImportInterventionsCSV() {
  const pending = APP.state.csvPending.interventions;
  if (!pending?.length) return toast("Nada pendiente.");
  for (const iv of pending) {
    await dbPut(APP.stores.interventions, iv);
    const idx = APP.state.interventions.findIndex((x) => x.interventionId === iv.interventionId);
    if (idx >= 0) APP.state.interventions[idx] = iv; else APP.state.interventions.push(iv);
  }
  hideImportPreview("interventions");
  toast(`✔ ${pending.length} intervención/es aplicadas.`);
}

// --- Excel España export variants (semicolon + BOM) ---

async function exportPatientsCSVExcelES() {
  const rows = patientsForCSV();
  if (!rows.length) return toast("No hay pacientes para exportar.");
  const headers = CSV_SCHEMA.patients.map((f) => f.key);
  downloadText("patients_excelES.csv", toCSVExcelES(rows, headers), "text/csv;charset=utf-8");
  toast(`patients_excelES.csv exportado (${rows.length} filas).`);
}

async function exportVisitsCSVExcelES() {
  const rows = visitsForCSV();
  if (!rows.length) return toast("No hay visitas para exportar.");
  const headers = CSV_SCHEMA.visits.map((f) => f.key);
  downloadText("visits_excelES.csv", toCSVExcelES(rows, headers), "text/csv;charset=utf-8");
  toast(`visits_excelES.csv exportado (${rows.length} filas).`);
}

async function exportInterventionsCSVExcelES() {
  const rows = interventionsForCSV();
  if (!rows.length) return toast("No hay intervenciones para exportar.");
  const headers = CSV_SCHEMA.interventions.map((f) => f.key);
  downloadText("interventions_excelES.csv", toCSVExcelES(rows, headers), "text/csv;charset=utf-8");
  toast(`interventions_excelES.csv exportado (${rows.length} filas).`);
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
  $("#ivFilterStatus").addEventListener("change", () => renderInterventions());
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
  function bind(sel, handler) {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("click", handler);
  }
  function bindChange(sel, handler) {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("change", handler);
  }

  // --- CSV export (standard comma) ---
  bind("#btnExportPatientsCSV",      exportPatientsCSV);
  bind("#btnExportVisitsCSV",        exportVisitsCSV);
  bind("#btnExportInterventionsCSV", exportInterventionsCSV);

  // --- CSV export (Excel ES: semicolon + BOM) ---
  bind("#btnExportPatientsCSVES",      exportPatientsCSVExcelES);
  bind("#btnExportVisitsCSVES",        exportVisitsCSVExcelES);
  bind("#btnExportInterventionsCSVES", exportInterventionsCSVExcelES);

  // --- CSV templates ---
  bind("#btnTemplatePatients",      downloadPatientsTemplate);
  bind("#btnTemplateVisits",        downloadVisitsTemplate);
  bind("#btnTemplateInterventions", downloadInterventionsTemplate);

  // --- CSV import: phase 1 (parse + preview) ---
  const csvPrepareMap = [
    { sel: "#fileImportPatientsCSV",      fn: prepareImportPatientsCSV },
    { sel: "#fileImportVisitsCSV",        fn: prepareImportVisitsCSV },
    { sel: "#fileImportInterventionsCSV", fn: prepareImportInterventionsCSV },
  ];
  for (const { sel, fn } of csvPrepareMap) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.addEventListener("change", (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      fn(f);
      // keep ev.target.value so the same file can be re-selected after cancel
    });
  }

  // --- CSV import: phase 2 (apply) ---
  bind("#btnApply_patients",      applyImportPatientsCSV);
  bind("#btnApply_visits",        applyImportVisitsCSV);
  bind("#btnApply_interventions", applyImportInterventionsCSV);

  // --- CSV import: cancel (hide preview) ---
  bind("#btnCancel_patients",      () => hideImportPreview("patients"));
  bind("#btnCancel_visits",        () => hideImportPreview("visits"));
  bind("#btnCancel_interventions", () => hideImportPreview("interventions"));

  // --- JSON backup / restore ---
  bind("#btnBackupJSON",  backupJSON);
  bind("#btnQuickBackup", backupJSON);
  bindChange("#fileImportJSON", (ev) => {
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
