import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DEPARTMENT_LABEL, type Category, type Department } from '../lib/types';

type CategoryRow = Category & { is_active: boolean };

export default function AdminCategories() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [dept, setDept] = useState<Department>('IT');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async (): Promise<CategoryRow[]> => {
      if (!supabase) throw new Error('not ready');
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('department')
        .order('name');
      if (error) throw error;
      return data as CategoryRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('not ready');
      const { error } = await supabase
        .from('categories')
        .insert({ department: dept, name: newName.trim(), parent_id: null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName('');
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: async (patch: { id: string; name?: string; is_active?: boolean }) => {
      if (!supabase) throw new Error('not ready');
      const { id, ...fields } = patch;
      const { error } = await supabase.from('categories').update(fields).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
    onError: (e: Error) => setError(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<Department, CategoryRow[]> = { IT: [], FAC: [], HS: [] };
    for (const c of q.data ?? []) g[c.department].push(c);
    return g;
  }, [q.data]);

  if (!isManager) return <p className="alert-warn">Manager or admin only.</p>;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="page-title">Categories</h1>
        <p className="page-subtitle">
          Add or retire categories per department. Existing tickets keep their assignment.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (newName.trim()) create.mutate();
        }}
        className="card flex flex-wrap items-end gap-3 p-6"
      >
        <div>
          <label htmlFor="cat-dept" className="field-label">
            Department
          </label>
          <select
            id="cat-dept"
            value={dept}
            onChange={(e) => setDept(e.target.value as Department)}
            className="field-select"
          >
            {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="cat-new" className="field-label">
            New category name
          </label>
          <input
            id="cat-new"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="field"
            placeholder="e.g. Network / Wi-Fi"
          />
        </div>
        <button
          type="submit"
          disabled={!newName.trim() || create.isPending}
          className="btn-primary"
        >
          Add category
        </button>
      </form>

      {error && <p className="alert-error">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(grouped) as Department[]).map((d) => (
          <div key={d} className="card overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-brand-navy">
              {DEPARTMENT_LABEL[d]}{' '}
              <span className="text-xs font-normal text-slate-400">({grouped[d].length})</span>
            </h2>
            <ul className="divide-y divide-slate-100">
              {grouped[d].map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name) update.mutate({ id: c.id, name: v });
                    }}
                    className={`field-sm flex-1 ${c.is_active ? '' : 'text-slate-400 line-through'}`}
                  />
                  <button
                    onClick={() => update.mutate({ id: c.id, is_active: !c.is_active })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </li>
              ))}
              {grouped[d].length === 0 && (
                <li className="px-4 py-4 text-center text-xs text-slate-400">
                  No categories yet.
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
