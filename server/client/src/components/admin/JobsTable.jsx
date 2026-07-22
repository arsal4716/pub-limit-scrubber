import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJobs, deleteAdminJob } from "../../api/admin";
import StatusBadge from "../StatusBadge.jsx";
import client from "../../api/client";

const DELETABLE_STATUSES = ["completed", "failed"];

export default function JobsTable() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-jobs", page],
    queryFn: () => fetchAdminJobs({ page, limit: 20 }),
  });

  const jobs = data?.jobs || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
  });

  async function handleDownload(job) {
    const response = await client.get(`/scrub/download/${job._id}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scrubbed-${job.originalFilename}`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function handleDelete(job) {
    const confirmed = window.confirm(
      `Delete "${job.originalFilename}" for ${job.publisherName}? This permanently removes the uploaded and scrubbed files and cannot be undone.`
    );
    if (confirmed) deleteMutation.mutate(job._id);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Publisher</th>
              <th className="text-left px-4 py-2 font-medium">File</th>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-right px-4 py-2 font-medium">Rows</th>
              <th className="text-right px-4 py-2 font-medium">Unique</th>
              <th className="text-right px-4 py-2 font-medium">Sent</th>
              <th className="text-right px-4 py-2 font-medium">Accepted</th>
              <th className="text-right px-4 py-2 font-medium">Blocked</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr key={job._id}>
                <td className="px-4 py-2.5 text-slate-700">{job.publisherName}</td>
                <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate" title={job.originalFilename}>
                  {job.originalFilename}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {new Date(job.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">{job.totalRows}</td>
                <td className="px-4 py-2.5 text-right">{job.uniquePhoneCount}</td>
                <td className="px-4 py-2.5 text-right">{job.allowedCount}</td>
                <td className="px-4 py-2.5 text-right">{job.acceptedCount}</td>
                <td className="px-4 py-2.5 text-right">{job.blockedCount}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                  {job.status === "completed" && (
                    <button
                      onClick={() => handleDownload(job)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Download
                    </button>
                  )}
                  {DELETABLE_STATUSES.includes(job.status) && (
                    <button
                      onClick={() => handleDelete(job)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === job._id}
                      className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                  No scrub jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError && (
        <p className="px-4 py-2 text-sm text-red-600 border-t border-slate-100">
          {deleteMutation.error?.response?.data?.error || "Failed to delete job."}
        </p>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
        <span className="text-slate-400">
          Page {page} of {totalPages}
        </span>
        <div className="space-x-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-30"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
