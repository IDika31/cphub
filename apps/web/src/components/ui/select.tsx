import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, className = "", ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] cursor-pointer outline-none focus:outline-2 focus:outline-[#8b5cf6] ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  },
);

Select.displayName = "Select";
export default Select;
