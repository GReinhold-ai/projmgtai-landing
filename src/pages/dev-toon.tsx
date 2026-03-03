import { useState } from "react";
import { encodeToon, decodeToon, estimateSavings } from "@/lib/toon";
import { MW_ITEM_SCHEMA } from "@/lib/toonSchemas";

export default function DevToon() {
  const [jsonText, setJsonText] = useState(`[{"item":"Upper cabinet","qty":4,"length":36,"width":12,"room":"Breakroom 204"}]`);
  const [toonText, setToonText] = useState("");

  function toToon() {
    const rows = JSON.parse(jsonText);
    const toon = encodeToon(rows, [...MW_ITEM_SCHEMA]);
    const est = estimateSavings(rows, [...MW_ITEM_SCHEMA]);
    setToonText(`# Savings: ~${est.savedPct}%\n${toon}`);
  }

  function toJson() {
    const rows = decodeToon(toonText.split("\n").filter(Boolean).slice(1).join("\n") ? toonText : toonText);
    setJsonText(JSON.stringify(rows, null, 2));
  }

  return (
    <main className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
      <section>
        <h2 className="font-bold mb-2">JSON</h2>
        <textarea className="w-full h-80 border rounded p-2 font-mono text-sm"
          value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
        <button onClick={toToon} className="mt-2 rounded px-3 py-1 bg-black text-white">Encode → TOON</button>
      </section>
      <section>
        <h2 className="font-bold mb-2">TOON</h2>
        <textarea className="w-full h-80 border rounded p-2 font-mono text-sm"
          value={toonText} onChange={(e) => setToonText(e.target.value)} />
        <button onClick={toJson} className="mt-2 rounded px-3 py-1 bg-black text-white">Decode → JSON</button>
      </section>
    </main>
  );
}
