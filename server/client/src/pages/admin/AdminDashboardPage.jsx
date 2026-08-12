import { useState } from "react";
import GlobalLimitCard from "../../components/admin/GlobalLimitCard.jsx";
import BuyerLimitsCard from "../../components/admin/BuyerLimitsCard.jsx";
import PublisherTable from "../../components/admin/PublisherTable.jsx";
import JobsTable from "../../components/admin/JobsTable.jsx";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "publishers", label: "Publishers" },
  { key: "jobs", label: "Jobs & stats" },
];

export default function AdminDashboardPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Admin</h1>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <GlobalLimitCard />
          <BuyerLimitsCard />
        </div>
      )}
      {tab === "publishers" && <PublisherTable />}
      {tab === "jobs" && <JobsTable />}
    </div>
  );
}
