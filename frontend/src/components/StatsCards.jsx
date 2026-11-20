const CARDS = [
  { key: 'total', label: 'Job opportunities', color: 'text-slate-900' },
  { key: 'validEmails', label: 'Valid emails', color: 'text-indigo-600' },
  { key: 'sent', label: 'Emails sent', color: 'text-emerald-600' },
  { key: 'pending', label: 'Pending', color: 'text-sky-600' },
  { key: 'failed', label: 'Failed', color: 'text-rose-600' },
  { key: 'duplicates', label: 'Duplicates skipped', color: 'text-amber-600' },
];

export default function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {CARDS.map((c) => (
        <div key={c.key} className="card py-3">
          <div className="text-xs font-medium text-slate-500">{c.label}</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.color}`}>{stats?.[c.key] ?? '–'}</div>
          {c.key === 'validEmails' && stats?.invalidEmails > 0 && <div className="text-xs text-rose-500">{stats.invalidEmails} invalid</div>}
          {c.key === 'sent' && stats && (
            <div className="text-xs text-slate-400">
              {stats.sentToday}/{stats.dailyLimit} today
            </div>
          )}
          {c.key === 'pending' && stats?.dryRunTested > 0 && <div className="text-xs text-slate-400">{stats.dryRunTested} dry-run tested</div>}
        </div>
      ))}
    </div>
  );
}
