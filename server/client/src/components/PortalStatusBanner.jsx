import { useQuery } from "@tanstack/react-query";
import { fetchPortalStatus } from "../api/scrub";

export function usePortalStatus() {
  return useQuery({
    queryKey: ["portal-status"],
    queryFn: fetchPortalStatus,
    refetchInterval: 60 * 1000,
  });
}

// Shows nothing while the portal is open; otherwise a clear notice.
export default function PortalStatusBanner() {
  const { data } = usePortalStatus();
  if (!data || data.open) return null;

  const isDown = data.reason === "off";
  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 text-sm ${
        isDown
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">{isDown ? "Portal temporarily down" : "Scrubber is closed"}</p>
      <p className="mt-1">{data.message}</p>
    </div>
  );
}
