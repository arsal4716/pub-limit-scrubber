const STYLES = {
  queued: "bg-slate-100 text-slate-600",
  analyzing: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

const LABELS = {
  queued: "Queued",
  analyzing: "Analyzing file",
  processing: "Scrubbing",
  completed: "Ready",
  failed: "Failed",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        STYLES[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {LABELS[status] || status}
    </span>
  );
}
