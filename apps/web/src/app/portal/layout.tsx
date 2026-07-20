// Minimal branded wrapper for the public patient portal — sibling to the (auth)/(dashboard)
// route groups, so it inherits only the root layout (no sidebar/topbar/auth gating).
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted/20">{children}</div>;
}
