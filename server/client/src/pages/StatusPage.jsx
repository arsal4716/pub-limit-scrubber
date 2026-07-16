import { Link, useParams } from "react-router-dom";
import JobStatusCard from "../components/JobStatusCard.jsx";

export default function StatusPage() {
  const { jobId } = useParams();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
        &larr; Back to home
      </Link>
      <h1 className="text-2xl font-semibold text-slate-800">Scrub status</h1>
      <JobStatusCard jobId={jobId} />
    </div>
  );
}
