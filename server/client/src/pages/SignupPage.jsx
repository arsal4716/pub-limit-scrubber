import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { signupPublisher } from "../api/publisherAuth";

export default function SignupPage() {
  const [publisherName, setPublisherName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signupMutation = useMutation({
    mutationFn: () =>
      signupPublisher({ publisherName: publisherName.trim(), email: email.trim(), password }),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!publisherName.trim() || !email.trim() || !password) return;
    signupMutation.mutate();
  }

  if (signupMutation.isSuccess) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-slate-800">Request submitted</h1>
        <p className="text-sm text-slate-500">{signupMutation.data.message}</p>
        <Link to="/login" className="inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-semibold text-slate-800 text-center">Publisher sign up</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        An admin will need to approve your request before you can log in.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Publisher name</label>
          <input
            value={publisherName}
            onChange={(e) => setPublisherName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="new-password"
            minLength={8}
          />
          <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
        </div>
        {signupMutation.isError && (
          <p className="text-sm text-red-600">
            {signupMutation.error?.response?.data?.error || "Signup failed."}
          </p>
        )}
        <button
          type="submit"
          disabled={signupMutation.isPending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {signupMutation.isPending ? "Submitting..." : "Sign up"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-800">
          Sign in
        </Link>
      </p>
    </div>
  );
}
