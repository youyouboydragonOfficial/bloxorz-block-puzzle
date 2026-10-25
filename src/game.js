// game.js - Three.js Renderer, 3D Preview Mode (OrbitControls), Screen-Relative Direction & Visuals
// Author: ©youyouboydragon

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PuzzleBlock, ORIENTATION } from './block.js';
import { sound } from './audio.js';

export class GameScene {
  constructor(canvasContainer, callbacks = {}) {
    this.container = canvasContainer;
    this.callbacks = callbacks; // onWin, onFail, onMove, onModeChange

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.levelData = null;
    this.blockLogic = new PuzzleBlock();
    this.blockMesh = null;
    this.pivotGroup = null;

    this.tileMeshes = [];
    this.switchMeshes = [];
    this.bridgeMeshes = [];
    this.goalLight = null;
    this.particles = null;
    this.compassGroup = null;
    this.dirIndicatorGroup = null;

    this.isAnimating = false;
    this.isClear = false;
    this.isDead = false;
    this.moveCount = 0;

    // 赤いタイル（時限崩壊）の管理
    this.fragileCountdownTimer = null;
    this.fragileStandingCell = null;
    this.isFragileWarning = false;

    // はみ出しバランス耐え状態
    this.isBalancing = false;
    this.balanceAnimId = null;

    // モード: 'PLAY' (ブロック操作) または 'PREVIEW' (3D視点回転)
    this.mode = 'PLAY';

    // カメラ初期ターゲット保持用
    this.defaultCamPos = new THREE.Vector3();
    this.defaultCamTarget = new THREE.Vector3();

    this.animDuration = 140;

    this.initScene();
    this.initEventListeners();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b18);
    this.scene.fog = new THREE.FogExp2(0x080b18, 0.022);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    this.camera.up.set(0, 0, 1); // Z軸が鉛直上向き

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls (3Dプレビュー用)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地面の下には潜らない
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.enabled = false; // 初期状態（PLAYモード）ではOFF

