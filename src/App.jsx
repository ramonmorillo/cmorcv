import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, RefreshCcw } from 'lucide-react';
import { KpiCard } from './components/KpiCard';
import { SectionTable } from './components/SectionTable';
import { supabase } from './lib/supabase';

function normalizeLevel(value) {
  if (value == null) return null;
  const numeric = Number(String(value).replace(/[^0-9]/g, ''));
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 3) return numeric;

  const normalized = String(value).toLowerCase();
  if (normalized.includes('nivel 1') || normalized.includes('level 1')) return 1;
  if (normalized.includes('nivel 2') || normalized.includes('level 2')) return 2;
  if (normalized.includes('nivel 3') || normalized.includes('level 3')) return 3;
  return null;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function isPendingVisit(visit, now) {
  const status = String(visit.status ?? visit.visit_status ?? '').toLowerCase();
  const scheduled = visit.scheduled_date ?? visit.next_visit_date ?? visit.visit_date;
  const date = scheduled ? new Date(scheduled) : null;

  return (
    status.includes('pending') ||
    status.includes('scheduled') ||
    status.includes('programada') ||
    (date && !Number.isNaN(date.getTime()) && date >= now)
  );
}

function isOverdueVisit(visit, now) {
  const status = String(visit.status ?? visit.visit_status ?? '').toLowerCase();
  const dueDate = visit.next_visit_date ?? visit.followup_due_date ?? visit.scheduled_date;
  const date = dueDate ? new Date(dueDate) : null;

  return Boolean(
    date &&
      !Number.isNaN(date.getTime()) &&
      date < now &&
      !status.includes('completed') &&
      !status.includes('completada'),
  );
}

