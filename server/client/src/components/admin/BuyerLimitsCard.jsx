import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBuyerConfig, updateBuyerConfig } from "../../api/admin";

export default function BuyerLimitsCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["buyer-config"], queryFn: fetchBuyerConfig });

  const updateMutation = useMutation({
    mutationFn: ({ key, dailyLimit }) => updateBuyerConfig(key, dailyLimit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-config"] });
      queryClient.invalidateQueries({ queryKey: ["global-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-publishers"] });
    },
  });

  if (!data) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <div>
        <h2 className="text-sm font-medium text-slate-500">Buyer API daily limits</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Each value is the daily allotment EVERY publisher individually gets from that buyer -
          not a pool shared across publishers ({data.dateKey}). Currently supports up to{" "}
          {Number.isFinite(data.maxSupportablePublishers)
            ? data.maxSupportablePublishers.toLocaleString()
            : "unlimited"}{" "}
          active publisher{data.maxSupportablePublishers === 1 ? "" : "s"} under the global daily
          capacity ({data.activePublisherCount.toLocaleString()} active now).
        </p>
      </div>

      {data.buyers.map((buyer) => (
        <BuyerRow
          key={buyer.key}
          buyer={buyer}
          onSave={(dailyLimit) => updateMutation.mutate({ key: buyer.key, dailyLimit })}
          isSaving={updateMutation.isPending && updateMutation.variables?.key === buyer.key}
        />
      ))}

      {updateMutation.isError && (
        <p className="text-sm text-red-600">
          {updateMutation.error?.response?.data?.error || "Failed to update buyer limit."}
        </p>
      )}
    </div>
  );
}

function BuyerRow({ buyer, onSave, isSaving }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  function startEditing() {
    setValue(String(buyer.dailyLimitPerPublisher));
    setEditing(true);
  }

  function handleSave(e) {
    e.preventDefault();
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSave(parsed);
      setEditing(false);
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">{buyer.label}</p>
          <p className="text-lg font-semibold text-slate-800 mt-0.5">
            {buyer.dailyLimitPerPublisher.toLocaleString()} / publisher / day
          </p>
          <p className="text-xs text-slate-400">
            {buyer.usedTodayAcrossAllPublishers.toLocaleString()} used today across all publishers
            combined
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

      {editing && (
        <form onSubmit={handleSave} className="mt-3 flex items-center gap-2">
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
            disabled={isSaving}
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
    </div>
  );
}
