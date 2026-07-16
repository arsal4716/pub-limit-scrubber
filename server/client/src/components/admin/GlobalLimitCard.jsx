import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGlobalConfig, updateGlobalConfig } from "../../api/admin";
import ProgressBar from "../ProgressBar.jsx";

export default function GlobalLimitCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const { data: config } = useQuery({ queryKey: ["global-config"], queryFn: fetchGlobalConfig });

  const updateMutation = useMutation({
    mutationFn: (totalDailyLimit) => updateGlobalConfig(totalDailyLimit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-publishers"] });
      setEditing(false);
    },
  });

  if (!config) return null;

  function startEditing() {
    setValue(String(config.totalDailyLimit));
    setEditing(true);
  }

  function handleSave(e) {
    e.preventDefault();
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateMutation.mutate(parsed);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-500">Global daily lead limit</h2>
          <p className="text-2xl font-semibold text-slate-800 mt-1">
            {config.usedToday.toLocaleString()} / {config.totalDailyLimit.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Resets at midnight US Eastern &middot; {config.remainingToday.toLocaleString()} remaining
            today ({config.dateKey})
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEditing}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Edit limit
          </button>
        )}
      </div>

      <div className="mt-4">
        <ProgressBar value={config.usedToday} max={config.totalDailyLimit} />
      </div>

      {editing && (
        <form onSubmit={handleSave} className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </form>
      )}
      {updateMutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {updateMutation.error?.response?.data?.error || "Failed to update limit."}
        </p>
      )}
    </div>
  );
}
