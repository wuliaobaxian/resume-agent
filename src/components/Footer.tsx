export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center">
        <p>
          <span className="font-medium text-zinc-900">Resume Agent</span> · Built with
          Next.js · GLM-4.6
        </p>
        <a
          href="#"
          className="transition-colors hover:text-zinc-900"
          aria-label="GitHub repository"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
