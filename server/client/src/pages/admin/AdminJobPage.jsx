import { Link, useParams } from "react-router-dom";
import JobStatusCard from "../../components/JobStatusCard.jsx";

// Same live status view a publisher sees (progress, time remaining,
// duplicate counts), opened with the admin's own session - no publisher
// login needed.
export default function AdminJobPage() {
  const { jobId } = useParams();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/admin" className="text-sm text-slate-400 hover:text-slate-600">
        &larr; Back to dashboard
      </Link>
      <h1 className="text-2xl font-semibold text-slate-800">Scrub status</h1>
      <JobStatusCard jobId={jobId} admin />
    </div>
  );
}
