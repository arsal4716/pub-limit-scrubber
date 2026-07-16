import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { uploadScrubFile, fetchJobsForPublisher } from "../api/scrub";
import JobStatusCard from "../components/JobStatusCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

function recentJobsKey(publisherName) {
  return `recentJobs:${publisherName.toLowerCase()}`;
}

function rememberJob(publisherName, jobId) {
  const key = recentJobsKey(publisherName);
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  const updated = [jobId, ...existing.filter((id) => id !== jobId)].slice(0, 5);
  localStorage.setItem(key, JSON.stringify(updated));
}

export default function UploadPage() {
  const { publisherName } = useParams();
  const [file, setFile] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  const { data: recentJobs = [], refetch: refetchRecent } = useQuery({
    queryKey: ["publisher-jobs", publisherName],
    queryFn: () => fetchJobsForPublisher(publisherName),
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadScrubFile(publisherName, file),
    onSuccess: (data) => {
      rememberJob(publisherName, data.jobId);
      setActiveJobId(data.jobId);
      setFile(null);
      refetchRecent();
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    uploadMutation.mutate();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
          &larr; Change publisher
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-800">
          Upload a file for <span className="text-indigo-600">{publisherName}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          CSV files only. Any US phone format is accepted. Only the first unique leads within your
          daily limit will be scrubbed — the rest are skipped and your original data is always kept
          in the output.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 space-y-4"
      >
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {uploadMutation.isError && (
          <p className="text-sm text-red-600">
            {uploadMutation.error?.response?.data?.error || "Upload failed. Please try again."}
          </p>
        )}
        <button
          type="submit"
          disabled={!file || uploadMutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload & scrub"}
        </button>
      </form>

      {activeJobId && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">This upload</h2>
          <JobStatusCard jobId={activeJobId} />
        </div>
      )}

      {recentJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">Recent uploads for {publisherName}</h2>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {recentJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setActiveJobId(job.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
              >
                <div>
                  <p className="text-slate-700">{job.originalFilename}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
