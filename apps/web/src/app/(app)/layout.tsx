import AuthGuard from "@/components/auth/auth-guard";
import ShellLayout from "@/components/shell/shell-layout";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ToastProvider>
        <ShellLayout>{children}</ShellLayout>
      </ToastProvider>
    </AuthGuard>
  );
}
