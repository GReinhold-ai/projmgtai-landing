import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export const uploadFileAndGetURL = async (file: File, path: string): Promise<string> => {
  const storage = getStorage();
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
};
