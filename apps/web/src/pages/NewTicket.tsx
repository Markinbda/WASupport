import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Combobox } from '../components/Combobox';
import {
  DEPARTMENT_LABEL,
  type Category,
  type Department,
  type Location,
} from '../lib/types';

export default function NewTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [department, setDepartment] = useState<Department>('IT');
  const [categoryId, setCategoryId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const submit = useMutation({
    mutationFn: async () => {
      if (!supabase || !user) throw new Error('Not ready');
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          department,
          category_id: categoryId || null,
          location_id: locationId || null,
          subject,
          description,
          submitter_id: user.id,
        })
        .select('id, ref')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/tickets/${data.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const filteredCategories =
    categoriesQ.data?.filter((c) => c.department === department) ?? [];

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="page-title">Submit a ticket</h1>
      <p className="page-subtitle">
        A team member will review your request and assign a priority and owner shortly.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate();
        }}
        className="card-pad space-y-6"
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
              onChange={setCategoryId}
              placeholder="Type to search categories…"
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
    </section>
  );
}
