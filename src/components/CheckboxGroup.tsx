// src/components/FileUpload.tsx
"use client";
import { useState } from "react";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { app } from "@/firebase"; // adjust this path if needed

type FileUploadProps = {
  label: string;
  onUploadComplete: (downloadURL: string) => void;
};

export const FileUpload = ({ label, onUploadComplete }: FileUploadProps) => {
  const [progress, setProgress] = useState<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const storage = getStorage(app);
    const storageRef = ref(storage, `uploads/${Date.now()}-${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on("state_changed",
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setProgress(percent);
      },
      (error) => console.error("Upload error:", error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        onUploadComplete(downloadURL);
        setProgress(null);
      }
    );
  };

  return (
    <div className="mb-4">
      <label className="block font-medium text-sm mb-1">{label}</label>
      <input type="file" onChange={handleFileChange} className="block w-full text-sm" />
      {progress !== null && <p className="text-sm mt-1">Uploading: {progress}%</p>}
    </div>
  );
};
