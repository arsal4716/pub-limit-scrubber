import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { validatePublisher } from "../api/publishers";
import StateRestrictionNotice from "../components/StateRestrictionNotice.jsx";

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const trimmed = name.trim();

  const validateMutation = useMutation({
    mutationFn: () => validatePublisher(trimmed),
    onSuccess: () => {
      navigate(`/upload/${encodeURIComponent(trimmed)}`);
    },
  });

  function handleContinue(e) {
    e.preventDefault();
    if (!trimmed) return;
    validateMutation.mutate();
  }

  const notRecognized = validateMutation.isError;
  const errorMessage =
    validateMutation.error?.response?.data?.error ||
    "We couldn't check that publisher right now. Please try again.";

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
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validateMutation.isError) validateMutation.reset();
            }}
            placeholder="Enter your publisher name"
            className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
              notRecognized
                ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500"
            }`}
            autoComplete="off"
            autoFocus
          />
          {notRecognized && <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>}
        </div>

        <button
          type="submit"
          disabled={!trimmed || validateMutation.isPending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {validateMutation.isPending ? "Checking..." : "Continue to upload"}
        </button>
      </form>
    </div>
  );
}
