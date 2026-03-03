// src/utils/firestore.ts

import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';

// Initialize Firestore and Storage with the same Firebase App
const db = getFirestore(getApp());
const storage = getStorage(getApp());

// Save project metadata to Firestore
export async function saveEstimatorProject(data: any) {
  try {
    const docRef = await addDoc(collection(db, 'estimatorProjects'), {
      ...data,
      createdAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving project:', error);
    throw error;
  }
}

// Upload file to Storage and log it in Firestore
export async function uploadFileAndSaveToFirestore(
  file: File,
  trade: string,
  projectId: string
) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const storagePath = `${user.uid}/${projectId}/${trade}/${file.name}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  const docRef = await addDoc(collection(db, 'projects', projectId, 'files'), {
    fileName: file.name,
    filePath: storagePath,
    url: downloadURL,
    trade,
    uploadedBy: user.uid,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
