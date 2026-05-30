import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Combobox } from '../components/Combobox';
import {
  DEPARTMENT_LABEL,
  type Category,
  type Department,
  type KbArticle,
  type Location,
} from '../lib/types';

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
];

type KbHit = Pick<KbArticle, 'id' | 'slug' | 'title' | 'summary' | 'department' | 'tags'>;

export default function NewTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [department, setDepartment] = useState<Department>('IT');
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce the subject so KB lookups don't fire on every keystroke.
  const [debouncedSubject, setDebouncedSubject] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSubject(subject.trim()), 300);
    return () => clearTimeout(t);
  }, [subject]);

  // Generate / revoke object URLs as the picked image list changes.
  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Category[];
    },
  });

  const locationsQ = useQuery({
    queryKey: ['locations'],
    queryFn: async (): Promise<Location[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('building');
      if (error) throw error;
      return data as Location[];
    },
  });

  // Knowledge-base lookahead: search published articles based on the subject
  // (and optionally department) so the submitter can self-serve before filing.
  const kbQ = useQuery({
    queryKey: ['kb-suggest', debouncedSubject, department],
    enabled: debouncedSubject.length >= 3,
    queryFn: async (): Promise<KbHit[]> => {
      if (!supabase) return [];
      const q = debouncedSubject;
      const tokens = q
        .split(/\s+/)
        .map((t) => t.replace(/[%_,()]/g, ''))
        .filter((t) => t.length >= 2);

      const select = 'id, slug, title, summary, department, tags';

      // Try websearch full-text first — handles multi-word queries with ranking.
      let primary: KbHit[] = [];
      try {
        const { data } = await supabase
          .from('kb_articles')
          .select(select)
          .eq('status', 'published')
          .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
          .limit(8);
        primary = (data ?? []) as KbHit[];
      } catch {
        primary = [];
      }

      // Fall back to ilike on title/summary so typo-ish or partial words still
      // surface something useful (search_tsv uses strict English stemming).
      let fallback: KbHit[] = [];
      if (primary.length < 5 && tokens.length > 0) {
        const orClause = tokens
          .flatMap((tok) => [`title.ilike.%${tok}%`, `summary.ilike.%${tok}%`])
          .join(',');
        try {
          const { data } = await supabase
            .from('kb_articles')
            .select(select)
            .eq('status', 'published')
            .or(orClause)
            .limit(8);
          fallback = (data ?? []) as KbHit[];
        } catch {
          fallback = [];
        }
      }

      const seen = new Set<string>();
      const merged: KbHit[] = [];
      for (const a of [...primary, ...fallback]) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        merged.push(a);
        if (merged.length >= 6) break;
      }
      // Lightly prefer same-department articles at the top.
      merged.sort((a, b) => {
        const aDept = a.department === department ? 0 : 1;
        const bDept = b.department === department ? 0 : 1;
        return aDept - bDept;
      });
      return merged;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!supabase || !user) throw new Error('Not ready');

      const { data: ticket, error: insertErr } = await supabase
        .from('tickets')
        .insert({
          department,
          category_id: categoryId || null,
          subcategory_id: subcategoryId || null,
          location_id: locationId || null,
          subject,
          description,
          submitter_id: user.id,
        })
        .select('id, ref')
        .single();
      if (insertErr) throw insertErr;

      // Upload any picked images, then write attachment rows. Failures here
      // are non-fatal for ticket creation — log and continue so the user
      // doesn't lose the ticket they just filed.
      if (images.length > 0) {
        const uploaded: { storage_path: string; mime_type: string; size_bytes: number }[] = [];
        for (const file of images) {
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
          const path = `tickets/${ticket.id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('attachments')
            .upload(path, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });
          if (upErr) {
            console.error('[NewTicket] attachment upload failed', upErr);
            continue;
          }
          uploaded.push({
            storage_path: path,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
          });
        }
        if (uploaded.length > 0) {
          const { error: attErr } = await supabase.from('attachments').insert(
            uploaded.map((u) => ({
              ticket_id: ticket.id,
              ...u,
              uploaded_by: user.id,
            })),
          );
          if (attErr) console.error('[NewTicket] attachment row insert failed', attErr);
        }
      }

      return ticket;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/tickets/${data.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const filteredCategories = useMemo(
    () =>
      categoriesQ.data?.filter(
        (c) => c.department === department && c.parent_id === null,
      ) ?? [],
    [categoriesQ.data, department],
  );
  const filteredSubcategories = useMemo(
    () => categoriesQ.data?.filter((c) => c.parent_id === categoryId) ?? [],
    [categoriesQ.data, categoryId],
  );

  const handleFilesPicked = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const next: File[] = [...images];
    const rejected: string[] = [];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_IMAGES) {
        rejected.push(`${f.name}: only ${MAX_IMAGES} images allowed`);
        continue;
      }
      if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
        rejected.push(`${f.name}: unsupported type (${f.type || 'unknown'})`);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        rejected.push(`${f.name}: larger than 10 MB`);
        continue;
      }
      next.push(f);
    }
    setImages(next);
    if (rejected.length > 0) setError(rejected.join('; '));
    else setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="page-title">Submit a ticket</h1>
      <p className="page-subtitle">
        A team member will review your request and assign a priority and owner shortly.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
          className="card-pad space-y-6 lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="department" className="field-label">
                Department
              </label>
              <select
                id="department"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value as Department);
                  setCategoryId('');
                  setSubcategoryId('');
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
              <label htmlFor="category" className="field-label">
                Category
              </label>
              <Combobox
                id="category"
                options={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
                value={categoryId}
                onChange={(v) => {
                  setCategoryId(v);
                  setSubcategoryId('');
                }}
                placeholder="Type to search categories…"
              />
            </div>

            <div>
              <label htmlFor="subcategory" className="field-label">
                Subcategory
              </label>
              <Combobox
                id="subcategory"
                key={categoryId || 'none'}
                options={filteredSubcategories.map((c) => ({ value: c.id, label: c.name }))}
                value={subcategoryId}
                onChange={setSubcategoryId}
                placeholder={
                  categoryId
                    ? filteredSubcategories.length
                      ? 'Type to search subcategories…'
                      : 'No subcategories — leave blank'
                    : 'Select a category first'
                }
              />
            </div>

            <div>
              <label htmlFor="location" className="field-label">
                Location
              </label>
              <Combobox
                id="location"
                options={(locationsQ.data ?? []).map((l) => ({ value: l.id, label: l.label }))}
                value={locationId}
                onChange={setLocationId}
                placeholder="Type to search locations…"
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="field-label">
              Subject
            </label>
            <input
              id="subject"
              required
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Projector in Room 101 won't turn on"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="description" className="field-label">
              Description
            </label>
            <textarea
              id="description"
              required
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe the issue, what you've already tried, and how urgent it is."
              className="field resize-y"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="images" className="field-label">
                Pictures (optional)
              </label>
              <span className="text-xs text-slate-500">
                Up to {MAX_IMAGES} images, 10&nbsp;MB each
              </span>
            </div>
            <input
              id="images"
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              disabled={images.length >= MAX_IMAGES}
              onChange={(e) => handleFilesPicked(e.target.files)}
              className="sr-only"
            />
            <input
              id="images-camera"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={images.length >= MAX_IMAGES}
              onChange={(e) => handleFilesPicked(e.target.files)}
              className="sr-only"
            />
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 4 4 4-4 4 4M4 6h16v12H4z" />
                </svg>
                Choose picture
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h3l2-2h8l2 2h3v12H3V7z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Take photo
              </button>
              <span className="self-center text-xs text-slate-500">
                {images.length} / {MAX_IMAGES} selected
              </span>
            </div>
            {previews.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-3">
                {previews.map((src, i) => (
                  <li
                    key={src}
                    className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                  >
                    <img
                      src={src}
                      alt={images[i]?.name ?? `Attachment ${i + 1}`}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white hover:bg-black/80"
                      aria-label={`Remove ${images[i]?.name ?? 'image'}`}
                    >
                      ×
                    </button>
                    <p className="truncate px-2 py-1 text-[11px] text-slate-600">
                      {images[i]?.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={submit.isPending} className="btn-primary">
              {submit.isPending ? 'Submitting…' : 'Submit ticket'}
            </button>
          </div>
        </form>

        <aside className="lg:col-span-1">
          <div className="card-pad sticky top-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Searching for answers
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              We&apos;ll look in the knowledge base as you type the subject — your
              issue may already have an answer.
            </p>

            {debouncedSubject.length < 3 && (
              <p className="mt-4 text-sm italic text-slate-400">
                Start typing a subject to see suggestions…
              </p>
            )}

            {debouncedSubject.length >= 3 && kbQ.isLoading && (
              <p className="mt-4 text-sm text-slate-500">Searching…</p>
            )}

            {debouncedSubject.length >= 3 &&
              !kbQ.isLoading &&
              (kbQ.data?.length ?? 0) === 0 && (
                <p className="mt-4 text-sm text-slate-500">
                  No matching articles. Submitting a ticket is the way to go.
                </p>
              )}

            {kbQ.data && kbQ.data.length > 0 && (
              <ul className="mt-3 space-y-2">
                {kbQ.data.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/kb/${a.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-slate-200 bg-white p-3 text-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        {a.department && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {DEPARTMENT_LABEL[a.department]}
                          </span>
                        )}
                        <span className="font-medium text-slate-900">{a.title}</span>
                      </div>
                      {a.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {a.summary}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <Link
              to="/kb"
              className="mt-4 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              Browse the full knowledge base →
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
