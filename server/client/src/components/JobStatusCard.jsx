import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJobStatus, downloadScrubOutput } from "../api/scrub";
import StatusBadge from "./StatusBadge.jsx";
import ProgressBar from "./ProgressBar.jsx";

function formatMinutes(seconds) {
  if (!seconds || seconds <= 0) return "under a minute";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`;
}

export default function JobStatusCard({ jobId, admin = false }) {
  const [downloadError, setDownloadError] = useState(null);

  const { data: job, error } = useQuery({
    queryKey: ["job-status", jobId, admin],
    queryFn: () => fetchJobStatus(jobId, admin),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2500;
    },
  });

  async function handleDownload() {
    setDownloadError(null);
    try {
      const blob = await downloadScrubOutput(jobId, admin);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `scrubbed-${job.originalFilename}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError("Couldn't download the file. Please try again.");
    }
  }

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

  const remainingToProcess = Math.max(0, (job.allowedCount || 0) - (job.processedCount || 0));
  const hasEta = Boolean(job.leadsPerMinuteRate);
  const remainingSeconds = hasEta ? (remainingToProcess / job.leadsPerMinuteRate) * 60 : 0;
  const etaText = hasEta ? formatMinutes(remainingSeconds) : "as fast as possible";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">{job.originalFilename}</p>
          {admin && <p className="text-xs text-slate-500">Publisher: {job.publisherName}</p>}
          <p className="text-xs text-slate-400">Job ID: {job.id}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === "failed" && (
        <p className="text-sm text-red-600">{job.errorMessage || "Something went wrong."}</p>
      )}

      {job.status === "queued" && (
        <p className="text-sm text-slate-500">
          Your file is in the queue and will start shortly. Status: <strong>Pending</strong>.
        </p>
      )}

      {job.status === "analyzing" && (
        <p className="text-sm text-slate-500">
          Reading your file, detecting the phone number column, and finding unique leads...
          {job.totalRows > 0 &&
            ` ${job.totalRows.toLocaleString()} rows read so far, ${(job.uniquePhoneCount || 0).toLocaleString()} unique leads, ${(job.duplicateInFileCount || 0).toLocaleString()} duplicates in file.`}
        </p>
      )}

      {job.status === "checking" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
            <Stat label="Leads uploaded" value={job.totalRows} />
            <Stat label="Unique leads found" value={job.uniquePhoneCount} />
            <Stat label="Blank phone" value={job.blankPhoneCount} />
            <Stat label="Invalid phone format" value={job.invalidPhoneCount} />
            <Stat label="Duplicates in file" value={job.duplicateInFileCount} />
            <Stat label="Duplicates found in DNC so far" value={job.internalDncCount} />
            <Stat label="Remaining to check" value={Math.max(0, (job.uniquePhoneCount || 0) - (job.dncCheckedCount || 0))} />
          </div>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Checking in internal DNC database: {(job.dncCheckedCount || 0).toLocaleString()} /{" "}
            {(job.uniquePhoneCount || 0).toLocaleString()} leads checked. Next up: buyer scrub
            (pending).
          </p>
          <ProgressBar value={job.dncCheckedCount || 0} max={job.uniquePhoneCount || 1} />
        </div>
      )}

      {(job.status === "processing" || job.status === "completed") && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>
              {job.processedCount} / {job.allowedCount} leads scrubbed
            </span>
            <span>{job.status === "completed" ? "100%" : hasEta ? `~${etaText} left` : etaText}</span>
          </div>
          <ProgressBar value={job.processedCount} max={job.allowedCount || 1} />
        </div>
      )}

      {job.status === "processing" && (
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
          <Stat label="Scrubbed so far" value={job.processedCount} />
          <Stat label="Remaining" value={Math.max(0, (job.allowedCount || 0) - (job.processedCount || 0))} />
          <Stat label="Duplicates found so far" value={(job.internalDncCount || 0) + (job.blockedCount || 0) + (job.duplicateInFileCount || 0)} />
          <Stat label="Accepted so far" value={job.acceptedCount} />
          <Stat label="Leads uploaded" value={job.totalRows} />
          <Stat label="Unique leads found" value={job.uniquePhoneCount} />
          <Stat label="Duplicate in internal DNC" value={job.internalDncCount} />
          <Stat label="Blocked by buyers" value={job.blockedCount} />
        </div>
      )}

      {job.status === "processing" && !admin && (
        <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
          You can leave this tab — {hasEta ? `come back in ${etaText}` : "check back shortly"} and
          your file will be ready to download here (or from the link you can bookmark now:{" "}
          <code className="text-xs">/status/{String(job.id)}</code>).
        </p>
      )}

      {job.status === "completed" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
            <Stat label="Total rows" value={job.totalRows} />
            <Stat label="Unique leads" value={job.uniquePhoneCount} />
            <Stat label="DNC (duplicate)" value={job.internalDncCount} />
            <Stat label="Sent to buyer" value={job.allowedCount} />
            <Stat label="Skipped (limit)" value={job.skippedOverLimitCount} />
            <Stat label="Accepted" value={job.acceptedCount} />
            <Stat label="Blocked/duplicate" value={job.blockedCount} />
            <Stat label="Blank phone" value={job.blankPhoneCount} />
            <Stat label="Invalid phone format" value={job.invalidPhoneCount} />
            <Stat label="Dupes in file" value={job.duplicateInFileCount} />
            <Stat label="Buyer 1 blocked" value={job.buyerStats?.buyer1?.blockedCount} />
            <Stat label="Buyer 2 blocked" value={job.buyerStats?.buyer2?.blockedCount} />
            <Stat label="Buyer 1 errors" value={job.buyerStats?.buyer1?.errorCount} />
            <Stat label="Buyer 2 errors" value={job.buyerStats?.buyer2?.errorCount} />
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Download scrubbed file
          </button>
          {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
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
