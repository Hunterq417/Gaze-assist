function StatusIndicator({ label, status, value }) {
  const colorClass = {
    online: "bg-emerald-500",
    warning: "bg-amber-400",
    offline: "bg-rose-500",
  }[status];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/65 bg-white/58 p-3.5 shadow-[0_10px_20px_rgba(92,102,146,0.12)]">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
        <span className="text-sm text-slate-800">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default StatusIndicator;
