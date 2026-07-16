import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicPublishers } from "../api/publishers";
import StateRestrictionNotice from "../components/StateRestrictionNotice.jsx";

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { data: publishers = [] } = useQuery({
    queryKey: ["public-publishers"],
    queryFn: fetchPublicPublishers,
  });

  const trimmed = name.trim();
  const matches = publishers.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

  function handleContinue(e) {
    e.preventDefault();
    if (!trimmed) return;
    navigate(`/upload/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-semibold text-slate-800 text-center">Scrub your lead file</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        Enter your publisher name to get started. We'll scrub your file against the buyer API up to
        your daily lead limit.
      </p>
      <div className="mt-4">
        <StateRestrictionNotice />
      </div>

      <form onSubmit={handleContinue} className="mt-8 space-y-4">
        <div>
          <label htmlFor="publisherName" className="block text-sm font-medium text-slate-700 mb-1">
            Publisher name
          </label>
          <input
            id="publisherName"
            list="publisher-options"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Leads"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            autoFocus
          />
          <datalist id="publisher-options">
            {publishers.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          {trimmed && !matches && (
            <p className="mt-2 text-xs text-amber-600">
              We don't recognize this publisher yet. You can still continue, but the upload will be
              rejected unless an admin has added "{trimmed}".
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!trimmed}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to upload
        </button>
      </form>
    </div>
  );
}
