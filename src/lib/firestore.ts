import { getFirestore, doc, setDoc } from "firebase/firestore";
import { app } from "@/lib/firebase";

export const db = getFirestore(app);

// Usage example
await setDoc(doc(db, "projects", projectName), {
  parsedRows,
  bidRows,
  reconciled,
  updatedAt: Date.now()
});
