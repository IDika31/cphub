interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export default function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center px-[5px] py-[1px] text-[10px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] rounded-[4px] text-[#52525b] ${className}`}
    >
      {children}
    </kbd>
  );
}
