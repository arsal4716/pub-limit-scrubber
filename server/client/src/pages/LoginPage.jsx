import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { loginPublisher } from "../api/publisherAuth";
import { usePublisherAuth } from "../context/PublisherAuthContext.jsx";
import StateRestrictionNotice from "../components/StateRestrictionNotice.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = usePublisherAuth();
  const [publisherName, setPublisherName] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => loginPublisher({ publisherName: publisherName.trim(), password }),
    onSuccess: (data) => {
      signIn(data.token, data.name);
      navigate("/upload");
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!publisherName.trim() || !password) return;
    loginMutation.mutate();
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-semibold text-slate-800 text-center">Publisher sign in</h1>
      <div className="mt-4">
        <StateRestrictionNotice />
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Publisher name</label>
          <input
            value={publisherName}
            onChange={(e) => setPublisherName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="username"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="current-password"
          />
        </div>
        {loginMutation.isError && (
          <p className="text-sm text-red-600">
            {loginMutation.error?.response?.data?.error || "Sign in failed."}
          </p>
        )}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {loginMutation.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-800">
          Sign up
        </Link>
      </p>
    </div>
  );
}
