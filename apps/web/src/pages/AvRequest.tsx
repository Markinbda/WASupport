import { useState, type DragEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const EQUIPMENT = ['Interactive Board', 'Projector', 'Microphone', 'Lighting', 'Camera', 'Laptop', 'Other'];
const LOCATIONS = ['PPMH', 'Lower Primary Quad', 'Upper Primary Quad', 'PPMH Quad', 'Old Quad', 'Field', 'Other'];
const MUSIC = ['Soft Music', 'Upbeat Music', 'N/A'];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FILE_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg',
];

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AvRequest() {
  const { user, profile } = useAuth();
  const [requestedDate, setRequestedDate] = useState('');
  const [setupTime, setSetupTime] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [music, setMusic] = useState('N/A');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [links, setLinks] = useState(['', '', '', '']);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const requesterName = profile?.full_name?.trim() || user?.user_metadata?.full_name || user?.email || '';
  const requesterEmail = profile?.email || user?.email || '';

  function addFiles(incoming: FileList | File[]) {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      if (!FILE_TYPES.includes(file.type)) rejected.push(`${file.name}: unsupported file type`);
      else if (file.size > MAX_FILE_BYTES) rejected.push(`${file.name}: larger than 25 MB`);
      else accepted.push(file);
    }
    setFiles((current) => [...current, ...accepted]);
    setError(rejected.length ? rejected.join('; ') : null);
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function createCalendar(kind: 'request' | 'recurring', id: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const providerToken = data.session?.provider_token;
    if (!token || !providerToken) {
      throw new Error('Calendar authorization is missing. Sign out and sign in with Microsoft again.');
    }
    const response = await fetch('/api/av-calendar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-ms-provider-token': providerToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind, id }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(body.error || 'Calendar creation failed');
  }

  async function submitRequest() {
    if (!supabase || !user) return;
    setError(null);
    setSuccess(null);
    const invalidLink = links.find((link) => !validUrl(link));
    if (invalidLink) {
      setError(`Enter a complete website URL, including https:// (${invalidLink})`);
      return;
    }
    if (!requestedDate || !setupTime || !location) {
      setError('Date, setup time, and location are required.');
      return;
    }

    setSubmitting(true);
    let requestId: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      const { data: request, error: insertError } = await supabase
        .from('av_requests')
        .insert({
          requester_id: user.id,
          requester_name: requesterName,
          requester_email: requesterEmail,
          requested_date: requestedDate,
          setup_time: setupTime,
          equipment,
          music_request: music,
          location,
          details: details.trim() || null,
          links: links.map((link) => link.trim()).filter(Boolean),
        })
        .select('id')
        .single();
      if (insertError) throw insertError;
      requestId = request.id as string;

      const fileRows: Array<Record<string, unknown>> = [];
      for (const file of files) {
        const extension = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 10);
        const storagePath = `requests/${requestId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('av-request-files')
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
        fileRows.push({
          request_id: requestId,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        });
      }
      if (fileRows.length) {
        const { error: filesError } = await supabase.from('av_request_files').insert(fileRows);
        if (filesError) throw filesError;
      }

      try {
        await createCalendar('request', requestId);
        setSuccess('Your AV request was submitted and added to your Microsoft calendar.');
      } catch (calendarError) {
        setSuccess('Your AV request was submitted.');
        setError(calendarError instanceof Error ? calendarError.message : 'Calendar creation failed.');
      }
      setRequestedDate('');
      setSetupTime('');
      setEquipment([]);
      setMusic('N/A');
      setLocation('');
      setDetails('');
      setLinks(['', '', '', '']);
      setFiles([]);
    } catch (caught) {
      if (uploadedPaths.length) await supabase.storage.from('av-request-files').remove(uploadedPaths);
      if (requestId) await supabase.from('av_requests').delete().eq('id', requestId);
      setError(caught instanceof Error ? caught.message : 'Could not submit the AV request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="page-title">Audio/Visual Request</h1>
      <p className="page-subtitle">Request audio/visual support for an event or class.</p>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="av-success-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="av-success-title" className="text-lg font-semibold text-brand-navy">Submitted successfully</h2>
            <p className="mt-2 text-sm text-slate-600">{success}</p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setSuccess(null)} className="btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mb-4 alert-error">{error}</p>}

      <form onSubmit={(event) => { event.preventDefault(); void submitRequest(); }} className="card-pad space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="field-label">Requester name</label>
            <div className="field bg-slate-50 text-slate-600">{requesterName}</div>
          </div>
          <div>
            <label className="field-label">Requester email</label>
            <div className="field bg-slate-50 text-slate-600">{requesterEmail}</div>
          </div>
          <div>
            <label htmlFor="av-date" className="field-label">Date requested for:</label>
            <input id="av-date" type="date" required min={localDate()} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="av-time" className="field-label">Set up by</label>
            <input id="av-time" type="time" required value={setupTime} onChange={(e) => setSetupTime(e.target.value)} className="field" />
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Equipment</legend>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {EQUIPMENT.map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={equipment.includes(item)} onChange={() => setEquipment((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />
                {item}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="av-music" className="field-label">Music request</label>
            <select id="av-music" value={music} onChange={(e) => setMusic(e.target.value)} className="field-select">
              {MUSIC.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="av-location" className="field-label">Location</label>
            <select id="av-location" required value={location} onChange={(e) => setLocation(e.target.value)} className="field-select">
              <option value="">Select a location</option>
              {LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="av-details" className="field-label">Details of request</label>
          <textarea id="av-details" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} className="field" />
        </div>

        <fieldset>
          <legend className="field-label">Presentation links</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {links.map((link, index) => (
              <input key={index} type="url" value={link} onChange={(e) => setLinks((current) => current.map((value, itemIndex) => itemIndex === index ? e.target.value : value))} className="field" placeholder={`Link ${index + 1} (optional)`} />
            ))}
          </div>
        </fieldset>

        <div>
          <span className="field-label">Files</span>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFiles}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition ${dragging ? 'border-brand-navy bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <label className="cursor-pointer text-sm font-semibold text-brand-navy">
              Choose files
              <input type="file" multiple accept={FILE_TYPES.join(',')} className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ''; }} />
            </label>
            <p className="mt-1 text-xs text-slate-500">or drag and drop files here · 25 MB maximum per file</p>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm">
                  <span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="ml-3 text-xs font-medium text-rose-600">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Submitting…' : 'Submit AV request'}
        </button>
      </form>

    </section>
  );
}