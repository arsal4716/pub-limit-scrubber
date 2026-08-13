import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminPublishers,
  createAdminPublisher,
  updateAdminPublisher,
} from "../../api/admin";
import ProgressBar from "../ProgressBar.jsx";

export default function PublisherTable() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-publishers"], queryFn: fetchAdminPublishers });
  const publishers = data?.publishers || [];

  const [newName, setNewName] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-publishers"] });
    queryClient.invalidateQueries({ queryKey: ["global-config"] });
    queryClient.invalidateQueries({ queryKey: ["buyer-config"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createAdminPublisher(newName.trim()),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminPublisher(id, updates),
    onSuccess: () => {
      invalidate();
    },
  });

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate();
  }

  function toggleActive(pub) {
    updateMutation.mutate({ id: pub.id, updates: { active: !pub.active } });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-sm font-medium text-slate-500 mb-3">Add a publisher</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Acme Leads"
            />
          </div>
          <p className="text-xs text-slate-400 max-w-xs">
            Every publisher automatically gets the same daily capacity - the sum of both buyers'
            per-publisher limits (set in the Buyer API daily limits card above). There's no
            per-publisher limit to configure here anymore.
          </p>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Add publisher
          </button>
        </form>
        {createMutation.isError && (
          <p className="mt-2 text-sm text-red-600">
            {createMutation.error?.response?.data?.error || "Failed to create publisher."}
          </p>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-5 py-2 font-medium">Publisher</th>
            <th className="text-left px-5 py-2 font-medium">Today's usage (total)</th>
            <th className="text-left px-5 py-2 font-medium">LM</th>
            <th className="text-left px-5 py-2 font-medium">HC</th>
            <th className="text-left px-5 py-2 font-medium">Status</th>
            <th className="text-right px-5 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {publishers.map((pub) => (
            <tr key={pub.id}>
              <td className="px-5 py-3 text-slate-700">{pub.name}</td>
              <td className="px-5 py-3 w-48">
                <p className="text-xs text-slate-500 mb-1">
                  {pub.usedToday.toLocaleString()} / {pub.dailyLimit.toLocaleString()}
                </p>
                <ProgressBar value={pub.usedToday} max={pub.dailyLimit || 1} colorClass="bg-emerald-600" />
              </td>
              {["LM", "HC"].map((key) => {
                const buyer = pub.buyers.find((b) => b.key === key);
                return (
                  <td key={key} className="px-5 py-3 text-slate-600 text-xs">
                    {buyer.usedToday.toLocaleString()} / {buyer.dailyLimit.toLocaleString()}
                  </td>
                );
              })}
              <td className="px-5 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    pub.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {pub.active ? "Active" : "Disabled"}
                </span>
              </td>
              <td className="px-5 py-3 text-right space-x-3">
                <button
                  onClick={() => toggleActive(pub)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {pub.active ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))}
          {publishers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-center text-slate-400 text-sm">
                No publishers yet. Add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {updateMutation.isError && (
        <p className="px-5 pb-4 text-sm text-red-600">
          {updateMutation.error?.response?.data?.error || "Failed to update publisher."}
        </p>
      )}
    </div>
  );
}
