import { Brand } from "@/components/brand";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-page">
      <header>
        <Brand />
      </header>
      <main id="main-content" className="auth-card">
        {children}
      </main>
      <footer>Peak Leads · Internal operations</footer>
    </div>
  );
}
