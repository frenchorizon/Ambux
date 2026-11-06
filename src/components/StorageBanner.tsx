import { useStorageNotice } from "../lib/browserStore";

export function StorageBanner() {
  const notice = useStorageNotice();
  if (notice.level === "ok") return null;
  return (
    <div role="alert" className="bg-coral px-4 py-2 text-sm text-night-0">
      {notice.message}
    </div>
  );
}
