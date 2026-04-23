import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Confidence, Severity } from "@/lib/mock-data";

interface GapCardProps {
  area: string;
  severity: Severity;
  confidence: Confidence;
  description: string;
  honestNote: string;
}

const severityStyle: Record<Severity, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const severityLabel: Record<Severity, string> = {
  high: "High severity",
  medium: "Medium severity",
  low: "Low severity",
};

const confidenceLabel: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function GapCard({
  area,
  severity,
  confidence,
  description,
  honestNote,
}: GapCardProps) {
  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900">{area}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={severityStyle[severity]}>
              {severityLabel[severity]}
            </Badge>
            <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-600">
              {confidenceLabel[confidence]}
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-zinc-600 leading-relaxed">{description}</p>
        <div className="mt-4 border-l-4 border-zinc-900 bg-zinc-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Honest note
          </p>
          <p className="mt-1 text-sm text-zinc-700 leading-relaxed">{honestNote}</p>
        </div>
      </CardContent>
    </Card>
  );
}
