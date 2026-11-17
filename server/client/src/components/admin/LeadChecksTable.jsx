import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadChecks } from "../../api/admin";

const SOURCES = { link: "Public link", api: "API", file: "File upload" };

export default function LeadChecksTable() {
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [source, setSource] = useState("");

  const { data } = useQuery({
    queryKey: ["lead-checks", page, phone, duplicate, source],
    queryFn: () =>
      fetchLeadChecks({
        page,
        limit: 50,
        phone: phone || undefined,
        duplicate: duplicate || undefined,
        source: source || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const checks = data?.checks || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 p-4 border-b border-slate-100">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Phone</label>
          <input
            value={phone}
            onChange={reset(setPhone)}
            placeholder="5551234567"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Result</label>
          <select value={duplicate} onChange={reset(setDuplicate)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">All</option>
            <option value="true">Duplicate</option>
            <option value="false">Not duplicate</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Source</label>
          <select value={source} onChange={reset(setSource)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">All</option>
            {Object.entries(SOURCES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {data && <p className="text-xs text-slate-400 ml-auto">{data.total.toLocaleString()} checks</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Time</th>
              <th className="text-left px-4 py-2 font-medium">Publisher</th>
              <th className="text-left px-4 py-2 font-medium">Phone</th>
              <th className="text-left px-4 py-2 font-medium">State</th>
              <th className="text-left px-4 py-2 font-medium">Duplicate?</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checks.map((c) => (
              <tr key={c._id}>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-slate-700">{c.publisherName}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-2">{c.state || "—"}</td>
                <td className="px-4 py-2">
                  <span className={c.isDuplicate ? "text-red-600 font-medium" : "text-emerald-600"}>
                    {c.isDuplicate ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.status}</td>
                <td className="px-4 py-2 text-slate-500">{SOURCES[c.source] || c.source}</td>
                <td className="px-4 py-2 text-slate-500 max-w-[220px] truncate" title={c.reason || ""}>{c.reason || "—"}</td>
              </tr>
            ))}
            {checks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">No checks yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
        <span className="text-slate-400">Page {page} of {totalPages}</span>
        <div className="space-x-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="text-slate-500 hover:text-slate-700 disabled:opacity-30">Previous</button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-slate-500 hover:text-slate-700 disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
