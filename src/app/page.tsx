import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const primaryBtn =
  "inline-flex h-12 items-center justify-center rounded-md bg-zinc-900 px-6 text-base font-medium text-white transition-colors hover:bg-zinc-800";
const outlineBtn =
  "inline-flex h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-50";

const problems = [
  {
    title: "They inflate your match score",
    body: "85% match? Sure. Until you don't get a callback.",
  },
  {
    title: "They fabricate achievements",
    body: "Generic AI rewrites add numbers and projects that aren't yours.",
  },
  {
    title: "They ignore real gaps",
    body: "They'd rather smooth over problems than help you solve them.",
  },
];

const steps = [
  {
    n: "01",
    title: "Paste & upload",
    body: "Drop in a job description and your resume. PDF, DOCX, or plain text.",
  },
  {
    n: "02",
    title: "Honest analysis",
    body: "The agent breaks down match quality by dimension — skills, experience, seniority — with a confidence score for each gap it identifies.",
  },
  {
    n: "03",
    title: "Actionable suggestions",
    body: "Every suggestion is tied to a specific line in your resume. No fabricated achievements. No generic fluff.",
  },
];

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1 bg-white text-zinc-900">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Stop guessing if your resume fits.
            </h1>
            <p className="mt-6 text-xl text-zinc-600 leading-relaxed">
              An AI agent that analyzes your resume against any job description — and
              tells you honestly where the gaps are.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/analyze" className={primaryBtn}>
                Analyze My Resume
              </Link>
              <a href="#how-it-works" className={outlineBtn}>
                See How It Works
              </a>
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              No signup required · Honest feedback · Powered by GLM-4.6
            </p>
          </div>
        </section>

        {/* Problem */}
        <section className="border-t border-zinc-200 bg-zinc-50/50">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Most resume tools lie to you.
              </h2>
              <p className="mt-4 text-lg text-zinc-600">
                They polish. They embellish. They tell you what you want to hear.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {problems.map((p) => (
                <Card
                  key={p.title}
                  className="border-zinc-200 bg-white shadow-sm"
                >
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-zinc-600 leading-relaxed">{p.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                How it actually works
              </h2>
            </div>
            <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s) => (
                <div key={s.n} className="flex flex-col">
                  <span className="font-mono text-sm text-zinc-400">{s.n}</span>
                  <h3 className="mt-3 text-xl font-semibold text-zinc-900">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-zinc-600 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Differentiator */}
        <section className="border-t border-zinc-200 bg-zinc-50/50">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Built on one principle: honesty over flattery.
              </h2>
              <p className="mt-6 text-lg text-zinc-600 leading-relaxed">
                Other tools help you <em>look</em> like a fit. This agent helps you{" "}
                <em>know</em> if you are one. When your background doesn&apos;t match, it
                says so — and suggests roles that might fit better. When a gap is real,
                it won&apos;t pretend otherwise.
              </p>
              <blockquote className="mx-auto mt-10 max-w-2xl border-l-4 border-zinc-900 pl-6 text-left text-lg italic text-zinc-800">
                &ldquo;If the agent has to invent something to make you look qualified,
                it won&apos;t.&rdquo;
              </blockquote>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
            <Link
              href="/analyze"
              className="inline-flex h-14 items-center justify-center rounded-md bg-zinc-900 px-10 text-base font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Try It Now — Free
            </Link>
            <p className="mt-4 text-sm text-zinc-500">
              Your data stays in your browser. Nothing is stored.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
