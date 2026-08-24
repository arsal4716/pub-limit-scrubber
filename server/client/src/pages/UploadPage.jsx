import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { uploadScrubFile, fetchMyJobs, fetchUploadRequirements } from "../api/scrub";
import { fetchMyPublisherProfile } from "../api/publisherAuth";
import { usePublisherAuth } from "../context/PublisherAuthContext.jsx";
import JobStatusCard from "../components/JobStatusCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import StateRestrictionNotice from "../components/StateRestrictionNotice.jsx";

export default function UploadPage() {
  const { name: publisherName } = usePublisherAuth();
  const [file, setFile] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: fetchMyPublisherProfile,
  });

  const { data: uploadRequirements } = useQuery({
    queryKey: ["upload-requirements"],
    queryFn: fetchUploadRequirements,
    staleTime: Infinity,
  });

  const { data: recentJobs = [], refetch: refetchRecent } = useQuery({
    queryKey: ["my-jobs"],
    queryFn: fetchMyJobs,
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadScrubFile(file),
    onSuccess: (data) => {
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
        <h1 className="text-2xl font-semibold text-slate-800">
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

      {profile && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm font-semibold text-indigo-900">
            You can scrub up to {profile.remainingToday.toLocaleString()} lead
            {profile.remainingToday === 1 ? "" : "s"} today.
          </p>
          <p className="mt-1 text-sm text-indigo-800">
            Daily limit: {profile.dailyLimit.toLocaleString()} leads
            {profile.usedToday > 0 && ` (${profile.usedToday.toLocaleString()} used today)`}. Leads
            past your limit are marked <strong>Not Checked</strong> in the output.
          </p>
        </div>
      )}

      {uploadRequirements && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Your file needs a phone column, e.g.:</p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {uploadRequirements.acceptedPhoneHeaders.join(", ")}
          </p>
          <p className="mt-3 font-medium text-slate-700">A state column is recommended, e.g.:</p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {uploadRequirements.acceptedStateHeaders.join(", ")}
          </p>
          <p className="mt-2">
            Column headers are matched automatically regardless of case or spacing (e.g. "Phone
            Number", "phone_number", and "PHONENUMBER" all work the same). Any US phone format is
            accepted (with or without dashes, parentheses, or a leading 1). States can be entered as
            a 2-letter code or a full name, in any case — "AZ", "az", and "Arizona" all work. If a
            row has no state value, we automatically detect it from the phone's area code, so a file
            with no state column at all still gets scrubbed. Comma- or semicolon-delimited CSV files
            are both supported (delimiter is detected automatically).
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

      {activeJobId && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">This upload</h2>
          <JobStatusCard jobId={activeJobId} />
        </div>
      )}

      {recentJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">Recent uploads</h2>
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
