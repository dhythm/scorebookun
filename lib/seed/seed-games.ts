import type {
  FieldingPosition,
  GameConfig,
  GameEvent,
  Player,
  Team,
} from "@/lib/domain/types";
import type { SharedGame } from "@/lib/sync/shared-game";

import { createScoreSheet } from "./score-sheet";

type ScoreSheet = ReturnType<typeof createScoreSheet>;

export type SeedGame = {
  /** What this game is for, shown by `pnpm db:seed` and in the README. */
  summary: string;
  game: SharedGame;
};

// Batting order 1-9 of a typical amateur lineup.
const LINEUP_POSITIONS: readonly FieldingPosition[] = [
  "center",
  "second",
  "short",
  "first",
  "left",
  "third",
  "right",
  "catcher",
  "pitcher",
];

function team(
  name: string,
  idPrefix: string,
  lineupNames: readonly string[],
  benchNames: readonly string[] = []
): Team {
  const players = lineupNames.map((playerName, index): Player => ({
    id: `${idPrefix}-${index + 1}`,
    name: playerName,
    order: index + 1,
    position: LINEUP_POSITIONS[index],
  }));
  const pitcher = players[players.length - 1];
  return {
    name,
    players,
    ...(benchNames.length > 0 && {
      benchPlayers: benchNames.map((playerName, index): Player => ({
        id: `${idPrefix}-bench-${index + 1}`,
        name: playerName,
        order: players.length + index + 1,
      })),
    }),
    startingPitcherId: pitcher.id,
    startingPitcherName: pitcher.name,
  };
}

const thunders = () =>
  team(
    "荒川サンダース",
    "thunders",
    ["大野", "村上", "石井", "藤田", "岡本", "前田", "長谷川", "近藤", "坂本"],
    ["遠藤", "青木", "西村"]
  );
const bluebirds = () =>
  team(
    "世田谷ブルーバーズ",
    "bluebirds",
    ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林"],
    ["加藤", "吉田"]
  );
const falcons = () =>
  team(
    "多摩川ファルコンズ",
    "falcons",
    ["山田", "佐々木", "松本", "井上", "木村", "林", "斎藤", "清水", "山崎"],
    ["森", "池田"]
  );
const irons = () =>
  team(
    "川口アイアンズ",
    "irons",
    ["橋本", "阿部", "石川", "山下", "中島", "小川", "後藤", "菅原", "新井"],
    ["柴田"]
  );

function seedGame(
  id: string,
  date: string,
  summary: string,
  config: GameConfig,
  record: (sheet: ScoreSheet) => void,
  deletedEvents?: SharedGame["deletedEvents"]
): SeedGame {
  const sheet = createScoreSheet(id, config);
  record(sheet);
  return {
    summary,
    game: {
      id,
      date,
      status: sheet.snapshot().gameStatus,
      config,
      events: sheet.events(),
      ...(deletedEvents && { deletedEvents }),
    },
  };
}

const sevenInnings = (away: Team, home: Team): GameConfig => ({
  regulationInnings: 7,
  teams: { away, home },
});

function beforeFirstPitch(): SeedGame {
  // A DH game: the starting pitcher is outside the batting order.
  const home = bluebirds();
  home.players[8] = { ...home.players[8], name: "小林", position: "dh" };
  home.benchPlayers = [
    { id: "bluebirds-starter", name: "松井", order: 10, position: "pitcher" },
    ...(home.benchPlayers ?? []),
  ];
  home.startingPitcherId = "bluebirds-starter";
  home.startingPitcherName = "松井";
  return seedGame(
    "seed-before-first-pitch",
    "2026-09-20T00:30:00.000Z",
    "試合開始前。オーダー登録済み（後攻はDH制・控えあり）、プレー未記録",
    { regulationInnings: 9, teams: { away: thunders(), home } },
    () => {}
  );
}

function pitchersDuel(): SeedGame {
  return seedGame(
    "seed-live-pitchers-duel",
    "2026-09-19T01:00:00.000Z",
    "試合中（序盤）。3回表まで0対0の投手戦、三振が多い",
    sevenInnings(falcons(), irons()),
    (sheet) => {
      sheet.plays("K G6 F8");
      sheet.plays("KL K G4");
      sheet.plays("1B7 K DP6 F9");
      sheet.plays("BB K F7 G5");
      sheet.plays("K");
    }
  );
}

function slugfest(): SeedGame {
  const deletedNote: GameEvent = {
    id: "seed-live-slugfest-deleted",
    kind: "note",
    text: "（誤入力）タイム",
  };
  return seedGame(
    "seed-live-slugfest",
    "2026-09-19T04:00:00.000Z",
    "試合中（中盤）。乱打戦。盗塁・失策・暴投・代打・代走・投手交代・メモ・ゴミ箱1件、塁上に走者あり",
    sevenInnings(thunders(), bluebirds()),
    (sheet) => {
      sheet.plays("1B8 SB 2B7 BB HR9 K G6 F8");
      sheet.plays("BB 1B9 3B8 SF7 K E6 WP 1B7 G4");
      sheet.plays("K 2B9 1B7 F8 BB HBP G5");
      sheet.note("給水タイム（5分）");
      sheet.plays("HR7 1B8 SB 1B9 F7 K BB 2B8");
      sheet.changePitcher("thunders-bench-1");
      sheet.plays("K");
      sheet.plays("BB SAC1 1B9 F8 G6");
      sheet.plays("1B7 2B9 K");
      sheet.pinchHit("bluebirds-bench-1");
      sheet.plays("1B8");
      sheet.pinchRun("first", "bluebirds-bench-2");
      sheet.plays("SB");
    },
    [{ event: deletedNote, index: 8 }]
  );
}

