"use client";
import { useState } from "react";
import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import { importTLXProblem } from "@/lib/api/tlx";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (problemId: string) => void;
}

export default function ImportTLXModal({ open, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    onClose();
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await importTLXProblem(url);
      setUrl("");
      handleClose();
      onSuccess?.(res.problemId);
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message || "Gagal mengimport problem TLX",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Problem TLX">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[13px] text-[#71717a]">
          Paste URL problem TLX — contoh:{" "}
          <span className="text-[#a1a1aa]">
            https://tlx.toki.id/problems/ioi-2024/day1a
          </span>
        </p>
        <div className="space-y-2">
          <label className="block text-[12px] text-[#a1a1aa]">URL Problem</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tlx.toki.id/problems/..."
            required
            className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#52525b] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>
        {error && <p className="text-[12px] text-[#ef4444]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Mengimport..." : "Import"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
