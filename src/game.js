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
      color: 0xee5500,
      emissive: 0xaa2200,
      emissiveIntensity: 0.35,
      roughness: 0.4
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
        } else if (type === 3) { // ゴール
          const mesh = new THREE.Mesh(tileGeo, goalHoleMat);
          mesh.position.set(cx, cy, cz - 0.05);
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);

          const ringGeo = new THREE.RingGeometry(0.2, 0.46, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffee,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(cx, cy, 0.01);
          this.scene.add(ring);
          this.tileMeshes.push(ring);

          this.goalLight = new THREE.PointLight(0x00ffcc, 3.0, 7);
          this.goalLight.position.set(cx, cy, 0.7);
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

  /**
   * 【最重要機能】スクリーン上の方向（screenDx, screenDy）を、
   * 現在のカメラアングルに基づいたグリッドの移動方向（gridDx, gridDy）に変換する！
   * これにより、視点がどんな角度になっていても「画面の上を押せば画面の奥に転がる」！
   */
  mapScreenDirToGrid(screenDx, screenDy) {
    // カメラの水平方向の前方ベクトル (forward) と右方向ベクトル (right)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.z = 0; // 水平投影
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 0, 1)).normalize();

    // 画面上の意図する移動ベクトル (ワールドXY平面上)
    // 画面の上 (screenDy = -1) => forward
    // 画面の下 (screenDy = 1) => -forward
    // 画面の右 (screenDx = 1) => -right
    // 画面の左 (screenDx = -1) => right
    const desired = new THREE.Vector3();
    if (screenDy === -1) desired.copy(forward);
    else if (screenDy === 1) desired.copy(forward).negate();
    else if (screenDx === 1) desired.copy(right).negate();
    else if (screenDx === -1) desired.copy(right);

    // 4つの基本グリッド方向 (dx, dy)
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

    let hasTile = true;

    for (const cell of occupied) {
      if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) {
        hasTile = false;
        break;
      }
      const tileType = grid[cell.y][cell.x];
      if (tileType === 0) {
        hasTile = false;
        break;
      }
    }

    // 壊れる床 (オレンジ) 直立判定
    if (this.blockLogic.orientation === ORIENTATION.STANDING && hasTile) {
      const cell = occupied[0];
      if (grid[cell.y][cell.x] === 2) {
        this.triggerFragileCollapse(cell.x, cell.y);
        return;
      }
    }

    // スイッチ判定
    if (hasTile && this.levelData.switches) {
      this.checkSwitches(occupied);
    }

    if (!hasTile) {
      this.triggerFall();
      return;
    }

    // ゴール判定
    if (this.blockLogic.orientation === ORIENTATION.STANDING) {
      const cell = occupied[0];
      if (grid[cell.y][cell.x] === 3) {
        this.triggerGoalClear();
        return;
      }
    }
  }

  checkSwitches(occupied) {
    this.switchMeshes.forEach(swMesh => {
      const sw = swMesh.userData.switchData;
      const isStepped = occupied.some(c => c.x === sw.x && c.y === sw.y);

      if (isStepped) {
        if (sw.type === 'heavy' && this.blockLogic.orientation !== ORIENTATION.STANDING) {
          return;
        }
        sound.playSwitch();
        swMesh.position.z = 0.01;
        
        if (sw.targets) {
          sw.targets.forEach(tgt => {
            const curVal = this.levelData.grid[tgt.y][tgt.x];
            this.levelData.grid[tgt.y][tgt.x] = (curVal === 0) ? 1 : 0;
          });
          const curLogic = { x: this.blockLogic.x, y: this.blockLogic.y, ori: this.blockLogic.orientation };
          this.clearLevelObjects();
          this.buildStage();
          this.blockLogic.x = curLogic.x;
          this.blockLogic.y = curLogic.y;
          this.blockLogic.orientation = curLogic.ori;
          this.buildBlockMesh();
          this.updateBlockMeshInstant();
        }
      }
    });
  }

  triggerFragileCollapse(x, y) {
    this.isDead = true;
    sound.playFall();
    
    const targetTile = this.tileMeshes.find(m => m.userData && m.userData.gx === x && m.userData.gy === y);
    if (targetTile) {
      const startT = performance.now();
      const dropAnim = (now) => {
        const el = (now - startT) / 400;
        targetTile.position.z -= 0.15;
        targetTile.rotation.x += 0.05;
        if (el < 1.0) requestAnimationFrame(dropAnim);
      };
      requestAnimationFrame(dropAnim);
    }
    this.triggerFall();
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

  triggerGoalClear() {
    this.isClear = true;
    sound.playClear();

    const startT = performance.now();
    const duration = 800;
    const startZ = this.blockMesh.position.z;

    const clearAnim = (now) => {
      const progress = (now - startT) / duration;
      if (progress < 1.0) {
        this.blockMesh.position.z = startZ - progress * 1.5;
        this.blockMesh.scale.x = Math.max(0.01, 1 - progress * 0.8);
        this.blockMesh.scale.y = Math.max(0.01, 1 - progress * 0.8);
        
        if (this.goalLight) {
          this.goalLight.intensity = 3.0 + Math.sin(progress * 20) * 2;
        }

        requestAnimationFrame(clearAnim);
      } else {
        if (this.callbacks.onWin) {
          this.callbacks.onWin(this.moveCount);
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
