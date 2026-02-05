// src/lib/parsePlansAndSaveScopes.ts
export async function parsePlansAndSaveScopes(opts: {
  apiBase: string;
  file: File;
  selectedTrades: string[];
  firebaseApp: FirebaseApp;
  projectId: string;
  authToken?: string;
  uid?: string;
  plan?: 'free'|'pro';
}) {
  const { apiBase, file, selectedTrades, firebaseApp, projectId, authToken, uid, plan='free' } = opts;
  const form = new FormData();
  form.append("file", file);
  form.append("trades_json", JSON.stringify(selectedTrades));

  const res = await fetch(`${apiBase}/analyze/parse_plans`, {
    method: "POST",
    body: form,
    headers: {
      ...(uid ? { "X-User-Id": uid } : {}),
      "X-Plan": plan,
      ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
    },
  });
  // ... rest unchanged
}
