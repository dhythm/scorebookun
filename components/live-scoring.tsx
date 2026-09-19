"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Scoreboard } from "@/components/scoreboard";
import { GameSituation } from "@/components/game-situation";
import { BattingOrderPanel } from "@/components/batting-order";
import { RunnerAdvanceSheet } from "@/components/runner-advance-sheet";
import { AtBatResultDialog } from "@/components/at-bat-result-dialog";
import {
  BaseRunningEventSheet,
  type BaseRunningEventResult,
} from "@/components/base-running-event-sheet";
import { SubstitutionSheet } from "@/components/substitution-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useGame } from "@/lib/game-context";
import type {
  AtBatResult,
  BattedBall,
  GameEvent,
  RunnerMovement,
} from "@/lib/domain/types";
import {
  canApplyDefaultMovementsWithoutConfirmation,
  generateId,
} from "@/lib/game-utils";
import { getCurrentBatter } from "@/lib/app-state/selectors";
import {
  createAtBatEvent,
  createBaseRunningEvent,
  createGameControlEvent,
  createGameNoteEvent,
  getDefaultMovementsForSelection,
} from "@/lib/app-state/event-factory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Flag,
  RotateCcw,
  Footprints,
  MessageSquarePlus,
  PlusCircle,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";
import { formatViolationMessage } from "@/lib/app-state/feedback";
import { ShareGameButton } from "@/components/share-game-button";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { SituationMiniHeader } from "@/components/situation-mini-header";
import { EventIntegrityAlert } from "@/components/event-integrity-alert";
import { GameNoteDialog } from "@/components/game-note-dialog";
import { DisplaySettingsDialog } from "@/components/display-settings-dialog";
import { EditHistoryControls } from "@/components/edit-history-controls";

