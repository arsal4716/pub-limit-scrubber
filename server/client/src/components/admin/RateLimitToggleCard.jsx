import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updateRateLimitSettings } from "../../api/admin";

const RATE_PRESETS = [1000, 2000, 3000, 5000];

export default function RateLimitToggleCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });
  const [rateInput, setRateInput] = useState("");

  useEffect(() => {
    if (config) setRateInput(String(config.rateLimitPerMinute));
  }, [config?.rateLimitPerMinute]);

  const mutation = useMutation({
    mutationFn: updateRateLimitSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-config"] });
    },
  });

  if (!config) return null;

  const enabled = config.rateLimitEnabled;
  const currentRate = config.rateLimitPerMinute;

  function handleToggle() {
    mutation.mutate({ enabled: !enabled });
  }

  function applyRate(rate) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    mutation.mutate({ ratePerMinute: rate });
  }

  function handleRateInputBlur() {
    const rate = parseInt(rateInput, 10);
    if (rate === currentRate) return;
    applyRate(rate);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500">Scrub speed</h2>
          <p className="text-lg font-semibold text-slate-800 mt-1">
            {enabled ? `Rate limited (~${currentRate.toLocaleString()}/min per buyer)` : "As fast as possible"}
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
          disabled={mutation.isPending}
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

      {enabled && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="text-sm font-medium text-slate-500" htmlFor="rate-per-minute">
            Target rate (per buyer, per minute)
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id="rate-per-minute"
              type="number"
              min="1"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={handleRateInputBlur}
              disabled={mutation.isPending}
              className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
            />
            {RATE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setRateInput(String(preset));
                  applyRate(preset);
                }}
                disabled={mutation.isPending}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                  currentRate === preset
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset.toLocaleString()}/min
              </button>
            ))}
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {mutation.error?.response?.data?.error || "Failed to update scrub speed."}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Applies to jobs that start after this change - a job already running keeps the settings it
        started with.
      </p>
    </div>
  );
}
