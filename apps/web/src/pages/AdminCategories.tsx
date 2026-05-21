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
  const [newParentId, setNewParentId] = useState<string>('');
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
        .insert({ department: dept, name: newName.trim(), parent_id: newParentId || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName('');
      setNewParentId('');
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
    const g: Record<Department, { parent: CategoryRow; children: CategoryRow[] }[]> = {
      IT: [],
      FAC: [],
      HS: [],
    };
    const byParent = new Map<string, CategoryRow[]>();
    for (const c of q.data ?? []) {
      if (c.parent_id) {
        const arr = byParent.get(c.parent_id) ?? [];
        arr.push(c);
        byParent.set(c.parent_id, arr);
      }
    }
    for (const c of q.data ?? []) {
      if (!c.parent_id) g[c.department].push({ parent: c, children: byParent.get(c.id) ?? [] });
    }
    return g;
  }, [q.data]);

  const parentsForDept = useMemo(
    () => (q.data ?? []).filter((c) => c.department === dept && c.parent_id === null && c.is_active),
    [q.data, dept],
  );

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
            onChange={(e) => {
              setDept(e.target.value as Department);
              setNewParentId('');
            }}
            className="field-select"
          >
            {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cat-parent" className="field-label">
            Parent (optional)
          </label>
          <select
            id="cat-parent"
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="field-select"
          >
            <option value="">— Top-level category —</option>
            {parentsForDept.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="cat-new" className="field-label">
            {newParentId ? 'New subcategory name' : 'New category name'}
          </label>
          <input
            id="cat-new"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="field"
            placeholder={newParentId ? 'e.g. Toner replacement' : 'e.g. Network / Wi-Fi'}
          />
        </div>
        <button
          type="submit"
          disabled={!newName.trim() || create.isPending}
          className="btn-primary"
        >
          {newParentId ? 'Add subcategory' : 'Add category'}
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
              {grouped[d].map(({ parent, children }) => (
                <li key={parent.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={parent.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== parent.name) update.mutate({ id: parent.id, name: v });
                      }}
                      className={`field-sm flex-1 font-medium ${parent.is_active ? '' : 'text-slate-400 line-through'}`}
                    />
                    <button
                      onClick={() => update.mutate({ id: parent.id, is_active: !parent.is_active })}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                    >
                      {parent.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  {children.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
                      {children.map((sub) => (
                        <li key={sub.id} className="flex items-center gap-2">
                          <input
                            defaultValue={sub.name}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== sub.name) update.mutate({ id: sub.id, name: v });
                            }}
                            className={`field-sm flex-1 text-xs ${sub.is_active ? '' : 'text-slate-400 line-through'}`}
                          />
                          <button
                            onClick={() => update.mutate({ id: sub.id, is_active: !sub.is_active })}
                            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100"
                          >
                            {sub.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
