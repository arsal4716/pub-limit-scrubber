import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updatePortalEnabled } from "../../api/admin";

export default function PortalToggleCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });
  const mutation = useMutation({
    mutationFn: updatePortalEnabled,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["global-config"] }),
  });

  if (!config) return null;
  const enabled = config.portalEnabled;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500">Portal</h2>
          <p className="text-lg font-semibold text-slate-800 mt-1">
            {enabled ? "ON: working (within operating hours)" : "OFF: shown as temporarily down"}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Operating hours (Eastern Time): Mon-Fri 9:00 AM - 9:00 PM, Sat-Sun 9:00 AM - 3:00 PM.
            Outside those hours publishers see a "closed" message with the reopening time. When
            this switch is OFF they see "temporarily down" at any time. In both cases no new
            uploads or API checks are accepted and running files pause until the portal reopens.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => mutation.mutate(!enabled)}
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
      {mutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {mutation.error?.response?.data?.error || "Failed to update portal switch."}
        </p>
      )}
    </div>
  );
}
