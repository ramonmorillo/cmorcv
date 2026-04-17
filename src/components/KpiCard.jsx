import { TrendingUp } from 'lucide-react';

export function KpiCard({ title, value, helper }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <TrendingUp className="h-4 w-4 text-med-600" />
      </div>
      <p className="text-3xl font-bold text-med-900">{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-500">{helper}</p> : null}
    </article>
  );
}
