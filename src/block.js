// block.js - Block physical logic, pivot rotation, orientation states

export const ORIENTATION = {
  STANDING: 0, // 1x1, height 2
  LYING_X: 1,  // 2x1, height 1 (horizontal along X)
  LYING_Y: 2   // 1x2, height 1 (horizontal along Y)
};

export class PuzzleBlock {
  constructor(blockType = "STANDARD") {
    this.blockType = blockType; // "STANDARD", "CUBE", "LONG"
    this.x = 0;
    this.y = 0;
    this.orientation = ORIENTATION.STANDING;
    this.isMoving = false;
    this.isFalling = false;
  }

  reset(x, y, blockType = null) {
    if (blockType) this.blockType = blockType;
    this.x = x;
    this.y = y;
    this.orientation = ORIENTATION.STANDING;
    this.isMoving = false;
    this.isFalling = false;
  }

  // ブロックが占有するグリッド座標のリストを返す
  getOccupiedCells() {
    if (this.blockType === "CUBE") {
      return [{ x: this.x, y: this.y }];
    }

    if (this.blockType === "LONG") { // 1x1x3
      if (this.orientation === ORIENTATION.STANDING) {
        return [{ x: this.x, y: this.y }];
      } else if (this.orientation === ORIENTATION.LYING_X) {
        return [{ x: this.x, y: this.y }, { x: this.x + 1, y: this.y }, { x: this.x + 2, y: this.y }];
      } else {
        return [{ x: this.x, y: this.y }, { x: this.x, y: this.y + 1 }, { x: this.x, y: this.y + 2 }];
      }
    }

    // STANDARD (1x1x2)
    if (this.orientation === ORIENTATION.STANDING) {
      return [{ x: this.x, y: this.y }];
    } else if (this.orientation === ORIENTATION.LYING_X) {
      return [{ x: this.x, y: this.y }, { x: this.x + 1, y: this.y }];
    } else { // LYING_Y
      return [{ x: this.x, y: this.y }, { x: this.x, y: this.y + 1 }];
    }
  }

  // ブロックの物理寸法 { sx, sy, sz }
  getDimensions() {
    if (this.blockType === "CUBE") {
      return { sx: 1, sy: 1, sz: 1 };
    }
    if (this.blockType === "LONG") {
      if (this.orientation === ORIENTATION.STANDING) return { sx: 1, sy: 1, sz: 3 };
      if (this.orientation === ORIENTATION.LYING_X) return { sx: 3, sy: 1, sz: 1 };
      return { sx: 1, sy: 3, sz: 1 };
    }
    // STANDARD
    if (this.orientation === ORIENTATION.STANDING) return { sx: 1, sy: 1, sz: 2 };
    if (this.orientation === ORIENTATION.LYING_X) return { sx: 2, sy: 1, sz: 1 };
    return { sx: 1, sy: 2, sz: 1 };
  }

  // ブロックの重心世界座標 { cx, cy, cz }
  getCenterWorld() {
    const dim = this.getDimensions();
    return {
      cx: this.x + dim.sx / 2,
      cy: this.y + dim.sy / 2,
      cz: dim.sz / 2
    };
  }

