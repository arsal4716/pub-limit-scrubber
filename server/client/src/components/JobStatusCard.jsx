import { useQuery } from "@tanstack/react-query";
import { fetchJobStatus, downloadUrl } from "../api/scrub";
import StatusBadge from "./StatusBadge.jsx";
import ProgressBar from "./ProgressBar.jsx";

function formatMinutes(seconds) {
  if (!seconds || seconds <= 0) return "under a minute";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`;
}

export default function JobStatusCard({ jobId }) {
  const { data: job, error } = useQuery({
    queryKey: ["job-status", jobId],
    queryFn: () => fetchJobStatus(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2500;
    },
  });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn't load job status. It may not exist anymore.
      </div>
    );
  }

  if (!job) {
    return <div className="text-sm text-slate-500">Loading job status...</div>;
  }

  const isPreProcessing = job.status === "queued" || job.status === "analyzing";
  const remainingToProcess = Math.max(0, (job.allowedCount || 0) - (job.processedCount || 0));
  const remainingSeconds = job.leadsPerMinuteRate
    ? (remainingToProcess / job.leadsPerMinuteRate) * 60
    : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">{job.originalFilename}</p>
          <p className="text-xs text-slate-400">Job ID: {job.id}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === "failed" && (
        <p className="text-sm text-red-600">{job.errorMessage || "Something went wrong."}</p>
      )}

      {isPreProcessing && (
        <p className="text-sm text-slate-500">
          Reading your file and figuring out how many unique leads need scrubbing...
        </p>
      )}

      {(job.status === "processing" || job.status === "completed") && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>
              {job.processedCount} / {job.allowedCount} leads scrubbed
            </span>
            <span>{job.status === "completed" ? "100%" : `~${formatMinutes(remainingSeconds)} left`}</span>
          </div>
          <ProgressBar value={job.processedCount} max={job.allowedCount || 1} />
        </div>
      )}

      {job.status === "processing" && (
        <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
          You can leave this tab — come back in {formatMinutes(remainingSeconds)} and your file will
          be ready to download here (or from the link you can bookmark now:{" "}
          <code className="text-xs">/status/{String(job.id)}</code>).
        </p>
      )}

      {job.status === "completed" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
            <Stat label="Total rows" value={job.totalRows} />
            <Stat label="Unique leads" value={job.uniquePhoneCount} />
            <Stat label="Sent to buyer" value={job.allowedCount} />
            <Stat label="Skipped (limit)" value={job.skippedOverLimitCount} />
            <Stat label="Accepted" value={job.acceptedCount} />
            <Stat label="Blocked/duplicate" value={job.blockedCount} />
            <Stat label="Invalid phone" value={job.invalidPhoneCount} />
            <Stat label="Dupes in file" value={job.duplicateInFileCount} />
            <Stat label="Buyer 1 blocked" value={job.buyerStats?.buyer1?.blockedCount} />
            <Stat label="Buyer 2 blocked" value={job.buyerStats?.buyer2?.blockedCount} />
            <Stat label="Buyer 1 errors" value={job.buyerStats?.buyer1?.errorCount} />
            <Stat label="Buyer 2 errors" value={job.buyerStats?.buyer2?.errorCount} />
          </div>
          <a
            href={downloadUrl(job.id)}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Download scrubbed file
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="font-medium text-slate-700">{value ?? 0}</p>
    </div>
  );
}