function lastChance(): SeedGame {
  return seedGame(
    "seed-live-last-chance",
    "2026-09-19T06:30:00.000Z",
    "試合中（終盤）。最終回裏・同点・2死満塁。次の1プレーでサヨナラになりうる",
    sevenInnings(irons(), falcons()),
    (sheet) => {
      sheet.plays("G6 1B7 DP4");
      sheet.plays("K F8 G5");
      sheet.plays("2B8 G4 SF9 K");
      sheet.plays("1B9 SB G6 1B7 F8 K");
      sheet.plays("K G5 F7");
      sheet.plays("F9 K G6");
      sheet.plays("BB SAC1 1B8 G4 F7");
      sheet.plays("HR7 K G6 F8");
      sheet.plays("G4 K F9");
      sheet.plays("K F8 G3");
      sheet.plays("F7 G6 K");
      sheet.plays("G5 K F9");
      sheet.plays("K G4 F8");
      sheet.plays("K 1B7 F8 BB BB");
    }
  );
}

function extraInnings(): SeedGame {
  return seedGame(
    "seed-live-extra-innings",
    "2026-09-13T01:00:00.000Z",
    "試合中（延長）。7回制を2対2で終えて延長8回表、1死二塁",
    sevenInnings(bluebirds(), thunders()),
    (sheet) => {
      sheet.plays("1B8 SAC1 1B9 G6 F7");
      sheet.plays("K G4 F8");
      sheet.plays("G6 F9 K");
      sheet.plays("BB SB 1B7 DP6 K");
      sheet.plays("F8 K G5");
      sheet.plays("K F7 G6");
      sheet.plays("G4 HR9 K F8");
      sheet.plays("G5 K F9");
      sheet.plays("K G6 F8");
      sheet.plays("F7 G4 K");
      sheet.plays("G6 K F9");
      sheet.plays("2B8 G4 SF8 K");
      sheet.plays("K F8 G5");
      sheet.plays("G6 F7 K");
      sheet.note("7回終了 2対2。延長戦に入ります");
      sheet.plays("K 2B9");
    }
  );
}

function walkOff(): SeedGame {
  return seedGame(
    "seed-finished-walk-off",
    "2026-09-12T04:00:00.000Z",
    "試合終了。7回裏の逆転サヨナラ本塁打で決着",
    sevenInnings(falcons(), bluebirds()),
    (sheet) => {
      sheet.plays("1B7 2B8 G4 F9 K");
      sheet.plays("K G6 F8");
      sheet.plays("G5 F7 K");
      sheet.plays("BB 1B9 SF8 G6 K");
      sheet.plays("HR8 K G4 F9");
      sheet.plays("F8 K G5");
      sheet.plays("K G6 F7");
      sheet.plays("1B8 SB 1B7 K DP6");
      sheet.plays("G4 F9 K");
      sheet.plays("K F8 G6");
      sheet.plays("1B9 K G5 F7");
      sheet.plays("G4 K F8");
      sheet.plays("F7 G6 K");
      sheet.plays("K BB HR7");
    }
  );
}

function shutout(): SeedGame {
  return seedGame(
    "seed-finished-shutout",
    "2026-09-06T01:00:00.000Z",
    "試合終了。後攻が3対0で完封勝ち（最終回裏は行わずに終了）",
    sevenInnings(irons(), thunders()),
    (sheet) => {
      sheet.plays("K G6 F8");
      sheet.plays("1B7 SB 1B9 G4 K F8");
      sheet.plays("G5 K F7");
      sheet.plays("K F9 G6");
      sheet.plays("1B8 DP6 K");
      sheet.plays("HR7 G4 K F8");
      sheet.plays("F9 G6 K");
      sheet.plays("G5 F7 K");
      sheet.plays("K K G4");
      sheet.plays("BB SAC1 1B8 F9 G6");
      sheet.plays("G6 F8 KL");
      sheet.plays("K G5 F7");
      sheet.plays("F8 BB DP4");
    }
  );
}

function calledGame(): SeedGame {
  return seedGame(
    "seed-finished-called-game",
    "2026-08-30T04:00:00.000Z",
    "試合終了。5回途中の雨天コールド（記録者が手動で試合終了）",
    sevenInnings(bluebirds(), falcons()),
    (sheet) => {
      sheet.plays("1B7 1B8 HR9 K G6 F8");
      sheet.plays("K G4 F7");
      sheet.plays("BB SB 2B8 G5 F9 K");
      sheet.plays("1B9 K DP6");
      sheet.plays("G6 F8 K");
      sheet.plays("HR7 K G4 F8");
      sheet.plays("K F7 G5");
      sheet.plays("F9 G6 K");
      sheet.note("雨が強くなり中断");
      sheet.plays("G4 K");
      sheet.endGame("雨天コールド");
    }
  );
}

/**
 * Games that look like someone already created and scored them, spread over
 * before / during / after a game and over different kinds of games.
 */
export function createSeedGames(): SeedGame[] {
  return [
    beforeFirstPitch(),
    pitchersDuel(),
    slugfest(),
    lastChance(),
    extraInnings(),
    walkOff(),
    shutout(),
    calledGame(),
  ];
}