  // 入力方向 (dx, dy) に対する回転前後の計算
  // 戻り値: { nextX, nextY, nextOrientation, pivot: [px, py, pz], axis: [ax, ay, az], angle: rad }
  calculateRoll(dx, dy) {
    if (this.isMoving || this.isFalling) return null;

    const curDim = this.getDimensions();
    let nextX = this.x;
    let nextY = this.y;
    let nextOrientation = this.orientation;

    let pivotX = 0;
    let pivotY = 0;
    let pivotZ = 0; // 床面は z=0
    let axis = [0, 0, 0];
    let angle = Math.PI / 2;

    if (this.blockType === "CUBE") {
      nextX = this.x + dx;
      nextY = this.y + dy;
      nextOrientation = ORIENTATION.STANDING;
      if (dx === 1) { // Right
        pivotX = this.x + 1; pivotY = this.y + 0.5;
        axis = [0, 1, 0];
      } else if (dx === -1) { // Left
        pivotX = this.x; pivotY = this.y + 0.5;
        axis = [0, -1, 0];
      } else if (dy === 1) { // Down (+y)
        pivotX = this.x + 0.5; pivotY = this.y + 1;
        axis = [-1, 0, 0];
      } else if (dy === -1) { // Up (-y)
        pivotX = this.x + 0.5; pivotY = this.y;
        axis = [1, 0, 0];
      }
      return { nextX, nextY, nextOrientation, pivot: { x: pivotX, y: pivotY, z: pivotZ }, axis, angle };
    }

    if (this.blockType === "LONG") {
      // 1x1x3 の計算
      if (dx === 1) { // RIGHT
        if (this.orientation === ORIENTATION.STANDING) {
          nextX = this.x + 1; nextOrientation = ORIENTATION.LYING_X;
          pivotX = this.x + 1; pivotY = this.y + 0.5;
          axis = [0, 1, 0];
        } else if (this.orientation === ORIENTATION.LYING_X) {
          nextX = this.x + 3; nextOrientation = ORIENTATION.STANDING;
          pivotX = this.x + 3; pivotY = this.y + 0.5;
          axis = [0, 1, 0];
        } else { // LYING_Y
          nextX = this.x + 1; nextOrientation = ORIENTATION.LYING_Y;
          pivotX = this.x + 1; pivotY = this.y + 1.5;
          axis = [0, 1, 0];
        }
      } else if (dx === -1) { // LEFT
        if (this.orientation === ORIENTATION.STANDING) {
          nextX = this.x - 3; nextOrientation = ORIENTATION.LYING_X;
          pivotX = this.x; pivotY = this.y + 0.5;
          axis = [0, -1, 0];
        } else if (this.orientation === ORIENTATION.LYING_X) {
          nextX = this.x - 1; nextOrientation = ORIENTATION.STANDING;
          pivotX = this.x; pivotY = this.y + 0.5;
          axis = [0, -1, 0];
        } else {
          nextX = this.x - 1; nextOrientation = ORIENTATION.LYING_Y;
          pivotX = this.x; pivotY = this.y + 1.5;
          axis = [0, -1, 0];
        }
      } else if (dy === 1) { // DOWN (+y)
        if (this.orientation === ORIENTATION.STANDING) {
          nextY = this.y + 1; nextOrientation = ORIENTATION.LYING_Y;
          pivotX = this.x + 0.5; pivotY = this.y + 1;
          axis = [-1, 0, 0];
        } else if (this.orientation === ORIENTATION.LYING_Y) {
          nextY = this.y + 3; nextOrientation = ORIENTATION.STANDING;
          pivotX = this.x + 0.5; pivotY = this.y + 3;
          axis = [-1, 0, 0];
        } else {
          nextY = this.y + 1; nextOrientation = ORIENTATION.LYING_X;
          pivotX = this.x + 1.5; pivotY = this.y + 1;
          axis = [-1, 0, 0];
        }
      } else if (dy === -1) { // UP (-y)
        if (this.orientation === ORIENTATION.STANDING) {
          nextY = this.y - 3; nextOrientation = ORIENTATION.LYING_Y;
          pivotX = this.x + 0.5; pivotY = this.y;
          axis = [1, 0, 0];
        } else if (this.orientation === ORIENTATION.LYING_Y) {
          nextY = this.y - 1; nextOrientation = ORIENTATION.STANDING;
          pivotX = this.x + 0.5; pivotY = this.y;
          axis = [1, 0, 0];
        } else {
          nextY = this.y - 1; nextOrientation = ORIENTATION.LYING_X;
          pivotX = this.x + 1.5; pivotY = this.y;
          axis = [1, 0, 0];
        }
      }
      return { nextX, nextY, nextOrientation, pivot: { x: pivotX, y: pivotY, z: pivotZ }, axis, angle };
    }

    // STANDARD (1x1x2)
    if (dx === 1) { // RIGHT
      if (this.orientation === ORIENTATION.STANDING) {
        nextX = this.x + 1; nextOrientation = ORIENTATION.LYING_X;
        pivotX = this.x + 1; pivotY = this.y + 0.5;
        axis = [0, 1, 0];
      } else if (this.orientation === ORIENTATION.LYING_X) {
        nextX = this.x + 2; nextOrientation = ORIENTATION.STANDING;
        pivotX = this.x + 2; pivotY = this.y + 0.5;
        axis = [0, 1, 0];
      } else { // LYING_Y
        nextX = this.x + 1; nextOrientation = ORIENTATION.LYING_Y;
        pivotX = this.x + 1; pivotY = this.y + 1.0;
        axis = [0, 1, 0];
      }
    } else if (dx === -1) { // LEFT
      if (this.orientation === ORIENTATION.STANDING) {
        nextX = this.x - 2; nextOrientation = ORIENTATION.LYING_X;
        pivotX = this.x; pivotY = this.y + 0.5;
        axis = [0, -1, 0];
      } else if (this.orientation === ORIENTATION.LYING_X) {
        nextX = this.x - 1; nextOrientation = ORIENTATION.STANDING;
        pivotX = this.x; pivotY = this.y + 0.5;
        axis = [0, -1, 0];
      } else { // LYING_Y
        nextX = this.x - 1; nextOrientation = ORIENTATION.LYING_Y;
        pivotX = this.x; pivotY = this.y + 1.0;
        axis = [0, -1, 0];
      }
    } else if (dy === 1) { // DOWN (+Y)
      if (this.orientation === ORIENTATION.STANDING) {
        nextY = this.y + 1; nextOrientation = ORIENTATION.LYING_Y;
        pivotX = this.x + 0.5; pivotY = this.y + 1;
        axis = [-1, 0, 0];
      } else if (this.orientation === ORIENTATION.LYING_Y) {
        nextY = this.y + 2; nextOrientation = ORIENTATION.STANDING;
        pivotX = this.x + 0.5; pivotY = this.y + 2;
        axis = [-1, 0, 0];
      } else { // LYING_X
        nextY = this.y + 1; nextOrientation = ORIENTATION.LYING_X;
        pivotX = this.x + 1.0; pivotY = this.y + 1;
        axis = [-1, 0, 0];
      }
    } else if (dy === -1) { // UP (-Y)
      if (this.orientation === ORIENTATION.STANDING) {
        nextY = this.y - 2; nextOrientation = ORIENTATION.LYING_Y;
        pivotX = this.x + 0.5; pivotY = this.y;
        axis = [1, 0, 0];
      } else if (this.orientation === ORIENTATION.LYING_Y) {
        nextY = this.y - 1; nextOrientation = ORIENTATION.STANDING;
        pivotX = this.x + 0.5; pivotY = this.y;
        axis = [1, 0, 0];
      } else { // LYING_X
        nextY = this.y - 1; nextOrientation = ORIENTATION.LYING_X;
        pivotX = this.x + 1.0; pivotY = this.y;
        axis = [1, 0, 0];
      }
    }

    return {
      nextX,
      nextY,
      nextOrientation,
      pivot: { x: pivotX, y: pivotY, z: pivotZ },
      axis,
      angle
    };
  }

  // 移動のコミット
  applyRoll(nextX, nextY, nextOrientation) {
    this.x = nextX;
    this.y = nextY;
    this.orientation = nextOrientation;
  }
}