export function LiveScoring() {
  const { game, dispatch, addEvent } = useGame();
  const [pendingResult, setPendingResult] = useState<AtBatResult | null>(null);
  const [pendingDetail, setPendingDetail] = useState<string | undefined>();
  const [pendingBattedBall, setPendingBattedBall] = useState<
    BattedBall | undefined
  >();
  const [showEndGameDialog, setShowEndGameDialog] = useState(false);
  const [atBatDialogOpen, setAtBatDialogOpen] = useState(false);
  const [baseRunningOpen, setBaseRunningOpen] = useState(false);
  const [initialBaseRunningRunnerId, setInitialBaseRunningRunnerId] = useState<
    string | undefined
  >();
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [gameNoteOpen, setGameNoteOpen] = useState(false);
  const [gameEndReason, setGameEndReason] = useState("規定回終了");

  if (!game) return null;

  const currentBatter = getCurrentBatter(game);

  const recordEvent = (event: GameEvent, successMessage: string): boolean => {
    const result = addEvent(event);
    if (!result.accepted) {
      toast.error(
        result.violations[0]
          ? formatViolationMessage(result.violations[0])
          : "入力内容を記録できませんでした。"
      );
      return false;
    }
    const warning = result.violations.find(
      (violation) => violation.severity === "warning"
    );
    if (warning) {
      toast.warning(`${successMessage} ${formatViolationMessage(warning)}`);
    } else {
      toast.success(successMessage);
    }
    return true;
  };

  const handleAtBatResult = (
    result: AtBatResult,
    detail?: string,
    battedBall?: BattedBall
  ) => {
    if (!currentBatter) return;

    const movements = getDefaultMovementsForSelection(
      result,
      detail,
      game.currentState.runners,
      currentBatter.id,
      game.currentState.outs,
      battedBall
    );
    const canApplyDefaults = canApplyDefaultMovementsWithoutConfirmation(
      result,
      game.currentState.runners,
      movements
    );

    if (canApplyDefaults) {
      recordEvent(
        createAtBatEvent({
          id: generateId(),
          batterId: currentBatter.id,
          result,
          detail,
          battedBall,
          movements,
        }),
        "打席を記録しました"
      );
    } else {
      setPendingResult(result);
      setPendingDetail(detail);
      setPendingBattedBall(battedBall);
    }
  };

  const handleRunnerAdvanceConfirm = (movements: RunnerMovement[]) => {
    if (!currentBatter || !pendingResult) return;

    if (
      !recordEvent(
        createAtBatEvent({
          id: generateId(),
          batterId: currentBatter.id,
          result: pendingResult,
          detail: pendingDetail,
          battedBall: pendingBattedBall,
          movements,
        }),
        "打席を記録しました"
      )
    ) {
      return;
    }

    setPendingResult(null);
    setPendingDetail(undefined);
    setPendingBattedBall(undefined);
  };

  const handleBaseRunningEvent = (payload: BaseRunningEventResult): boolean => {
    return recordEvent(
      createBaseRunningEvent({
        id: generateId(),
        type: payload.type,
        movements: payload.movements,
        rbiCreditBatterId: payload.rbiCreditBatterId,
      }),
      "走塁を記録しました"
    );
  };

  const handleUndo = () => {
    if (game.events.length === 0) return;
    if (!dispatch({ type: "UNDO_LAST_EVENT" })) return;
    toast("直前の記録を取り消しました", {
      action: {
        label: "やり直す",
        onClick: () => dispatch({ type: "REDO_LAST_EVENT" }),
      },
    });
  };

  const handleEndGame = () => {
    if (
      !recordEvent(
        createGameControlEvent({
          id: generateId(),
          reason: gameEndReason,
        }),
        "試合終了を記録しました"
      )
    ) {
      return;
    }
    setShowEndGameDialog(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-primary-foreground/10 bg-primary px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-primary-foreground shadow-sm sm:px-5 sm:pb-3">
        <h1 className="flex items-center gap-2 text-base font-extrabold tracking-tight sm:text-lg">
          <span className="text-lg opacity-90 sm:text-xl">&#9918;</span>
          {/* Six 44px actions leave no room for the name on a phone. */}
          <span className="sr-only min-[480px]:not-sr-only">
            スコアブッくん
          </span>
        </h1>
        <div className="flex shrink-0 items-center gap-0.5">
          <ShareGameButton />
          <FeedbackDialog />
          <DisplaySettingsDialog />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setGameNoteOpen(true)}
            aria-label="試合メモを記録"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10 sm:inline-flex"
            disabled={game.events.length === 0}
            onClick={handleUndo}
            aria-label="直前の記録を取り消す"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setSubstitutionOpen(true)}
            aria-label="選手交代"
          >
            <UserRoundCog className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10 touch-manipulation"
            onClick={() => setShowEndGameDialog(true)}
            aria-label="試合終了"
          >
            <Flag className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="w-full flex-1 px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-6 sm:pt-5 lg:px-6">
        <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
          <section className="min-w-0 space-y-3 lg:sticky lg:top-[5.25rem]">
            <EventIntegrityAlert game={game} />
            <EditHistoryControls />
            <Scoreboard game={game} collapsibleOnMobile />
            <GameSituation
              game={game}
              onRecordResult={() => setAtBatDialogOpen(true)}
              onOpenBaseRunning={() => {
                setInitialBaseRunningRunnerId(undefined);
                setBaseRunningOpen(true);
              }}
              onRunnerSelect={(runnerId) => {
                setInitialBaseRunningRunnerId(runnerId);
                setBaseRunningOpen(true);
              }}
            />
          </section>
          <section className="min-w-0">
            <BattingOrderPanel game={game} />
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(20,50,28,0.14)] sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-[0.8fr_1fr_1.45fr] gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-col gap-0 border-border bg-card text-[11px] touch-manipulation"
            disabled={game.events.length === 0}
            onClick={handleUndo}
          >
            <RotateCcw className="h-4 w-4" />
            戻す
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-12 flex-col gap-0 bg-secondary text-[11px] touch-manipulation"
            disabled={
              !game.currentState.runners.first &&
              !game.currentState.runners.second &&
              !game.currentState.runners.third
            }
            onClick={() => {
              setInitialBaseRunningRunnerId(undefined);
              setBaseRunningOpen(true);
            }}
          >
            <Footprints className="h-4 w-4" />
            走塁
          </Button>
          <Button
            type="button"
            className="h-12 text-sm font-extrabold shadow-sm touch-manipulation"
            onClick={() => setAtBatDialogOpen(true)}
          >
            <PlusCircle className="h-5 w-5" />
            結果入力
          </Button>
        </div>
      </div>

      <AtBatResultDialog
        game={game}
        open={atBatDialogOpen}
        onOpenChange={setAtBatDialogOpen}
        mode="new"
        onNewResult={handleAtBatResult}
      />

      <GameNoteDialog
        open={gameNoteOpen}
        onOpenChange={setGameNoteOpen}
        onSubmit={(text) =>
          recordEvent(
            createGameNoteEvent({ id: generateId(), text }),
            "メモを記録しました"
          )
        }
      />

      <Sheet
        open={baseRunningOpen}
        onOpenChange={(open) => {
          setBaseRunningOpen(open);
          if (!open) setInitialBaseRunningRunnerId(undefined);
        }}
      >
        <SheetContent
          side="bottom"
          className="left-1/2 right-auto max-h-[88dvh] w-[min(100%,42rem)] -translate-x-1/2 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x border-t bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.18)]"
        >
          <SheetHeader className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
            <SheetTitle className="text-lg font-extrabold">
              走塁・打席外
            </SheetTitle>
            <SituationMiniHeader game={game} snapshot={game.currentState} />
          </SheetHeader>
          <BaseRunningEventSheet
            game={game}
            initialRunnerId={initialBaseRunningRunnerId}
            onEvent={(p) => {
              if (handleBaseRunningEvent(p)) {
                setBaseRunningOpen(false);
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={substitutionOpen} onOpenChange={setSubstitutionOpen}>
        <SheetContent
          side="bottom"
          className="left-1/2 right-auto max-h-[88dvh] w-[min(100%,42rem)] -translate-x-1/2 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x border-t bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.18)]"
        >
          <SheetHeader className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
            <SheetTitle className="text-lg font-extrabold">選手交代</SheetTitle>
            <SituationMiniHeader game={game} snapshot={game.currentState} />
          </SheetHeader>
          <SubstitutionSheet
            game={game}
            onSubmit={(event) => {
              if (recordEvent(event, "選手交代を記録しました")) {
                setSubstitutionOpen(false);
              }
            }}
          />
        </SheetContent>
      </Sheet>

      {pendingResult && (
        <RunnerAdvanceSheet
          game={game}
          result={pendingResult}
          detail={pendingDetail}
          battedBall={pendingBattedBall}
          open={!!pendingResult}
          onOpenChange={(open) => {
            if (!open) {
              setPendingResult(null);
              setPendingDetail(undefined);
              setPendingBattedBall(undefined);
            }
          }}
          onReselectResult={() => {
            setPendingResult(null);
            setPendingDetail(undefined);
            setPendingBattedBall(undefined);
            setAtBatDialogOpen(true);
          }}
          onConfirm={handleRunnerAdvanceConfirm}
        />
      )}

      <AlertDialog open={showEndGameDialog} onOpenChange={setShowEndGameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>試合を終了しますか？</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              試合終了の確認
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">終了理由</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                "規定回終了",
                "時間切れ",
                "コールド",
                "降雨・中止",
                "没収試合",
                "その他",
              ].map((reason) => (
                <Button
                  key={reason}
                  type="button"
                  variant={gameEndReason === reason ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setGameEndReason(reason)}
                >
                  {reason}
                </Button>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndGame}>
              試合終了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
