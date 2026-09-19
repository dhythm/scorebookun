"use client";

import { Beaker, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gamePath } from "@/lib/app-state/routes";
import { DEVELOPMENT_GAME_SCENARIOS } from "@/lib/dev-fixtures/game-scenarios";
import { shouldShowDevelopmentTools } from "@/lib/development-mode";
import { useGame } from "@/lib/game-context";

export function DevelopmentScenarioPanel() {
  const router = useRouter();
  const [scenarioId, setScenarioId] = useState(
    DEVELOPMENT_GAME_SCENARIOS[0]?.id ?? ""
  );

  const { createGame } = useGame();

  if (!shouldShowDevelopmentTools()) return null;

  const scenario = DEVELOPMENT_GAME_SCENARIOS.find(
    (item) => item.id === scenarioId
  );

  const loadScenario = async () => {
    if (!scenario) return;
    const id = await createGame(scenario.createGame());
    if (!id) {
      toast.error("検証シナリオを登録できませんでした");
      return;
    }
    router.push(gamePath(id));
    toast.success(`検証シナリオ「${scenario.title}」を読み込みました`);
  };
  return (
    <Card className="gap-3 border-dashed border-amber-500/70 bg-amber-50/70 py-4 dark:bg-amber-950/20">
      <CardHeader className="px-4 py-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Beaker className="h-4 w-4 text-amber-700" aria-hidden="true" />
            ローカル検証ツール
          </CardTitle>
          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-1 text-[11px] font-bold text-amber-950">
            開発時のみ
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <div className="space-y-2">
          <label
            htmlFor="development-scenario"
            className="text-sm font-semibold"
          >
            進行済みの試合パターン
          </label>
          <Select value={scenarioId} onValueChange={setScenarioId}>
            <SelectTrigger
              id="development-scenario"
              className="min-h-11 w-full bg-background"
              aria-label="検証する試合パターン"
            >
              <SelectValue placeholder="シナリオを選択" />
            </SelectTrigger>
            <SelectContent>
              {DEVELOPMENT_GAME_SCENARIOS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {scenario && (
            <div
              className="rounded-lg border border-amber-500/30 bg-background p-3"
              aria-live="polite"
            >
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                確認ポイント: {scenario.expectation}
              </p>
            </div>
          )}

          <Button
            type="button"
            className="h-12 w-full font-bold"
            disabled={!scenario}
            onClick={loadScenario}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            このシナリオを読み込む
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
