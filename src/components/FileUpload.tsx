"use client";

import { useState } from "react";
import { uploadFileAndSaveToFirestore } from "@/lib/storage";

export default function FileUpload({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [trade, setTrade] = useState("Millwork");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    if (!file || !trade) return;

    setLoading(true);
    try {
      const docId = await uploadFileAndSaveToFirestore(file, trade, projectId);
      setStatus(`✅ Uploaded! File ID: ${docId}`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-900 shadow-md max-w-md mx-auto">
      <h2 className="text-lg font-semibold mb-2">Upload File</h2>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-2"
      />

      <select
        value={trade}
        onChange={(e) => setTrade(e.target.value)}
        className="mb-2 p-2 border rounded w-full"
      >
        <option value="Millwork">Millwork</option>
        <option value="Electrical">Electrical</option>
        <option value="Plumbing">Plumbing</option>
        <option value="Concrete">Concrete</option>
        {/* Add more trades as needed */}
      </select>

      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Uploading..." : "Upload"}
      </button>

      {status && <p className="mt-3 text-sm">{status}</p>}
    </div>
  );
}