function has12MonthCompletion(visit) {
  const status = String(visit.status ?? visit.visit_status ?? '').toLowerCase();
  const type = String(visit.visit_type ?? visit.type ?? '').toLowerCase();
  return (
    visit.followup_12m_completed === true ||
    visit.completed_12m_followup === true ||
    (status.includes('completed') && (type.includes('12') || type.includes('12m') || type.includes('12 month')))
  );
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');

    const [patientsRes, visitsRes, interventionsRes] = await Promise.all([
      supabase
        .from('patients')
        .select('id, patient_id, full_name, status, level, risk_level, current_level, updated_at, created_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('visits')
        .select('id, patient_id, status, visit_status, visit_type, visit_date, scheduled_date, next_visit_date, followup_due_date, followup_12m_completed, completed_12m_followup, updated_at, created_at')
        .order('visit_date', { ascending: false }),
      supabase
        .from('interventions')
        .select('id, patient_id, intervention_type, description, status, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    const maybeError = patientsRes.error || visitsRes.error || interventionsRes.error;
    if (maybeError) {
      setError(maybeError.message);
      setLoading(false);
      return;
    }

    setPatients(patientsRes.data ?? []);
    setVisits(visitsRes.data ?? []);
    setInterventions(interventionsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();
    const activePatients = patients.filter((patient) => {
      const status = String(patient.status ?? '').toLowerCase();
      return status !== 'inactive' && status !== 'inactiva';
    });

    const levelCounts = activePatients.reduce(
      (acc, patient) => {
        const level = normalizeLevel(patient.level ?? patient.risk_level ?? patient.current_level);
        if (level === 1) acc.level1 += 1;
        if (level === 2) acc.level2 += 1;
        if (level === 3) acc.level3 += 1;
        return acc;
      },
      { level1: 0, level2: 0, level3: 0 },
    );

    const pendingVisits = visits.filter((visit) => isPendingVisit(visit, now));
    const overdueVisits = visits.filter((visit) => isOverdueVisit(visit, now));
    const completed12m = visits.filter(has12MonthCompletion);

    const byPatientId = new Map(
      patients.map((patient) => [String(patient.id ?? patient.patient_id), patient.full_name ?? patient.patient_id ?? patient.id]),
    );

    const upcomingRows = pendingVisits
      .map((visit) => ({
        id: visit.id,
        patient: byPatientId.get(String(visit.patient_id)) ?? String(visit.patient_id ?? '—'),
        scheduled: formatDate(visit.scheduled_date ?? visit.next_visit_date ?? visit.visit_date),
        status: visit.status ?? visit.visit_status ?? 'Pending',
      }))
      .slice(0, 8);

    const overdueRows = overdueVisits
      .map((visit) => ({
        id: visit.id,
        patient: byPatientId.get(String(visit.patient_id)) ?? String(visit.patient_id ?? '—'),
        dueDate: formatDate(visit.next_visit_date ?? visit.followup_due_date ?? visit.scheduled_date),
        status: visit.status ?? visit.visit_status ?? 'Overdue',
      }))
      .slice(0, 8);

    const interventionRows = interventions.map((entry) => ({
      id: entry.id,
      patient: byPatientId.get(String(entry.patient_id)) ?? String(entry.patient_id ?? '—'),
      type: entry.intervention_type ?? 'Clinical intervention',
      summary: entry.description ?? 'No description',
      date: formatDate(entry.created_at),
    }));

    return {
      activePatients: activePatients.length,
      pendingVisits: pendingVisits.length,
      ...levelCounts,
      completed12m: completed12m.length,
      upcomingRows,
      overdueRows,
      interventionRows,
    };
  }, [patients, visits, interventions]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-med-50 via-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-med-100 bg-white/90 p-6 shadow-card md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-med-900 sm:text-3xl">CMORCVTESIS Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Real-time patient follow-up intelligence powered by Supabase.</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-med-200 bg-med-100 px-4 py-2 text-sm font-semibold text-med-700 transition hover:bg-med-600 hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh data
          </button>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Failed to load Supabase data: {error}
          </div>
        ) : null}

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard title="Active patients" value={loading ? '…' : dashboard.activePatients} helper="Status excluding inactive" />
          <KpiCard title="Pending visits" value={loading ? '…' : dashboard.pendingVisits} helper="Scheduled / pending follow-ups" />
          <KpiCard title="Level 1 patients" value={loading ? '…' : dashboard.level1} helper="Highest priority tier" />
          <KpiCard title="Level 2 patients" value={loading ? '…' : dashboard.level2} helper="Medium priority tier" />
          <KpiCard title="Level 3 patients" value={loading ? '…' : dashboard.level3} helper="Lower priority tier" />
          <KpiCard title="Completed 12 month follow-up" value={loading ? '…' : dashboard.completed12m} helper="Documented annual closure" />
        </section>

        <div className="grid grid-cols-1 gap-6">
          <SectionTable
            title="Upcoming visits"
            subtitle="Patients expected for the next care actions"
            columns={[
              { key: 'patient', label: 'Patient' },
              { key: 'scheduled', label: 'Scheduled date' },
              { key: 'status', label: 'Status' },
            ]}
            rows={dashboard.upcomingRows}
            emptyLabel="No upcoming visits found."
          />

          <SectionTable
            title="Overdue visits"
            subtitle="Follow-up tasks that need immediate action"
            columns={[
              { key: 'patient', label: 'Patient' },
              { key: 'dueDate', label: 'Due date' },
              { key: 'status', label: 'Status' },
            ]}
            rows={dashboard.overdueRows}
            emptyLabel="No overdue visits found."
          />

          <SectionTable
            title="Recent interventions"
            subtitle="Latest pharmacy/clinical interventions performed"
            columns={[
              { key: 'patient', label: 'Patient' },
              { key: 'type', label: 'Intervention' },
              { key: 'summary', label: 'Summary' },
              { key: 'date', label: 'Date' },
            ]}
            rows={dashboard.interventionRows}
            emptyLabel="No interventions available yet."
          />
        </div>

        <footer className="mt-8 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            Optimized for clinical operations
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            Responsive and fast-loading
          </span>
        </footer>
      </div>
    </div>
  );
}
