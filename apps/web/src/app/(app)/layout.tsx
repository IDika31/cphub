import AuthGuard from "@/components/auth/auth-guard";
import ShellLayout from "@/components/shell/shell-layout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ShellLayout>{children}</ShellLayout>
    </AuthGuard>
  );
}
