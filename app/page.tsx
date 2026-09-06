import Link from 'next/link';

export default function Landing() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-brand" /> Live AR dining demo
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">
          See the food <span className="text-brand">before</span> you order it.
        </h1>
        <p className="text-muted max-w-md">
          Scan a table QR, explore the menu, place a 3D dish on your real table, then order — all from your phone. No app to install.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link href="/t/demo-12" className="rounded-full bg-brand px-6 py-3 font-semibold text-black">
            Open Table 12 (demo)
          </Link>
          <Link href="/t/demo-8" className="rounded-full border border-line px-6 py-3 font-semibold">
            Open Table 8 (demo)
          </Link>
        </div>
        <p className="text-xs text-muted pt-6">Need a courier? <Link href="/delivery" className="text-brand underline">Send a delivery</Link> · Driver? <Link href="/driver" className="text-brand underline">Driver dashboard</Link> · Staff? <Link href="/login" className="text-brand underline">Dashboard</Link></p>
      </div>
      <footer className="px-6 py-6 text-center text-xs text-muted border-t border-line">
        Restaurant Experience Platform · Phase 1 preview
      </footer>
    </main>
  );
}
