import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { DEPARTMENT_LABEL, type Department } from '../lib/types';

type RangePreset = 7 | 30 | 'custom';

type FlowRow = { day: string; department: string; opened: number; closed: number };
type Kpis = {
  new_tickets: number;
  new_tickets_prev: number;
  open_tickets: number;
  unassigned: number;
  resolved_tickets: number;
  resolved_prev: number;
};
type CategoryRow = { category: string; department: string; n: number };

const DEPT_COLORS: Record<Department, string> = {
  IT: '#f59e0b',
  FAC: '#0ea5e9',
  HS: '#10b981',
};
const CATEGORY_COLORS = [
  '#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6', '#ef4444', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#a855f7', '#06b6d4',
];

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeBounds(days: 7 | 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

function DeltaArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const delta = current - previous;
  const positive = delta >= 0;
  return (
    <span
      className={`ml-2 text-sm font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}
      title={`Previous period: ${previous}`}
    >
      {positive ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

function KpiTile({
  label,
  value,
  previous,
  to,
}: {
  label: string;
  value: number;
  previous?: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="card-pad block transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 flex items-baseline text-3xl font-semibold text-slate-900">
        {value}
        {previous !== undefined && <DeltaArrow current={value} previous={previous} />}
      </p>
      <p className="mt-3 text-xs font-medium text-brand-navy">View tickets →</p>
    </Link>
  );
}

export default function Dashboard() {
  const initialRange = rangeBounds(7);
  const [range, setRange] = useState<RangePreset>(7);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [draftFrom, setDraftFrom] = useState(initialRange.from);
  const [draftTo, setDraftTo] = useState(initialRange.to);
  const [rangeError, setRangeError] = useState<string | null>(null);

  function selectPreset(days: 7 | 30) {
    const bounds = rangeBounds(days);
    setRange(days);
    setFrom(bounds.from);
    setTo(bounds.to);
    setDraftFrom(bounds.from);
    setDraftTo(bounds.to);
    setRangeError(null);
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) {
      setRangeError('Select both a start date and an end date.');
      return;
    }
    if (draftFrom > draftTo) {
      setRangeError('The start date must be on or before the end date.');
      return;
    }
    const days = Math.floor((Date.parse(draftTo) - Date.parse(draftFrom)) / 86_400_000) + 1;
    if (days > 180) {
      setRangeError('Select a range of 180 days or fewer.');
      return;
    }
    setRange('custom');
    setFrom(draftFrom);
    setTo(draftTo);
    setRangeError(null);
  }

  const kpisQ = useQuery({
    queryKey: ['dashboard-kpis', from, to],
    queryFn: async (): Promise<Kpis> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('dashboard_kpis', {
        from_date: from,
        to_date: to,
      });
      if (error) throw error;
      return (data?.[0] ?? {
        new_tickets: 0, new_tickets_prev: 0,
        open_tickets: 0, unassigned: 0,
        resolved_tickets: 0, resolved_prev: 0,
      }) as Kpis;
    },
  });

  const flowQ = useQuery({
    queryKey: ['dashboard-flow', from, to],
    queryFn: async (): Promise<FlowRow[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('dashboard_ticket_flow', {
        from_date: from,
        to_date: to,
      });
      if (error) throw error;
      return (data ?? []) as FlowRow[];
    },
  });

  const categoryQ = useQuery({
    queryKey: ['dashboard-categories', from, to],
    queryFn: async (): Promise<CategoryRow[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('dashboard_category_breakdown', {
        from_date: from,
        to_date: to,
      });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  // Pivot the daily flow into one row per day with one column per department
  // (so the line chart can render an opened/closed line per dept).
  const flowByDay = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const r of flowQ.data ?? []) {
      const existing = map.get(r.day) ?? { day: r.day };
      existing[`${r.department}_opened`] = r.opened;
      existing[`${r.department}_closed`] = r.closed;
      map.set(r.day, existing);
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [flowQ.data]);

  const churnTotals = useMemo(() => {
    const byDay = new Map<string, { day: string; opened: number; closed: number }>();
    for (const r of flowQ.data ?? []) {
      const row = byDay.get(r.day) ?? { day: r.day, opened: 0, closed: 0 };
      row.opened += r.opened;
      row.closed += r.closed;
      byDay.set(r.day, row);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [flowQ.data]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of categoryQ.data ?? []) {
      map.set(r.category, (map.get(r.category) ?? 0) + Number(r.n));
    }
    return Array.from(map.entries()).map(([category, n]) => ({ category, n }));
  }, [categoryQ.data]);

  const errMsg =
    (kpisQ.error as Error | null)?.message ??
    (flowQ.error as Error | null)?.message ??
    (categoryQ.error as Error | null)?.message ??
    null;
  const drilldownUrl = (metric: 'new' | 'open' | 'unassigned' | 'resolved') =>
    `/queue?view=${metric}&from=${from}&to=${to}`;

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Tech-team view of ticket activity.</p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => selectPreset(days)}
                className={
                  'rounded px-3 py-1.5 ' +
                  (range === days
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900')
                }
              >
                Last {days} days
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="dashboard-from" className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">
              From
            </label>
            <input
              id="dashboard-from"
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="field-sm"
            />
          </div>
          <div>
            <label htmlFor="dashboard-to" className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">
              To
            </label>
            <input
              id="dashboard-to"
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              max={isoDate(new Date())}
              onChange={(event) => setDraftTo(event.target.value)}
              className="field-sm"
            />
          </div>
          <button type="button" onClick={applyCustomRange} className="btn-primary px-4 py-2">
            Apply
          </button>
        </div>
      </div>

      {rangeError && <p className="mb-4 alert-error">{rangeError}</p>}
      {errMsg && <p className="mb-4 alert-error">{errMsg}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile
          label="New tickets"
          value={kpisQ.data?.new_tickets ?? 0}
          previous={kpisQ.data?.new_tickets_prev}
          to={drilldownUrl('new')}
        />
        <KpiTile
          label="Open at period end"
          value={kpisQ.data?.open_tickets ?? 0}
          to={drilldownUrl('open')}
        />
        <KpiTile
          label="Unassigned at period end"
          value={kpisQ.data?.unassigned ?? 0}
          to={drilldownUrl('unassigned')}
        />
        <KpiTile
          label="Resolved"
          value={kpisQ.data?.resolved_tickets ?? 0}
          previous={kpisQ.data?.resolved_prev}
          to={drilldownUrl('resolved')}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card-pad lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Ticket history
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flowByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {(Object.keys(DEPT_COLORS) as Department[]).map((d) => (
                  <Line
                    key={`${d}_opened`}
                    type="monotone"
                    dataKey={`${d}_opened`}
                    name={`${DEPARTMENT_LABEL[d]} opened`}
                    stroke={DEPT_COLORS[d]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
                {(Object.keys(DEPT_COLORS) as Department[]).map((d) => (
                  <Line
                    key={`${d}_closed`}
                    type="monotone"
                    dataKey={`${d}_closed`}
                    name={`${DEPARTMENT_LABEL[d]} closed`}
                    stroke={DEPT_COLORS[d]}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Category breakdown
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryTotals}
                  dataKey="n"
                  nameKey="category"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {categoryTotals.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-pad lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Ticket churn (opened vs closed)
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={churnTotals} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="day" type="category" width={90} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="opened" name="Opened" fill="#f59e0b" />
                <Bar dataKey="closed" name="Closed" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
