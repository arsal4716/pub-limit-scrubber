export default function ProgressBar({ value, max, colorClass = "bg-indigo-600" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
      <div
        className={`h-full rounded-full ${colorClass} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
