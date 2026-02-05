// src/components/DropdownField.tsx
import React from "react";

type DropdownFieldProps = {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
};

export const DropdownField = ({ label, value, onChange, options }: DropdownFieldProps) => (
  <div className="mb-4">
    <label className="block font-medium text-sm mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full p-2 border rounded text-sm"
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);
