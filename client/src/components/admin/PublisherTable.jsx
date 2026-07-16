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
  const [newLimit, setNewLimit] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-publishers"] });
    queryClient.invalidateQueries({ queryKey: ["global-config"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createAdminPublisher(newName.trim(), Number(newLimit)),
    onSuccess: () => {
      setNewName("");
      setNewLimit("");
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminPublisher(id, updates),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || newLimit === "") return;
    createMutation.mutate();
  }

  function startEdit(pub) {
    setEditingId(pub.id);
    setEditValue(String(pub.dailyLimit));
  }

  function saveEdit(id) {
    const parsed = Number(editValue);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateMutation.mutate({ id, updates: { dailyLimit: parsed } });
    }
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
          <div>
            <label className="block text-xs text-slate-500 mb-1">Daily limit</label>
            <input
              type="number"
              min="0"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="20000"
            />
          </div>
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
            <th className="text-left px-5 py-2 font-medium">Today's usage</th>
            <th className="text-left px-5 py-2 font-medium">Daily limit</th>
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
              <td className="px-5 py-3">
                {editingId === pub.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(pub.id)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  pub.dailyLimit.toLocaleString()
                )}
              </td>
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
                {editingId !== pub.id && (
                  <button
                    onClick={() => startEdit(pub)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Edit limit
                  </button>
                )}
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
              <td colSpan={5} className="px-5 py-6 text-center text-slate-400 text-sm">
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
