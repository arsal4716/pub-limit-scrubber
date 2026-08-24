import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { usePublisherAuth } from "../context/PublisherAuthContext.jsx";

export default function Layout() {
  const { isAuthenticated: isAdminAuthenticated, username, signOut: adminSignOut } = useAuth();
  const {
    isAuthenticated: isPublisherAuthenticated,
    name: publisherName,
    signOut: publisherSignOut,
  } = usePublisherAuth();
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link
            to={isAdminArea ? "/admin" : "/upload"}
            className="font-semibold text-slate-800 tracking-tight"
          >
            Pub Limit Scrubber
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {isAdminArea && isAdminAuthenticated && (
              <>
                <span className="text-slate-400">{username}</span>
                <button
                  onClick={adminSignOut}
                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Sign out
                </button>
              </>
            )}
            {!isAdminArea && isPublisherAuthenticated && (
              <>
                <span className="text-slate-400">{publisherName}</span>
                <button
                  onClick={publisherSignOut}
                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
