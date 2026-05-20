import type { TicketStatus } from '../lib/types';

type Props = {
  slaDueAt: string | null;
  status: TicketStatus;
};

function formatDelta(ms: number): string {
  const mins = Math.round(Math.abs(ms) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

export default function SlaBadge({ slaDueAt, status }: Props) {
  if (!slaDueAt) return null;
  if (status === 'awaiting_triage' || status === 'resolved' || status === 'closed') {
    return null;
  }

  const due = new Date(slaDueAt).getTime();
  const now = Date.now();
  const diff = due - now;

  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
        ⚠ Overdue {formatDelta(diff)}
      </span>
    );
  }
  if (diff < 60 * 60 * 1000) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
        ⏱ Due in {formatDelta(diff)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
      Due in {formatDelta(diff)}
    </span>
  );
}
