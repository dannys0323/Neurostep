/* ====== Datos clínicos cargados desde Supabase ====== */
let PATIENTS = [];

function mapSupabasePatient(row){
  const assessments = [...(row.clinical_assessments || [])]
    .sort((a, b) => `${a.assessment_date}T${a.created_at}`.localeCompare(`${b.assessment_date}T${b.created_at}`));
  const latest = assessments[assessments.length - 1] || {};
  const observations = [...(row.patient_observations || [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(item => ({
      id: item.id,
      date: item.created_at,
      author: item.doctor_profiles?.full_name || "Doctor",
      text: item.observation
    }));
  const images = (row.patient_images || []).map(item => ({
    id: item.id,
    url: item.image_url,
    date: fmtDate(item.image_date),
    note: item.note || ""
  }));
  const risk = Number(latest.risk_score) || 0;
  const neuro = NEURO[latest.neuropathy] || NEURO.none;

  return {
    id: row.id,
    fullName: esc(row.full_name),
    name: esc(shortName(row.full_name)),
    age: calcAge(row.date_of_birth),
    sex: esc(row.sex || "No especificado"),
    dob: fmtDate(row.date_of_birth),
    phone: esc(row.phone) || "—",
    weight: Number(row.weight_kg) || 0,
    height: Number(row.height_m) || 0,
    diabetes: esc(row.diabetes || "No especificado"),
    risk,
    color: riskColor(risk),
    neuro: neuro.neuro,
    neuroLabel: neuro.label,
    lastDate: latest.assessment_date ? fmtDate(latest.assessment_date) : "Sin registro",
    tests: {
      monofilamento: latest.monofilament_result || "—",
      vibracion: latest.vibration_result || "—",
      reflejos: latest.reflexes_result || "—"
    },
    pressure: {
      L: {
        toes: Number(latest.left_toes) || 0, medial: Number(latest.left_medial) || 0,
        lateral: Number(latest.left_lateral) || 0, mid: Number(latest.left_midfoot) || 0,
        heel: Number(latest.left_heel) || 0
      },
      R: {
        toes: Number(latest.right_toes) || 0, medial: Number(latest.right_medial) || 0,
        lateral: Number(latest.right_lateral) || 0, mid: Number(latest.right_midfoot) || 0,
        heel: Number(latest.right_heel) || 0
      }
    },
    history: assessments.map(item => ({
      id: item.id,
      date: fmtDate(item.assessment_date),
      risk: Number(item.risk_score),
      note: item.note || ""
    })),
    observations,
    images,
    notes: row.notes || ""
  };
}

async function loadPatientsFromSupabase(){
  const rows = await window.supabaseApp.getPatients();
  PATIENTS = rows.map(mapSupabasePatient);
  return PATIENTS;
}

/* ---------- Utilidades ---------- */
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function downloadCsv(filename, headers, rows){
  const escapeCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const content = [headers, ...rows].map(row => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function riskColor(r){ return r < 4 ? "green" : r <= 7 ? "orange" : "red"; }

function patientReviewPriority(patient){
  const risk = Number(patient?.risk) || 0;
  return risk > 7 ? 0 : risk >= 4 ? 1 : 2;
}

function patientLastReviewTime(patient){
  const value = String(patient?.lastDate || patient?.date || "");
  let parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

  parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (parts) return Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));

  return 0;
}

function comparePatientsForReview(a, b){
  return patientReviewPriority(a) - patientReviewPriority(b)
    || patientLastReviewTime(a) - patientLastReviewTime(b)
    || (Number(b.risk) || 0) - (Number(a.risk) || 0);
}

function fmtDate(iso){
  if (!iso || !String(iso).includes("-")) return "Sin fecha";
  const [y,m,d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
}

function calcAge(iso){
  if (!iso) return 0;
  const b = new Date(iso), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

function shortName(full){
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  return parts.length < 2 ? parts[0] : `${parts[0][0].toUpperCase()}. ${parts[parts.length-1]}`;
}

const NEURO = {
  none:     { neuro:"ok",   label:"Sin neuropatía" },
  mild:     { neuro:"warn", label:"Neuropatía leve" },
  moderate: { neuro:"warn", label:"Neuropatía moderada" },
  severe:   { neuro:"bad",  label:"Neuropatía severa" }
};

/* ---------- Operaciones ---------- */
async function addPatient(d){
  const full = String(d?.fullName || "").trim();
  if (!full) return null;

  const client = await window.supabaseApp.ready();
  const {data: authData, error: authError} = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Inicia sesión antes de registrar pacientes.");

  const {data: patient, error} = await client.from("patients").insert({
    doctor_id: authData.user.id,
    full_name: full,
    date_of_birth: d.dob,
    sex: d.sex || "No especificado",
    phone: String(d.phone || "").trim() || null,
    weight_kg: Number(d.weight) || null,
    height_m: Number(d.height) || null,
    diabetes: d.diabetes || "No especificado",
    notes: String(d.notes || "").trim() || null
  }).select("id").single();
  if (error) throw error;

  const {error: assessmentError} = await client.from("clinical_assessments").insert({
    patient_id: patient.id,
    performed_by: authData.user.id,
    assessment_date: d.date,
    risk_score: Number(d.risk) || 0,
    neuropathy: d.neuro || "none",
    monofilament_result: String(d.tests?.monofilamento || "").trim() || null,
    vibration_result: String(d.tests?.vibracion || "").trim() || null,
    reflexes_result: String(d.tests?.reflejos || "").trim() || null,
    note: String(d.notes || "").trim() || "Primer registro."
  });
  if (assessmentError) {
    const {error: rollbackError} = await client.from("patients").delete().eq("id", patient.id);
    if (rollbackError) console.error("No se pudo revertir el paciente sin evaluación inicial:", rollbackError);
    throw assessmentError;
  }

  await loadPatientsFromSupabase();
  return PATIENTS.find(item => item.id === patient.id) || null;
}

async function addRecord(id, r){
  const risk = Number(r.risk);
  if (!Number.isFinite(risk) || risk < 0 || risk > 10) return null;

  const client = await window.supabaseApp.ready();
  const {data: authData, error: authError} = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Inicia sesión antes de guardar evaluaciones.");

  const {error} = await client.from("clinical_assessments").insert({
    patient_id: id,
    performed_by: authData.user.id,
    assessment_date: r.date,
    risk_score: risk,
    neuropathy: r.neuro || "none",
    monofilament_result: String(r.tests?.monofilamento || "").trim() || null,
    vibration_result: String(r.tests?.vibracion || "").trim() || null,
    reflexes_result: String(r.tests?.reflejos || "").trim() || null,
    note: String(r.note || "").trim() || null
  });
  if (error) throw error;

  await loadPatientsFromSupabase();
  return PATIENTS.find(patient => patient.id === id) || null;
}

async function updatePatientDemographics(id, details){
  const fullName = String(details?.fullName || "").trim();
  if (!fullName || !details?.dob) return null;

  const client = await window.supabaseApp.ready();
  const {error} = await client.from("patients").update({
    full_name: fullName,
    date_of_birth: details.dob,
    sex: details.sex || "No especificado",
    phone: String(details.phone || "").trim() || null,
    diabetes: details.diabetes || "No especificado"
  }).eq("id", id);
  if (error) throw error;

  await loadPatientsFromSupabase();
  return PATIENTS.find(patient => patient.id === id) || null;
}

function patientDobForInput(patient){
  const value = String(patient?.dob || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : "";
}

async function deletePatient(id){
  if (!PATIENTS.some(patient => patient.id === id)) return false;

  const client = await window.supabaseApp.ready();
  const {error} = await client.from("patients").delete().eq("id", id);
  if (error) throw error;
  PATIENTS = PATIENTS.filter(patient => patient.id !== id);
  return true;
}

async function addPatientObservation(id, text, author){
  const observationText = String(text || "").trim();
  if (!PATIENTS.some(patient => patient.id === id) || !observationText) return null;

  const client = await window.supabaseApp.ready();
  const {data: authData, error: authError} = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Inicia sesión antes de guardar observaciones.");
  const {data, error} = await client.from("patient_observations").insert({
    patient_id: id,
    author_id: authData.user.id,
    observation: observationText
  }).select("id, created_at").single();
  if (error) throw error;

  const observation = {
    id: data.id,
    date: data.created_at,
    author: String(author || "Doctor"),
    text: observationText
  };
  const patient = PATIENTS.find(item => item.id === id);
  patient.observations.push(observation);
  return observation;
}
