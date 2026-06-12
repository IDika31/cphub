"use client";

import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";

const PROVIDERS = [
  {
    name: "Codeforces",
    connected: true,
    handle: "andikanugraha",
    rating: 1427,
    maxRating: 1562,
  },
  {
    name: "TLX TOKI",
    connected: false,
    description: "Hubungkan akun TLX via browser extension untuk mulai sync problem.",
  },
  {
    name: "Google",
    connected: true,
    email: "andika@gmail.com",
  },
];

export default function ConnectionsPage() {
  return (
    <>
      <Topbar title="Connections" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="space-y-3 max-w-[600px]">
          {PROVIDERS.map((p) => (
            <div
              key={p.name}
              className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex items-center gap-4"
            >
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  p.connected ? "bg-[#10b981]" : "bg-[#52525b]"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[14px] font-semibold text-[#e4e4e7]">
                    {p.name}
                  </span>
                  {p.connected ? (
                    <Badge variant="verdict-ac">Connected</Badge>
                  ) : (
                    <Badge variant="verdict-pending">Not Connected</Badge>
                  )}
                </div>
                {"handle" in p && (
                  <p className="text-[12px] text-[#71717a]">
                    {p.handle}
                    {"rating" in p && ` · Rating: ${p.rating} (max ${p.maxRating})`}
                  </p>
                )}
                {"email" in p && (
                  <p className="text-[12px] text-[#71717a]">{p.email}</p>
                )}
                {"description" in p && (
                  <p className="text-[12px] text-[#71717a]">{p.description}</p>
                )}
              </div>
              <Button variant={p.connected ? "danger" : "primary"}>
                {p.connected ? "Unlink" : "Link"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
