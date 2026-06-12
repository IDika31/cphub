import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  default:
    "bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] hover:bg-[#18181b]",
  primary:
    "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]",
  ghost:
    "bg-transparent border-transparent text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] px-[8px] py-[4px]",
  danger:
    "bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.18)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium transition-colors ${styles[variant]} ${disabled ? "opacity-45 pointer-events-none" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
export default Button;
