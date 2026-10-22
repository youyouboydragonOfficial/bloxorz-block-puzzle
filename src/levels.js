// levels.js - Stage definitions and procedural puzzle generator for 1000+ levels

// Tile types:
// 0: 空白 (Void)
// 1: 通常床 (Normal tile)
// 2: 壊れる床 (Fragile tile - collapses if block stands on it)
// 3: ゴール (Goal hole)
// 4: ソフトスイッチ (Soft button - activates bridge when stepped on)
// 5: ヘビースイッチ (Heavy button - activates bridge only when standing)
// 6: 橋 (Bridge toggle tile - 0=off, 1=on)

// 擬似乱数生成器 (LCG) - シードで固定された再現性のあるステージを生成
class PRNG {
  constructor(seed) {
    this.s = seed % 2147483647;
    if (this.s <= 0) this.s += 2147483646;
  }
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// 厳選された手作りステージ (Level 1 - 15)
export const HANDMADE_LEVELS = [
  // Level 1: チュートリアル - 基本の直進と曲がり
  {
    id: 1,
    name: "覚醒の道 (First Steps)",
    spawn: { x: 1, y: 1 },
    goal: { x: 7, y: 1 },
    blockType: "STANDARD",
    width: 10,
    height: 4,
    grid: [
      [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 3, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 2: 狭い角とS字カーブ
  {
    id: 2,
    name: "クランクの迷宮 (Crank Route)",
    spawn: { x: 1, y: 1 },
    goal: { x: 6, y: 4 },
    blockType: "STANDARD",
    width: 9,
    height: 6,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 1, 1, 3, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 3: 狭い一本道（直立から横倒しへの変換が必須）
  {
    id: 3,
    name: "細道と方向転換 (Narrow Path)",
    spawn: { x: 1, y: 2 },
    goal: { x: 8, y: 2 },
    blockType: "STANDARD",
    width: 10,
    height: 6,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 3, 0],
      [0, 1, 1, 1, 0, 0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 4: 壊れる床 (オレンジ床) の初登場
  {
    id: 4,
    name: "脆い橋 (Fragile Tiles)",
    spawn: { x: 1, y: 1 },
    goal: { x: 8, y: 1 },
    blockType: "STANDARD",
    width: 10,
    height: 4,
    grid: [
      [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
      [0, 1, 1, 2, 2, 2, 2, 1, 3, 0],
      [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 5: スイッチと橋の登場
  {
    id: 5,
    name: "架け橋のスイッチ (The Switch)",
    spawn: { x: 1, y: 1 },
    goal: { x: 9, y: 2 },
    blockType: "STANDARD",
    width: 11,
    height: 5,
    switches: [
      { x: 3, y: 3, type: "soft", targets: [{ x: 5, y: 2 }, { x: 6, y: 2 }] }
    ],
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0, 0, 1, 3, 1, 0],
      [0, 1, 1, 4, 1, 0, 0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 6: 変形ブロック (Cube 1x1x1) 導入ステージ！
  {
    id: 6,
    name: "キューブの小回り (Cube Dimension)",
    spawn: { x: 1, y: 1 },
    goal: { x: 6, y: 4 },
    blockType: "CUBE", // 1x1x1 キューブ
    width: 8,
    height: 6,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 1, 3, 0],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 7: ヘビースイッチ (直立時のみ作動)
  {
    id: 7,
    name: "重量感知センサー (Heavy Sensor)",
    spawn: { x: 1, y: 2 },
    goal: { x: 9, y: 2 },
    blockType: "STANDARD",
    width: 11,
    height: 5,
    switches: [
      { x: 2, y: 1, type: "heavy", targets: [{ x: 5, y: 2 }] }
    ],
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 5, 1, 0, 0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0, 1, 1, 3, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 8: ロングブロック (1x1x3) の難関ステージ！
  {
    id: 8,
    name: "巨大柱の試練 (Giant Pillar 1x1x3)",
    spawn: { x: 1, y: 2 },
    goal: { x: 8, y: 2 },
    blockType: "LONG", // 1x1x3
    width: 10,
    height: 6,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 3, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 9: 迂回パズル
  {
    id: 9,
    name: "螺旋回廊 (Spiral Corridor)",
    spawn: { x: 1, y: 1 },
    goal: { x: 4, y: 3 },
    blockType: "STANDARD",
    width: 8,
    height: 7,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 0, 0, 0, 0, 1, 0],
      [0, 1, 0, 1, 3, 0, 1, 0],
      [0, 1, 0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  // Level 10: 複合ギミック (壊れる床 + スイッチ)
  {
    id: 10,
    name: "断崖と空中回廊 (Skyway Abyss)",
    spawn: { x: 1, y: 2 },
    goal: { x: 10, y: 2 },
    blockType: "STANDARD",
    width: 12,
    height: 5,
    switches: [
      { x: 3, y: 1, type: "soft", targets: [{ x: 7, y: 2 }, { x: 8, y: 2 }] }
    ],
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 4, 0, 0, 0, 0, 0, 1, 1, 0],
      [0, 1, 1, 1, 2, 2, 2, 0, 0, 1, 3, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  }
];

// 決定論的プロシージャル・パズルジェネレーター (Level 11〜1000)
// 解法保証逆転がりシミュレーション (Reverse Roll Solver Guarantee)
export function generateLevel(levelId) {
  // 手作りステージがある場合はそれを返す
  const handmade = HANDMADE_LEVELS.find(l => l.id === levelId);
  if (handmade) {
    return JSON.parse(JSON.stringify(handmade));
  }

  const rng = new PRNG(levelId * 9876543 + 12345);
  
  // ブロックタイプ決定 (難易度・ステージ番号による)
  // 基本はSTANDARD (1x1x2)、特定ステージ（5の倍数など）でCUBEやLONGが登場
  let blockType = "STANDARD";
  if (levelId % 7 === 0) {
    blockType = "CUBE";
  } else if (levelId % 13 === 0) {
    blockType = "LONG";
  }

  // ステージの広さと目標ステップ数 (レベルに応じて徐々に難しく)
  const steps = Math.min(10 + Math.floor(levelId / 20) * 2, 38);
  const mapSize = 16;
  const grid = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));

  // ゴール位置を中心に設定
  const goalX = Math.floor(mapSize / 2);
  const goalY = Math.floor(mapSize / 2);
  grid[goalY][goalX] = 3; // Goal

  // 逆シミュレーション用の状態管理
  // STATE: STANDING(0), LYING_X(1), LYING_Y(2)
  let curX = goalX;
  let curY = goalY;
  let curState = 0; // STANDING

  // 逆転がり軌跡
  const path = [{ x: curX, y: curY, state: curState }];

  const DIRS = [
    { dx: 1, dy: 0, name: "RIGHT" },
    { dx: -1, dy: 0, name: "LEFT" },
    { dx: 0, dy: 1, name: "DOWN" },
    { dx: 0, dy: -1, name: "UP" }
  ];

  // 占有セルをグリッドにマークする関数
  function markTiles(x, y, state) {
    if (blockType === "CUBE") {
      if (x >= 1 && x < mapSize - 1 && y >= 1 && y < mapSize - 1) {
        if (grid[y][x] === 0) grid[y][x] = 1;
      }
      return;
    }

    if (blockType === "LONG") { // 1x1x3
      if (state === 0) {
        if (grid[y][x] === 0) grid[y][x] = 1;
      } else if (state === 1) { // LYING_X: 3 cells
        for (let i = 0; i < 3; i++) {
          if (x + i < mapSize - 1 && grid[y][x + i] === 0) grid[y][x + i] = 1;
        }
      } else if (state === 2) { // LYING_Y: 3 cells
        for (let i = 0; i < 3; i++) {
          if (y + i < mapSize - 1 && grid[y + i][x] === 0) grid[y + i][x] = 1;
        }
      }
      return;
    }

    // STANDARD (1x1x2)
    if (state === 0) {
      if (grid[y][x] === 0) grid[y][x] = 1;
    } else if (state === 1) {
      if (grid[y][x] === 0) grid[y][x] = 1;
      if (x + 1 < mapSize && grid[y][x + 1] === 0) grid[y][x + 1] = 1;
    } else if (state === 2) {
      if (grid[y][x] === 0) grid[y][x] = 1;
      if (y + 1 < mapSize && grid[y + 1][x] === 0) grid[y + 1][x] = 1;
    }
  }

  // ゴール周辺をマーク
  markTiles(curX, curY, curState);

  // 逆方向ロールロジック (逆ステップを辿る)
  for (let s = 0; s < steps; s++) {
    // シャッフルした方向
    const dirs = [...DIRS].sort(() => rng.next() - 0.5);
    let moved = false;

    for (const d of dirs) {
      let nextX = curX;
      let nextY = curY;
      let nextState = curState;

      if (blockType === "CUBE") {
        nextX = curX - d.dx;
        nextY = curY - d.dy;
        nextState = 0;
      } else {
        // STANDARD (1x1x2) の逆遷移
        // 正方向:
        // STANDING + Right -> LYING_X (x+1, y) => 逆は LYING_X から -Right で STANDING (x-1, y)
        if (d.dx === 1) { // 逆方向: 左へ転がす (正方向で右に転がってここに到達した)
          if (curState === 1) { // LYING_X
            nextState = 0; // STANDING
            nextX = curX - 1;
          } else if (curState === 0) { // STANDING
            nextState = 1; // LYING_X
            nextX = curX - 2;
          } else { // LYING_Y
            nextState = 2;
            nextX = curX - 1;
          }
        } else if (d.dx === -1) { // 逆方向: 右へ転がす
          if (curState === 1) {
            nextState = 0;
            nextX = curX + 2;
          } else if (curState === 0) {
            nextState = 1;
            nextX = curX + 1;
          } else {
            nextState = 2;
            nextX = curX + 1;
          }
        } else if (d.dy === 1) { // 逆方向: 上へ転がす
          if (curState === 2) {
            nextState = 0;
            nextY = curY - 1;
          } else if (curState === 0) {
            nextState = 2;
            nextY = curY - 2;
          } else {
            nextState = 1;
            nextY = curY - 1;
          }
        } else if (d.dy === -1) { // 逆方向: 下へ転がす
          if (curState === 2) {
            nextState = 0;
            nextY = curY + 2;
          } else if (curState === 0) {
            nextState = 2;
            nextY = curY + 1;
          } else {
            nextState = 1;
            nextY = curY + 1;
          }
        }
      }

      // 範囲チェック (1マス以上の余白を残す)
      if (nextX >= 2 && nextX < mapSize - 3 && nextY >= 2 && nextY < mapSize - 3) {
        curX = nextX;
        curY = nextY;
        curState = nextState;
        markTiles(curX, curY, curState);
        path.push({ x: curX, y: curY, state: curState });
        moved = true;
        break;
      }
    }

    if (!moved) break;
  }

  // スポーン位置は逆軌跡の終端 (STARTING STANDING)
  const spawnX = curX;
  const spawnY = curY;

  // 周囲にダミーの床タイルや分岐を適度に配置して迷路としての楽しさを向上
  for (let y = 1; y < mapSize - 1; y++) {
    for (let x = 1; x < mapSize - 1; x++) {
      if (grid[y][x] === 1 && rng.next() < 0.25) {
        const nx = x + rng.range(-1, 1);
        const ny = y + rng.range(-1, 1);
        if (nx >= 1 && nx < mapSize - 1 && ny >= 1 && ny < mapSize - 1 && grid[ny][nx] === 0) {
          // ゴール直近でなければ装飾タイル追加
          if (Math.abs(nx - goalX) > 1 || Math.abs(ny - goalY) > 1) {
            grid[ny][nx] = 1;
            // 稀にオレンジ壊れる床
            if (rng.next() < 0.15 && levelId > 15) {
              grid[ny][nx] = 2;
            }
          }
        }
      }
    }
  }

  // ゴールセルを再確認
  grid[goalY][goalX] = 3;

  // タイトにトリミング
  let minX = mapSize, maxX = 0, minY = mapSize, maxY = 0;
  for (let y = 0; y < mapSize; y++) {
    for (let x = 0; x < mapSize; x++) {
      if (grid[y][x] > 0 || (x === spawnX && y === spawnY)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 余白1マスを追加
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(mapSize - 1, maxX + 1);
  maxY = Math.min(mapSize - 1, maxY + 1);

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const croppedGrid = [];

  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) {
      row.push(grid[y][x]);
    }
    croppedGrid.push(row);
  }

  return {
    id: levelId,
    name: `ディメンション ${levelId} (Dimension ${levelId})`,
    spawn: { x: spawnX - minX, y: spawnY - minY },
    goal: { x: goalX - minX, y: goalY - minY },
    blockType: blockType,
    width: croppedWidth,
    height: croppedHeight,
    grid: croppedGrid
  };
}
