import type { Metadata } from 'next';

// Sibling to the (auth)/(dashboard) route groups, so it inherits only the root layout — no
// sidebar, topbar or auth gating. `/intake` is deliberately absent from PROTECTED_PATH_PREFIXES.
export const metadata: Metadata = {
  title: 'Patient enquiry',
  // A link handed to patients has no business in search results, and the page collects health
  // information — it should not be indexed or cached by intermediaries.
  robots: { index: false, follow: false },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted/20">{children}</div>;
}
