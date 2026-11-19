import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updatePortalMode } from "../../api/admin";

const MODES = [
  {
    key: "always",
    label: "Work anytime",
    help: "The scrubber accepts uploads and checks 24/7, ignoring operating hours.",
  },
  {
    key: "hours",
    label: "Within hours",
    help: "Works only Mon-Fri 9:00 AM - 9:00 PM and Sat-Sun 9:00 AM - 3:00 PM Eastern Time. Outside those hours publishers see a closed message with the reopening time.",
  },
  {
    key: "off",
    label: "Temporarily down",
    help: 'Publishers see "This portal is temporarily down" at any time. No new uploads or checks are accepted.',
  },
];

export default function PortalToggleCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });
  const mutation = useMutation({
    mutationFn: updatePortalMode,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["global-config"] }),
  });

  if (!config) return null;
  const current = MODES.find((m) => m.key === config.portalMode) || MODES[1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-slate-500">Portal availability</h2>
      <div role="radiogroup" aria-label="Portal availability" className="mt-3 inline-flex rounded-lg bg-slate-100 p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={current.key === m.key}
            disabled={mutation.isPending}
            onClick={() => current.key !== m.key && mutation.mutate(m.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              current.key === m.key
                ? m.key === "off"
                  ? "bg-red-600 text-white shadow"
                  : "bg-indigo-600 text-white shadow"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400 max-w-xl">{current.help}</p>
      <p className="mt-2 text-xs text-slate-400 max-w-xl">
        When the portal is closed or down, running files pause their buyer calls and continue
        automatically once it reopens.
      </p>
      {mutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {mutation.error?.response?.data?.error || "Failed to update portal setting."}
        </p>
      )}
    </div>
  );
}
