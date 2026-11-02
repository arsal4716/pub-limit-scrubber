import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchFrequentRuns,
  uploadFrequentFile,
  downloadFrequentFile,
  deleteFrequentRun,
} from "../../api/admin";

function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

const n = (v) => (v ?? 0).toLocaleString();

export default function FrequentRunsPanel() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  const { data: runs = [] } = useQuery({
    queryKey: ["frequent-runs"],
    queryFn: fetchFrequentRuns,
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "processing") ? 3000 : false,
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadFrequentFile(file),
    onSuccess: () => {
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["frequent-runs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFrequentRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["frequent-runs"] }),
  });

  async function handleDownload(run, kind) {
    setDownloadError(null);
    try {
      const blob = await downloadFrequentFile(run.id, kind);
      const name = kind === "sms" ? "Frequent_SMS" : "Frequent_Shopper";
      saveBlob(blob, `${name}_${run.runDate}.csv`);
    } catch {
      setDownloadError("Couldn't download the file. Please try again.");
    }
  }

  function handleDelete(run) {
    if (window.confirm(`Delete the ${run.runDate} run? It will no longer be used as a comparison baseline.`)) {
      deleteMutation.mutate(run.id);
    }
  }

  const isMonday = new Date().getDay() === 1;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-500">Weekly Frequent Shopper &rarr; Frequent SMS</h2>
        <p className="text-sm text-slate-600">
          Upload this Monday's Frequent_Shopper file. It's compared with the previous upload, and
          you get two files: <strong>Frequent_Shopper</strong> (all unique numbers) and{" "}
          <strong>Frequent_SMS</strong> (only numbers that were not in the previous Frequent_Shopper
          file). The very first upload just becomes the baseline, so its SMS file is empty.
        </p>
        {!isMonday && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
            Heads up: today isn't Monday. Uploading now still compares against your latest previous
            upload.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (file) uploadMutation.mutate();
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
          <button
            type="submit"
            disabled={!file || uploadMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload & compare"}
          </button>
        </form>
        {uploadMutation.isError && (
          <p className="text-sm text-red-600">
            {uploadMutation.error?.response?.data?.error || "Upload failed. Please try again."}
          </p>
        )}
        {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">File</th>
              <th className="text-right px-4 py-2 font-medium">Rows</th>
              <th className="text-right px-4 py-2 font-medium">Unique</th>
              <th className="text-right px-4 py-2 font-medium">Already in previous</th>
              <th className="text-right px-4 py-2 font-medium">New (SMS)</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                  {run.runDate}
                  {run.previousRunDate && (
                    <span className="block text-xs text-slate-400">vs {run.previousRunDate}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate" title={run.originalFilename}>
                  {run.originalFilename}
                </td>
                <td className="px-4 py-2.5 text-right">{n(run.totalRows)}</td>
                <td className="px-4 py-2.5 text-right">{n(run.uniqueCount)}</td>
                <td className="px-4 py-2.5 text-right">{n(run.alreadyInPreviousCount)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{n(run.newCount)}</td>
                <td className="px-4 py-2.5">
                  {run.status === "processing" && <span className="text-amber-700">Comparing...</span>}
                  {run.status === "failed" && (
                    <span className="text-red-600" title={run.errorMessage}>Failed</span>
                  )}
                  {run.status === "completed" &&
                    (run.isBaseline ? (
                      <span className="text-slate-500">Baseline (no previous file)</span>
                    ) : (
                      <span className="text-emerald-700">Done</span>
                    ))}
                </td>
                <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                  {run.status === "completed" && (
                    <>
                      <button
                        onClick={() => handleDownload(run, "shopper")}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Frequent_Shopper
                      </button>
                      <button
                        onClick={() => handleDownload(run, "sms")}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Frequent_SMS
                      </button>
                    </>
                  )}
                  {run.status !== "processing" && (
                    <button
                      onClick={() => handleDelete(run)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  No uploads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {runs.some((r) => r.status === "failed") && (
          <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            Hover "Failed" to see the reason.
          </p>
        )}
      </div>
    </div>
  );
}
