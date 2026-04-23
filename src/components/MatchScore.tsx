import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

interface MatchScoreProps {
  score: number;
  verdict: string;
  summary: string;
}

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-red-700";
}

export function MatchScore({ score, verdict, summary }: MatchScoreProps) {
  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardContent className="p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Overall Match
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{verdict}</h2>
            <p className="mt-3 text-zinc-600 leading-relaxed">{summary}</p>
          </div>
          <div className="flex items-baseline gap-1 sm:text-right">
            <span className={`text-6xl font-semibold tabular-nums ${scoreTone(score)}`}>
              {score}
            </span>
            <span className="text-2xl font-medium text-zinc-400">%</span>
          </div>
        </div>
        <div className="mt-6">
          <Progress value={score} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
