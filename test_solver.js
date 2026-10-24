import { HANDMADE_LEVELS } from './src/levels.js';
import { PuzzleBlock, ORIENTATION } from './src/block.js';

export function solveLevelWithSwitches(lvl, blockType = null) {
  const b = new PuzzleBlock(blockType || lvl.blockType || 'STANDARD');

  // グリッドを文字列キー化
  const gridKey = (g) => g.map(row => row.join('')).join('|');

  // 初期状態
  const initialGrid = JSON.parse(JSON.stringify(lvl.grid));
  const startState = {
    x: lvl.spawn.x,
    y: lvl.spawn.y,
    ori: ORIENTATION.STANDING,
    grid: initialGrid,
    path: []
  };

  const stateKey = (s) => `${s.x},${s.y},${s.ori},${gridKey(s.grid)}`;
  const q = [startState];
  const visited = new Set([stateKey(startState)]);

  let standingSol = null;
  let lyingSol = null;

  while (q.length > 0 && q.length < 20000) {
    const cur = q.shift();
    b.x = cur.x;
    b.y = cur.y;
    b.orientation = cur.ori;
    const occ = b.getOccupiedCells();

    // ゴールチェック
    const onGoal = occ.some(c => c.x === lvl.goal.x && c.y === lvl.goal.y);
    if (onGoal) {
      if (cur.ori === ORIENTATION.STANDING && !standingSol) {
        standingSol = cur.path.join('->');
      }
      if (cur.ori !== ORIENTATION.STANDING && !lyingSol) {
        lyingSol = cur.path.join('->');
      }
      if (standingSol) break;
    }

    for (const [name, dx, dy] of [['R', 1, 0], ['L', -1, 0], ['D', 0, 1], ['U', 0, -1]]) {
      b.x = cur.x;
      b.y = cur.y;
      b.orientation = cur.ori;
      b.isMoving = false;
      const r = b.calculateRoll(dx, dy);
      if (!r) continue;

      b.applyRoll(r.nextX, r.nextY, r.nextOrientation);
      const nextOcc = b.getOccupiedCells();

      // タイルチェック
      let valid = true;
      for (const c of nextOcc) {
        const tile = cur.grid[c.y]?.[c.x];
        if (tile === undefined || tile === 0) { valid = false; break; }
        if (tile === 2 && b.orientation === ORIENTATION.STANDING) { valid = false; break; } // fragile
      }
      if (!valid) continue;

      // スイッチ作動のシミュレーション
      let nextGrid = cur.grid;
      if (lvl.switches) {
        let gridChanged = false;
        for (const sw of lvl.switches) {
          const isStepped = nextOcc.some(c => c.x === sw.x && c.y === sw.y);
          if (isStepped) {
            if (sw.type === 'heavy' && b.orientation !== ORIENTATION.STANDING) continue;
            // スイッチ作動
            if (sw.targets && !gridChanged) {
              nextGrid = JSON.parse(JSON.stringify(cur.grid));
              gridChanged = true;
            }
            if (sw.targets) {
              for (const tgt of sw.targets) {
                nextGrid[tgt.y][tgt.x] = (nextGrid[tgt.y][tgt.x] === 0) ? 1 : 0;
              }
            }
          }
        }
      }

      const nextState = {
        x: r.nextX,
        y: r.nextY,
        ori: r.nextOrientation,
        grid: nextGrid,
        path: [...cur.path, name]
      };

      const k = stateKey(nextState);
      if (!visited.has(k)) {
        visited.add(k);
        q.push(nextState);
      }
    }
  }

  return {
    standing: standingSol ? { steps: standingSol.split('->').length, path: standingSol } : null,
    lying: lyingSol ? { steps: lyingSol.split('->').length, path: lyingSol } : null
  };
}

for (const lvl of HANDMADE_LEVELS) {
  const res = solveLevelWithSwitches(lvl);
  console.log(`Level ${lvl.id} (${lvl.name}):`);
  console.log(`  - Standing Goal: ${res.standing ? 'YES (' + res.standing.steps + ' steps: ' + res.standing.path + ')' : 'NO'}`);
  console.log(`  - Lying Goal:    ${res.lying ? 'YES (' + res.lying.steps + ' steps)' : 'NO'}`);
}
