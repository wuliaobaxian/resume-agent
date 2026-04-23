import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SuggestionType } from "@/lib/mock-data";

interface SuggestionCardProps {
  type: SuggestionType;
  targetSection: string;
  originalText: string | null;
  suggestedText: string;
  reasoning: string;
  requiresUserInput: boolean;
}

const typeStyle: Record<SuggestionType, string> = {
  rewrite: "bg-zinc-900 text-white",
  add: "bg-emerald-900 text-white",
  remove: "bg-red-900 text-white",
};

export function SuggestionCard({
  type,
  targetSection,
  originalText,
  suggestedText,
  reasoning,
  requiresUserInput,
}: SuggestionCardProps) {
  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={`uppercase tracking-wide ${typeStyle[type]}`}>{type}</Badge>
          <span className="text-sm font-medium text-zinc-700">{targetSection}</span>
        </div>

        {originalText && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Before
            </p>
            <div className="mt-1 rounded-md border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-zinc-700">
              {originalText}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            After
          </p>
          <div className="mt-1 rounded-md border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-zinc-800">
            {suggestedText}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Why this change
          </p>
          <p className="mt-1 text-sm text-zinc-600 leading-relaxed">{reasoning}</p>
        </div>

        {requiresUserInput && (
          <div className="mt-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <span aria-hidden className="text-amber-700">
              ⚠
            </span>
            <p className="text-sm text-amber-900 leading-relaxed">
              This suggestion requires your input — don&apos;t let an AI fill in
              specifics you don&apos;t have.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
