// File: src/components/Input.tsx
export const Input = ({ label, placeholder, type = "text", ...props }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type={type}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded px-3 py-2"
      {...props}
    />
  </div>
);

// File: src/components/Dropdown.tsx
export const Dropdown = ({ label, options = [], value, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full border border-gray-300 rounded px-3 py-2"
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

// File: src/components/FileUpload.tsx
export const FileUpload = ({ label, accept, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="file"
      accept={accept}
      onChange={onChange}
      className="w-full border border-gray-300 rounded px-3 py-2"
    />
  </div>
);

// File: src/components/Button.tsx
export const Button = ({ children, ...props }) => (
  <button
    className="bg-orange-500 text-white px-6 py-2 rounded-xl hover:bg-orange-600"
    {...props}
  >
    {children}
  </button>
);

// File: src/types/project.ts
export interface ProjectInfo {
  role: string;
  companyName: string;
  projectName: string;
  projectType: string;
  location: string;
  estStartDate: string;
  description: string;
  trades: string[];
}

// File: src/types/user.ts
export interface UserProfile {
  email?: string;
  company: string;
  role: string;
}

// File: src/utils/formatDate.ts
export const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

// File: src/utils/firestore.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // PLACEHOLDER – replace with your config
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// File: src/utils/uploadFiles.ts
export const uploadFiles = async (fileList: FileList): Promise<string[]> => {
  // Placeholder logic – connect to Firestore/Storage/Backend API
  return Array.from(fileList).map((file) => file.name);
};