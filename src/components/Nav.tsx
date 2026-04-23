import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight text-zinc-900">
          Resume Agent
        </Link>
        <Link
          href="/analyze"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Start Analysis
        </Link>
      </div>
    </header>
  );
}