    // ライティング (高級感あふれるドラマチックな光)
    const ambientLight = new THREE.AmbientLight(0xd5e5ff, 0.85);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainLight.position.set(10, -25, 35);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 5;
    mainLight.shadow.camera.far = 80;
    const d = 20;
    mainLight.shadow.camera.left = -d;
    mainLight.shadow.camera.right = d;
    mainLight.shadow.camera.top = d;
    mainLight.shadow.camera.bottom = -d;
    mainLight.shadow.bias = -0.0004;
    this.scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0x00d2ff, 0.6);
    rimLight.position.set(-15, 20, 15);
    this.scene.add(rimLight);

    this.pivotGroup = new THREE.Group();
    this.scene.add(this.pivotGroup);

    this.initGoalParticles();
    this.initCompassAndIndicators();

    window.addEventListener('resize', () => this.onResize());
    this.render();
  }

  setMode(mode) {
    this.mode = mode; // 'PLAY' or 'PREVIEW'
    if (this.controls) {
      this.controls.enabled = (mode === 'PREVIEW');
    }
    if (this.callbacks.onModeChange) {
      this.callbacks.onModeChange(mode);
    }
  }

  // ステージ上の「正面（FRONT / NORTH）」案内マーカー
  initCompassAndIndicators() {
    this.compassGroup = new THREE.Group();
    
    // 正面ネオン矢印
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.8);
    arrowShape.lineTo(0.4, 0.2);
    arrowShape.lineTo(0.15, 0.2);
    arrowShape.lineTo(0.15, -0.6);
    arrowShape.lineTo(-0.15, -0.6);
    arrowShape.lineTo(-0.15, 0.2);
    arrowShape.lineTo(-0.4, 0.2);
    arrowShape.closePath();

    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0, 0.05);
    this.compassGroup.add(arrowMesh);

    // 外枠リング
    const ringGeo = new THREE.RingGeometry(0.85, 0.95, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, 0, 0.05);
    this.compassGroup.add(ringMesh);

    this.compassGroup.visible = false;
    this.scene.add(this.compassGroup);
  }

  initGoalParticles() {
    const pCount = 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1.3;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.3;
      positions[i * 3 + 2] = Math.random() * 2.8;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x00ffcc,
      size: 0.14,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.visible = false;
    this.scene.add(this.particles);
  }

  loadLevel(levelData) {
    this.levelData = levelData;
    this.isAnimating = false;
    this.isClear = false;
    this.isDead = false;
    this.moveCount = 0;

    this.clearLevelObjects();
    this.buildStage();

    this.blockLogic.reset(levelData.spawn.x, levelData.spawn.y, levelData.blockType || "STANDARD");
    this.buildBlockMesh();
    this.updateBlockMeshInstant();

    this.setupCameraForStage();

    if (this.particles && this.levelData.goal) {
      this.particles.position.set(this.levelData.goal.x + 0.5, this.levelData.goal.y + 0.5, 0.2);
      this.particles.visible = true;
    }

    // 正面コンパスマーカーをスタート地点のすぐ横に配置
    if (this.compassGroup) {
      this.compassGroup.position.set(levelData.spawn.x + 0.5, levelData.spawn.y - 1.2, 0);
      this.compassGroup.visible = true;
    }

    if (this.callbacks.onMove) {
      this.callbacks.onMove(this.moveCount);
    }
  }

  clearLevelObjects() {
    if (this.fragileCountdownTimer) {
      clearTimeout(this.fragileCountdownTimer);
      this.fragileCountdownTimer = null;
    }
    this.isFragileWarning = false;
    this.fragileStandingCell = null;

    if (this.balanceAnimId) {
      cancelAnimationFrame(this.balanceAnimId);
      this.balanceAnimId = null;
    }
    this.isBalancing = false;

    this.tileMeshes.forEach(mesh => this.scene.remove(mesh));
    this.tileMeshes = [];
    this.switchMeshes.forEach(m => this.scene.remove(m));
    this.switchMeshes = [];
    this.bridgeMeshes.forEach(m => this.scene.remove(m));
    this.bridgeMeshes = [];

    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      if (this.pivotGroup.children.includes(this.blockMesh)) {
        this.pivotGroup.remove(this.blockMesh);
      }
      this.blockMesh = null;
    }

    if (this.goalLight) {
      this.scene.remove(this.goalLight);
      this.goalLight = null;
    }
  }

  buildStage() {
    const grid = this.levelData.grid;
    const height = grid.length;
    const width = grid[0].length;

    const normalTileMat = new THREE.MeshStandardMaterial({
      color: 0x1e273d,
      roughness: 0.35,
      metalness: 0.25
    });
    const tileEdgeMat = new THREE.LineBasicMaterial({ color: 0x3d5178 });

    const fragileTileMat = new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xcc0000,
      emissiveIntensity: 0.45,
      roughness: 0.35
    });

    const goalHoleMat = new THREE.MeshStandardMaterial({
      color: 0x050814,
      roughness: 0.9
    });

    const tileGeo = new THREE.BoxGeometry(0.96, 0.96, 0.25);
    const tileEdgesGeo = new THREE.EdgesGeometry(tileGeo);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = grid[y][x];
        if (type === 0) continue;

        const cx = x + 0.5;
        const cy = y + 0.5;
        const cz = -0.125;

        if (type === 1) { // 通常タイル
          const mesh = new THREE.Mesh(tileGeo, normalTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);

          const wire = new THREE.LineSegments(tileEdgesGeo, tileEdgeMat);
          mesh.add(wire);
        } else if (type === 2) { // 壊れる床 (オレンジ)
          const mesh = new THREE.Mesh(tileGeo, fragileTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          mesh.userData = { isFragile: true, gx: x, gy: y };
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);
        } else if (type === 3) { // ゴール（しっかりとした床ブロック＋光るゴールパッド）
          // 1. 土台となる強固な立体床ブロック (ブロックの上にゴールを設置)
          const goalBaseMat = new THREE.MeshStandardMaterial({
            color: 0x1a263f,
            roughness: 0.25,
            metalness: 0.5
          });
          const baseMesh = new THREE.Mesh(tileGeo, goalBaseMat);
          baseMesh.position.set(cx, cy, cz);
          baseMesh.receiveShadow = true;
          this.scene.add(baseMesh);
          this.tileMeshes.push(baseMesh);

          // ゴールドネオンの枠線
          const goldEdgeMat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 2 });
          const baseWire = new THREE.LineSegments(tileEdgesGeo, goldEdgeMat);
          baseMesh.add(baseWire);

          // 2. ブロック天面の光り輝くネオンゴールプレート (Goal Pad)
          const padGeo = new THREE.BoxGeometry(0.86, 0.86, 0.05);
          const padMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x00d2ff,
            emissiveIntensity: 0.75,
            roughness: 0.2,
            metalness: 0.8
          });
          const padMesh = new THREE.Mesh(padGeo, padMat);
          padMesh.position.set(cx, cy, 0.025);
          this.scene.add(padMesh);
          this.tileMeshes.push(padMesh);

          // 3. ゴールエンブレム (中心の光るリング)
          const ringGeo = new THREE.RingGeometry(0.18, 0.36, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(cx, cy, 0.055);
          this.scene.add(ring);
          this.tileMeshes.push(ring);

          // 4. 強烈なゴールビーコンライト
          this.goalLight = new THREE.PointLight(0x00ffea, 3.5, 9);
          this.goalLight.position.set(cx, cy, 0.8);
          this.scene.add(this.goalLight);
        }
      }
    }

    if (this.levelData.switches) {
      const buttonGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.08, 16);
      buttonGeo.rotateX(Math.PI / 2);

      this.levelData.switches.forEach(sw => {
        const isHeavy = sw.type === 'heavy';
        const swMat = new THREE.MeshStandardMaterial({
          color: isHeavy ? 0xff0044 : 0xffbb00,
          emissive: isHeavy ? 0x880022 : 0x664400,
          roughness: 0.2
        });
        const swMesh = new THREE.Mesh(buttonGeo, swMat);
        swMesh.position.set(sw.x + 0.5, sw.y + 0.5, 0.04);
        swMesh.userData = { switchData: sw, active: false };
        this.scene.add(swMesh);
        this.switchMeshes.push(swMesh);
      });
    }
  }

  buildBlockMesh() {
    const dim = this.blockLogic.getDimensions();
    const geo = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);
    
    // 高級感のあるサテンメタリックブロック
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf2f5fa,
      roughness: 0.2,
      metalness: 0.4,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1
    });

    this.blockMesh = new THREE.Mesh(geo, mat);
    this.blockMesh.castShadow = true;
    this.blockMesh.receiveShadow = true;

    // ネオンブルーのエッジグロー
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00e1ff, linewidth: 2 });
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
    this.blockMesh.add(edgeLine);

    this.scene.add(this.blockMesh);
  }

  updateBlockMeshInstant() {
    if (!this.blockMesh) return;
    const center = this.blockLogic.getCenterWorld();
    this.blockMesh.position.set(center.cx, center.cy, center.cz);
    this.blockMesh.rotation.set(0, 0, 0);
    this.blockMesh.scale.set(1, 1, 1);
  }

  // ステージ中央に向かう正対（手前正面やや見下ろし）カメラ
  setupCameraForStage() {
    const width = this.levelData.width;
    const height = this.levelData.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const span = Math.max(width, height);
    const dist = Math.max(12, span * 1.55);

    // 正面アングル (Yマイナス手前からYプラス奥を見下ろす視角)
    // 画面の上が「Yマイナス（奥）」、画面の下が「Yプラス（手前）」に完全に一致！
    const camX = centerX;
    const camY = centerY - dist * 0.9;
    const camZ = dist * 1.1;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(centerX, centerY, 0);

    this.defaultCamPos.set(camX, camY, camZ);
    this.defaultCamTarget.set(centerX, centerY, 0);

    if (this.controls) {
      this.controls.target.set(centerX, centerY, 0);
      this.controls.update();
    }
  }

  // カメラを初期の正面ベストポジションに滑らかに戻す
  resetCamera() {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endPos = this.defaultCamPos.clone();
    const endTarget = this.defaultCamTarget.clone();

    const startT = performance.now();
    const duration = 400;

    const anim = (now) => {
      const p = Math.min((now - startT) / duration, 1.0);
      const ease = 1 - Math.pow(1 - p, 3);

      this.camera.position.lerpVectors(startPos, endPos, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.controls.update();

      if (p < 1.0) {
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  // ブロック形状の動的切り替え (ユーザー救済 & 難易度調整機能)
  changeBlockType(newType) {
    if (this.isAnimating || this.isClear || this.isDead) return;
    this.blockLogic.blockType = newType;
    this.blockLogic.orientation = ORIENTATION.STANDING;

    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      if (this.pivotGroup.children.includes(this.blockMesh)) {
        this.pivotGroup.remove(this.blockMesh);
      }
      this.blockMesh = null;
    }

    this.buildBlockMesh();
    this.updateBlockMeshInstant();
  }

  /**
   * 【最重要機能】スクリーン上の方向（screenDx, screenDy）を、
   * 現在のカメラアングルに基づいたグリッドの移動方向（gridDx, gridDy）に変換する！
   * 画面の上を押せば必ず画面の奥、右を押せば必ず右に100%正確に転がる！
   */
  mapScreenDirToGrid(screenDx, screenDy) {
    // カメラの水平方向の前方ベクトル (forward) と右方向ベクトル (right)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.z = 0; // 水平投影
    forward.normalize();

    // Three.js (Z-up): forward x (0, 0, 1) = 水平右方向ベクトル
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 0, 1)).normalize();

    // 画面上の意図する移動ベクトル (ワールドXY平面上)
    // 画面の上 (screenDy = -1) => forward (奥へ)
    // 画面の下 (screenDy = 1)  => -forward (手前へ)
    // 画面の右 (screenDx = 1)  => right (右へ)
    // 画面の左 (screenDx = -1) => -right (左へ)
    const desired = new THREE.Vector3();
    if (screenDy === -1) desired.copy(forward);
    else if (screenDy === 1) desired.copy(forward).negate();
    else if (screenDx === 1) desired.copy(right);
    else if (screenDx === -1) desired.copy(right).negate();

    // 4つの基本グリッド方向 (dx, dy)
    // +X: 右, -X: 左, +Y: 奥 (画面上), -Y: 手前 (画面下)
    const gridOptions = [
      { dx: 1, dy: 0, vec: new THREE.Vector3(1, 0, 0) },   // +X
      { dx: -1, dy: 0, vec: new THREE.Vector3(-1, 0, 0) }, // -X
      { dx: 0, dy: 1, vec: new THREE.Vector3(0, 1, 0) },   // +Y
      { dx: 0, dy: -1, vec: new THREE.Vector3(0, -1, 0) }  // -Y
    ];

    // 内積が最大（最も向きが近い）のグリッド方向を選択
    let bestDot = -Infinity;
    let bestGrid = gridOptions[0];

    for (const opt of gridOptions) {
      const dot = desired.dot(opt.vec);
      if (dot > bestDot) {
        bestDot = dot;
        bestGrid = opt;
      }
    }

    return { dx: bestGrid.dx, dy: bestGrid.dy };
  }

  // プレイヤーの移動入力 (screenDx, screenDy)
  rollScreenRelative(screenDx, screenDy) {
    if (this.mode === 'PREVIEW') return; // 視点プレビューモード中はブロックを動かさない
    if (this.isAnimating || this.isClear || this.isDead) return;

    const { dx, dy } = this.mapScreenDirToGrid(screenDx, screenDy);
    this.executeRoll(dx, dy);
  }

  executeRoll(dx, dy) {
    if (this.isAnimating || this.isClear || this.isDead) return;

    // 前回のバランス耐えアニメーションを停止し、ブロック姿勢を通常に戻す
    if (this.balanceAnimId) {
      cancelAnimationFrame(this.balanceAnimId);
      this.balanceAnimId = null;
    }
    this.isBalancing = false;

    // もし直立で赤いタイルを踏んで警告中だった場合、プレイヤーは安全に脱出！
    if (this.isFragileWarning && this.fragileStandingCell) {
      if (this.fragileCountdownTimer) {
        clearTimeout(this.fragileCountdownTimer);
        this.fragileCountdownTimer = null;
      }
      this.isFragileWarning = false;

      // 直前まで踏んでいたその1マスのみを背後で崩壊させる！（前方のタイルは壊さない！）
      const cellToCollapse = { ...this.fragileStandingCell };
      this.fragileStandingCell = null;
      setTimeout(() => {
        this.executeSingleCollapse(cellToCollapse.x, cellToCollapse.y, false);
      }, 80);
    }

    const rollData = this.blockLogic.calculateRoll(dx, dy);
    if (!rollData) return;

    this.isAnimating = true;
    this.moveCount++;
    if (this.callbacks.onMove) {
      this.callbacks.onMove(this.moveCount);
    }

    sound.playRoll(rollData.nextOrientation === ORIENTATION.STANDING);

    const { pivot, axis, angle } = rollData;
    this.pivotGroup.position.set(pivot.x, pivot.y, pivot.z);
    this.pivotGroup.rotation.set(0, 0, 0);
    this.pivotGroup.attach(this.blockMesh);

    const startTime = performance.now();
    const duration = this.animDuration;
    const rotAxis = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

    const animateRoll = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = 1 - (1 - progress) * (1 - progress);
      const curAngle = ease * angle;

      this.pivotGroup.setRotationFromAxisAngle(rotAxis, curAngle);

      if (progress < 1.0) {
        requestAnimationFrame(animateRoll);
      } else {
        this.pivotGroup.setRotationFromAxisAngle(rotAxis, angle);
        this.scene.attach(this.blockMesh);
        
        this.blockLogic.applyRoll(rollData.nextX, rollData.nextY, rollData.nextOrientation);

        const dim = this.blockLogic.getDimensions();
        this.blockMesh.geometry.dispose();
        this.blockMesh.geometry = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);
        
        if (this.blockMesh.children[0]) {
          this.blockMesh.children[0].geometry.dispose();
          this.blockMesh.children[0].geometry = new THREE.EdgesGeometry(this.blockMesh.geometry);
        }

        this.updateBlockMeshInstant();
        this.pivotGroup.rotation.set(0, 0, 0);

        this.isAnimating = false;
        this.checkLandState();
      }
    };

    requestAnimationFrame(animateRoll);
  }

  checkLandState() {
    const occupied = this.blockLogic.getOccupiedCells();
    const grid = this.levelData.grid;
    const height = grid.length;
    const width = grid[0].length;

    // 【最優先判定】ゴール床ブロックへの到達！
    // ブロックがゴール床（3）に少しでも乗っていれば、絶対に落下死させずにクリア判定！
    const touchesGoal = occupied.some(c => {
      if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) {
        return grid[c.y][c.x] === 3;
      }
      return false;
    });

    if (touchesGoal) {
      this.isBalancing = false;
      if (this.blockLogic.orientation === ORIENTATION.STANDING) {
        // 直立でゴール床ブロックの上に乗った場合: PERFECT CLEAR! (★★★)
        this.triggerGoalClear(true);
        return;
      } else {
        // 横倒しでゴール床ブロックを踏んだ場合: STAGE CLEAR! (★★)
        this.triggerGoalClear(false);
        return;
      }
    }

    // 床チェック (床の上に乗っている有効マス数と範囲外/穴マスの選別)
    const validCells = [];
    const invalidCells = [];
    for (const cell of occupied) {
      const inBounds = cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height;
      if (inBounds && grid[cell.y][cell.x] > 0) {
        validCells.push(cell);
      } else {
        invalidCells.push(cell);
      }
    }

    // ケースA: 床が1マスもない（完全に奈落の上の空中に浮いた）=> 落下死
    if (validCells.length === 0) {
      this.isBalancing = false;
      this.triggerFall();
      return;
    }

    // ケースB: 【1マスはみ出し耐性 (バランスホールド＆減点ペナルティ)】
    // 2マス以上のブロックで、1マス以上は床に乗っているが一部がはみ出している場合
    if (validCells.length < occupied.length) {
      this.isBalancing = true;
      sound.playPenalty();

      // はみ出し方向へ少し傾き、プルプル震えて耐える演出
      this.triggerBalanceHoldVisual(validCells, invalidCells);

      // コールバック通知（スコア減点ペナルティ＆UI警告バナー表示）
      if (this.callbacks.onBalanceHold) {
        this.callbacks.onBalanceHold({
          penalty: 50,
          validCount: validCells.length,
          totalCount: occupied.length
        });
      }
      return;
    }

    // ケースC: 全マスが床の上に乗っている（完全着地）
    this.isBalancing = false;

    // 壊れる赤い床 (type 2) 直立判定 - 触れたその1マスのみ時限崩壊カウントダウン開始！
    if (this.blockLogic.orientation === ORIENTATION.STANDING) {
      const cell = occupied[0];
      if (grid[cell.y][cell.x] === 2) {
        this.startFragileCountdown(cell.x, cell.y);
      }
    }

    // スイッチ判定
    if (this.levelData.switches) {
      this.checkSwitches(occupied);
    }
  }

  // 1マスはみ出し耐性発動時のリアルなバランス傾き＆振動演出
  triggerBalanceHoldVisual(validCells, invalidCells) {
    if (!this.blockMesh) return;
    if (this.balanceAnimId) {
      cancelAnimationFrame(this.balanceAnimId);
      this.balanceAnimId = null;
    }

    // はみ出し方向ベクトル（支点マス重心 -> 空中マス重心）
    const vX = validCells.reduce((sum, c) => sum + c.x, 0) / validCells.length;
    const vY = validCells.reduce((sum, c) => sum + c.y, 0) / validCells.length;
    const invX = invalidCells.reduce((sum, c) => sum + c.x, 0) / invalidCells.length;
    const invY = invalidCells.reduce((sum, c) => sum + c.y, 0) / invalidCells.length;

    const dirX = Math.sign(invX - vX);
    const dirY = Math.sign(invY - vY);

    const maxTilt = 0.22; // 約12.6度の傾き
    const startT = performance.now();
    const duration = 400;

    const baseCenter = this.blockLogic.getCenterWorld();

    const anim = (now) => {
      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);

      // 減衰振動 (ブルブルと耐えるバウンス)
      const wobble = Math.sin(elapsed * 0.05) * Math.exp(-progress * 3.5) * 0.08;
      const currentTilt = (1 - Math.exp(-progress * 4)) * maxTilt + wobble;

      if (this.blockMesh) {
        // はみ出している軸方向に傾ける
        if (dirX !== 0) {
          this.blockMesh.rotation.y = -dirX * currentTilt;
          this.blockMesh.position.x = baseCenter.cx + dirX * 0.08 * currentTilt;
        }
        if (dirY !== 0) {
          this.blockMesh.rotation.x = dirY * currentTilt;
          this.blockMesh.position.y = baseCenter.cy + dirY * 0.08 * currentTilt;
        }
      }

      if (progress < 1.0) {
        this.balanceAnimId = requestAnimationFrame(anim);
      }
    };

    this.balanceAnimId = requestAnimationFrame(anim);
  }

  // 赤いタイルの時限崩壊カウントダウン（直立で触れたその1マスのみ！）
  startFragileCountdown(x, y) {
    if (this.isFragileWarning || this.isDead || this.isClear) return;
    this.isFragileWarning = true;
    this.fragileStandingCell = { x, y };

    // 該当するその1つのタイルメッシュのみ取得
    const targetMesh = this.tileMeshes.find(m => 
      m.userData && m.userData.isFragile && 
      m.userData.gx === x && m.userData.gy === y
    );

    // 警告アニメーション（小刻みな振動＆赤黒い点滅）
    const startT = performance.now();
    const duration = 2000; // たっぷり2.0秒の猶予時間（落ち着いて次の手を入力可能！）

    const warningAnim = (now) => {
      if (!this.isFragileWarning) {
        if (targetMesh) {
          targetMesh.position.z = -0.125;
          if (targetMesh.material) targetMesh.material.emissiveIntensity = 0.35;
        }
        return;
      }

      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);

      const shakeIntensity = 0.02 + progress * 0.04;
      const shakeZ = Math.sin(now * 0.08) * shakeIntensity;

      if (targetMesh) {
        targetMesh.position.z = -0.125 + shakeZ;
        if (targetMesh.material) {
          targetMesh.material.emissiveIntensity = 0.4 + Math.sin(now * 0.03) * 0.5;
        }
      }

      if (this.blockMesh && !this.isAnimating) {
        this.blockMesh.position.z = 1.0 + Math.sin(now * 0.08) * shakeIntensity * 0.5;
      }

      if (progress < 1.0) {
        requestAnimationFrame(warningAnim);
      }
    };
    requestAnimationFrame(warningAnim);

    // 2.0秒後にまだそのマスに乗っていれば、その1マスが抜け落ちて落下死！
    this.fragileCountdownTimer = setTimeout(() => {
      if (!this.isFragileWarning) return;
      this.isFragileWarning = false;
      this.executeSingleCollapse(x, y, true);
    }, duration);
  }

  // 触れた赤いタイル1マスのみの崩壊処理（他の前方の赤いタイルは一切壊さない！）
  executeSingleCollapse(x, y, shouldKillPlayer = false) {
    sound.playFall();

    // グリッドからそのマスのみ床を消滅（0にする）
    if (this.levelData.grid[y]) {
      this.levelData.grid[y][x] = 0;
    }

    // 該当するタイルメッシュ1つのみ
    const targetMesh = this.tileMeshes.find(m => 
      m.userData && m.userData.isFragile && 
      m.userData.gx === x && m.userData.gy === y
    );

    if (targetMesh) {
      const startT = performance.now();
      const duration = 600;

      const collapseAnim = (now) => {
        const elapsed = now - startT;
        const progress = Math.min(elapsed / duration, 1.0);

        targetMesh.position.z = -0.125 - Math.pow(progress * 2.5, 2) * 4;
        targetMesh.rotation.x += 0.05;
        targetMesh.rotation.y += 0.04;
        targetMesh.scale.multiplyScalar(0.97);

        if (progress < 1.0) {
          requestAnimationFrame(collapseAnim);
        } else {
          this.scene.remove(targetMesh);
          const idx = this.tileMeshes.indexOf(targetMesh);
          if (idx !== -1) this.tileMeshes.splice(idx, 1);
        }
      };
      requestAnimationFrame(collapseAnim);
    }

    // プレイヤーがその場にとどまり続けていた場合のみ落下死
    if (shouldKillPlayer) {
      this.triggerFall();
    }
  }

  triggerFall() {
    this.isDead = true;
    sound.playFall();

    const startT = performance.now();
    const duration = 650;
    const startZ = this.blockMesh.position.z;

    const fallAnim = (now) => {
      const progress = (now - startT) / duration;
      if (progress < 1.0) {
        this.blockMesh.position.z = startZ - Math.pow(progress * 3, 2.5) * 5;
        this.blockMesh.rotation.x += 0.08;
        this.blockMesh.rotation.y += 0.06;
        this.blockMesh.scale.multiplyScalar(0.985);
        requestAnimationFrame(fallAnim);
      } else {
        if (this.callbacks.onFail) {
          this.callbacks.onFail();
        }
      }
    };
    requestAnimationFrame(fallAnim);
  }

  triggerGoalClear(isPerfect = true) {
    this.isClear = true;
    sound.playClear();

    const startT = performance.now();
    const duration = 900;
    const startZ = this.blockMesh.position.z;

    // 【勝利演出】落下ではなく、ゴールブロックの上でまばゆく光り輝きながら上空へ浮揚・回転する昇華演出！
    const clearAnim = (now) => {
      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);

      if (progress < 1.0) {
        // ふわりと上に舞い上がり、黄金の光を放つ
        const ease = Math.sin(progress * Math.PI * 0.5);
        this.blockMesh.position.z = startZ + ease * 1.6;
        this.blockMesh.rotation.z += 0.06;
        this.blockMesh.rotation.y += 0.04;
        
        // 祝祭のゴールライトパルス
        if (this.goalLight) {
          this.goalLight.intensity = 3.5 + Math.sin(progress * 16) * 3;
        }

        requestAnimationFrame(clearAnim);
      } else {
        if (this.callbacks.onWin) {
          this.callbacks.onWin(this.moveCount, isPerfect);
        }
      }
    };
    requestAnimationFrame(clearAnim);
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  initEventListeners() {
    // キーボード操作
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'PREVIEW') return;
      if (this.isAnimating || this.isClear || this.isDead) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.rollScreenRelative(0, -1); // 画面奥
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.rollScreenRelative(0, 1);  // 画面手前
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.rollScreenRelative(-1, 0); // 画面左
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.rollScreenRelative(1, 0);  // 画面右
          break;
        case 'r':
        case 'R':
          if (this.callbacks.onRestart) this.callbacks.onRestart();
          break;
        case 'v':
        case 'V': // 視点モードトグル
          this.setMode(this.mode === 'PLAY' ? 'PREVIEW' : 'PLAY');
          break;
      }
    });

    // スワイプ操作 (PLAYモード時のみ)
    let touchStartX = 0;
    let touchStartY = 0;
    this.container.addEventListener('touchstart', (e) => {
      if (this.mode === 'PLAY' && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.container.addEventListener('touchend', (e) => {
      if (this.mode !== 'PLAY') return;
      if (e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const threshold = 28;

        if (Math.max(absX, absY) > threshold) {
          if (absX > absY) {
            this.rollScreenRelative(dx > 0 ? 1 : -1, 0);
          } else {
            this.rollScreenRelative(0, dy > 0 ? 1 : -1);
          }
        }
      }
    }, { passive: true });
  }

  render() {
    requestAnimationFrame(() => this.render());

    // OrbitControls 更新
    if (this.controls && this.controls.enabled) {
      this.controls.update();
    }

    // パーティクルアニメーション
    if (this.particles && this.particles.visible) {
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 2] += 0.02;
        if (positions[i * 3 + 2] > 2.8) {
          positions[i * 3 + 2] = 0.1;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
