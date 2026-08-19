import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updateRateLimitMode } from "../../api/admin";

export default function RateLimitToggleCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });

  const toggleMutation = useMutation({
    mutationFn: (enabled) => updateRateLimitMode(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-config"] });
    },
  });

  if (!config) return null;

  const enabled = config.rateLimitEnabled;

  function handleToggle() {
    toggleMutation.mutate(!enabled);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500">Scrub speed</h2>
          <p className="text-lg font-semibold text-slate-800 mt-1">
            {enabled ? "Rate limited (~1,000/min per buyer)" : "As fast as possible"}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            {enabled
              ? "Leads are scrubbed at a steady, throttled pace. Turn this off to scrub as fast as the buyer APIs allow instead."
              : "Leads are scrubbed at full speed with no artificial pacing. If a buyer API responds with 429 (Too Many Requests), that buyer automatically pauses for a few seconds before continuing."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={toggleMutation.isPending}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {toggleMutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {toggleMutation.error?.response?.data?.error || "Failed to update scrub speed."}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Applies to jobs that start after this change - a job already running keeps the mode it
        started with.
      </p>
    </div>
  );
}
