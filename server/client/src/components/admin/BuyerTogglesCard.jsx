import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updateBuyerToggles } from "../../api/admin";

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-indigo-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function BuyerTogglesCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });

  const mutation = useMutation({
    mutationFn: updateBuyerToggles,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["global-config"] }),
  });

  if (!config) return null;

  const { lmEnabled, hcEnabled } = config;
  const summary =
    lmEnabled && hcEnabled
      ? "Both APIs on: file scrubs are split between LM and HC; realtime checks use both."
      : hcEnabled
        ? "HC only: every number is scrubbed through HC."
        : "LM only: every number is scrubbed through LM.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-medium text-slate-500">Buyer APIs</h2>
        <p className="text-sm text-slate-600 mt-1">{summary}</p>
      </div>
      {[
        { key: "lmEnabled", label: "LM (Buyer 1)", on: lmEnabled, other: hcEnabled },
        { key: "hcEnabled", label: "HC (Buyer 2)", on: hcEnabled, other: lmEnabled },
      ].map((b) => (
        <div key={b.key} className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-slate-700">{b.label}</span>
          <Switch
            label={b.label}
            checked={b.on}
            // The last enabled buyer can't be switched off.
            disabled={mutation.isPending || (b.on && !b.other)}
            onChange={() => mutation.mutate({ [b.key]: !b.on })}
          />
        </div>
      ))}
      {mutation.isError && (
        <p className="text-sm text-red-600">
          {mutation.error?.response?.data?.error || "Failed to update buyer APIs."}
        </p>
      )}
      <p className="text-xs text-slate-400">
        At least one must stay on. A single enabled buyer gets each publisher's whole daily limit.
        Applies to jobs that start after this change.
      </p>
    </div>
  );
}
