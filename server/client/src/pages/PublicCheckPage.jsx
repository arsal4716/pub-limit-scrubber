import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { verifyCheckLink, checkNumber } from "../api/publicCheck";
import PortalStatusBanner, { usePortalStatus } from "../components/PortalStatusBanner.jsx";

const OUTCOMES = {
  available: { title: "Not a duplicate", detail: "This number is clear.", tone: "emerald" },
  blocked: { title: "Duplicate", detail: "This number is a duplicate / suppressed.", tone: "red" },
  dnc: { title: "Duplicate", detail: "This number is already on the DNC list.", tone: "red" },
  invalid: { title: "Invalid number", detail: "That isn't a valid US phone number.", tone: "amber" },
  limit_reached: { title: "Limit reached", detail: "Your daily limit has been used up.", tone: "amber" },
  error: { title: "Couldn't check", detail: "Something went wrong checking this number. Please try again.", tone: "amber" },
};

const TONES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  red: "border-red-200 bg-red-50 text-red-800",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
};

export default function PublicCheckPage() {
  const { token } = useParams();
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const { data: portal } = usePortalStatus();

  const { isError: linkInvalid, isLoading } = useQuery({
    queryKey: ["check-link", token],
    queryFn: () => verifyCheckLink(token),
    retry: false,
  });

  const mutation = useMutation({ mutationFn: () => checkNumber(token, { phone, state }) });

  if (isLoading) return <p className="text-center text-slate-500 mt-12">Loading...</p>;
  if (linkInvalid) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-red-800">
        This link isn't valid. Please ask for a new one.
      </div>
    );
  }

  const outcome = mutation.data ? OUTCOMES[mutation.data.status] : null;
  const closed = portal && !portal.open;

  return (
    <div className="max-w-md mx-auto mt-8 space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800 text-center">Check a number</h1>
      <PortalStatusBanner />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.trim()) mutation.mutate();
        }}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            inputMode="tel"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1" htmlFor="state">
            State (optional)
          </label>
          <input
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="TX, or leave blank to detect from the number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={!phone.trim() || mutation.isPending || closed}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? "Checking..." : "Check number"}
        </button>
      </form>

      {mutation.isError && (
        <p className="text-sm text-red-600 text-center">
          {mutation.error?.response?.data?.error || "Something went wrong. Please try again."}
        </p>
      )}

      {outcome && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${TONES[outcome.tone]}`}>
          <p className="font-semibold">
            {outcome.title}
            {mutation.data.phone && <span className="font-normal"> · {mutation.data.phone}</span>}
          </p>
          <p className="mt-1">{outcome.detail}</p>
        </div>
      )}
    </div>
  );
}
