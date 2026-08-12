import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { uploadScrubFile, fetchJobsForPublisher, fetchUploadRequirements } from "../api/scrub";
import { validatePublisher } from "../api/publishers";
import JobStatusCard from "../components/JobStatusCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import StateRestrictionNotice from "../components/StateRestrictionNotice.jsx";

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

  const {
    data: validation,
    isLoading: isValidating,
    isError: isInvalid,
    error: validationError,
  } = useQuery({
    queryKey: ["validate-publisher", publisherName],
    queryFn: () => validatePublisher(publisherName),
    retry: false,
  });

  const isValid = validation?.valid === true;

  const { data: uploadRequirements } = useQuery({
    queryKey: ["upload-requirements"],
    queryFn: fetchUploadRequirements,
    enabled: isValid,
    staleTime: Infinity,
  });

  const { data: recentJobs = [], refetch: refetchRecent } = useQuery({
    queryKey: ["publisher-jobs", publisherName],
    queryFn: () => fetchJobsForPublisher(publisherName),
    enabled: isValid,
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
        <div className="mt-3">
          <StateRestrictionNotice />
        </div>
      </div>

      {isValidating && <p className="text-sm text-slate-500">Checking publisher...</p>}

      {isInvalid && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-700">
            {validationError?.response?.data?.error ||
              `"${publisherName}" is not a recognized publisher. Please contact an admin to get set up.`}
          </p>
          <Link
            to="/"
            className="mt-3 inline-block text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Go back and try a different name
          </Link>
        </div>
      )}

      {isValid && (
        <>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
            <p className="text-sm font-semibold text-indigo-900">
              You can scrub up to {validation.remainingToday.toLocaleString()} lead
              {validation.remainingToday === 1 ? "" : "s"} today.
            </p>
            <p className="mt-1 text-sm text-indigo-800">
              Your daily limit is {validation.dailyLimit.toLocaleString()} leads
              {validation.usedToday > 0 &&
                ` (${validation.usedToday.toLocaleString()} already used today)`}
              . Only your first {validation.remainingToday.toLocaleString()} unique, valid leads will
              be sent to the buyer API — any additional leads in your file will be{" "}
              <strong>skipped</strong> and marked "Skipped - Daily Limit Reached" in the output.
            </p>
          </div>

          {uploadRequirements && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">Your file needs a phone column, e.g.:</p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {uploadRequirements.acceptedPhoneHeaders.join(", ")}
              </p>
              <p className="mt-3 font-medium text-slate-700">...and a state column, e.g.:</p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {uploadRequirements.acceptedStateHeaders.join(", ")}
              </p>
              <p className="mt-2">
                Column headers are matched automatically regardless of case or spacing (e.g.
                "Phone Number", "phone_number", and "PHONENUMBER" all work the same). Any US phone
                format is accepted (with or without dashes, parentheses, or a leading 1). States can
                be entered as a 2-letter code or a full name, in any case — "AZ", "az", and
                "Arizona" all work. Comma- or semicolon-delimited CSV files are both supported
                (delimiter is detected automatically).
              </p>
            </div>
          )}

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
        </>
      )}

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
