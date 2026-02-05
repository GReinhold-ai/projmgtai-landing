// src/components/InputField.tsx
import React from "react";

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  name?: string;
};

export const InputField = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  name,
}: InputFieldProps) => (
  <div className="mb-4">
    <label className="block font-medium text-sm mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      name={name}
      className="w-full p-2 border rounded text-sm"
    />
  </div>
);
