// game.js - Three.js Renderer, 3D Preview Mode, Screen-Relative Controls & Full Gimmick Engine
// Author: ©youyouboydragon

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PuzzleBlock, ORIENTATION } from './block.js';
import { sound } from './audio.js';

// ステージテーマ（バイオーム）のカラーパレット定義
const THEMES = [
  // 0: サイバーネオン (Default)
  {
    bg: 0x080b18,
    fog: 0x080b18,
    tileColor: 0x1e273d,
    tileEdge: 0x00f0ff,
    roughness: 0.35,
    metalness: 0.25,
    ambient: 0xd5e5ff,
    mainLight: 0xffffff,
    rimLight: 0x00d2ff
  },
  // 1: マグマ・インフェルノ
  {
    bg: 0x140608,
    fog: 0x140608,
    tileColor: 0x2b1518,
    tileEdge: 0xff4500,
    roughness: 0.45,
    metalness: 0.35,
    ambient: 0xffd5cc,
    mainLight: 0xffaa88,
    rimLight: 0xff2200
  },
  // 2: クリスタル・フロスト
  {
    bg: 0x061118,
    fog: 0x061118,
    tileColor: 0x122c3d,
    tileEdge: 0x70f0ff,
    roughness: 0.2,
    metalness: 0.6,
    ambient: 0xe0f7ff,
    mainLight: 0xffffff,
    rimLight: 0x00ffff
  },
  // 3: エメラルド・フォレスト
  {
    bg: 0x06140b,
    fog: 0x06140b,
    tileColor: 0x13301d,
    tileEdge: 0x00ff88,
    roughness: 0.35,
    metalness: 0.3,
    ambient: 0xd5ffe0,
    mainLight: 0xf0fff4,
    rimLight: 0x22cc66
  },
  // 4: コズミック・ボイド
  {
    bg: 0x0d0718,
    fog: 0x0d0718,
    tileColor: 0x25143a,
    tileEdge: 0xd946ef,
    roughness: 0.3,
    metalness: 0.4,
    ambient: 0xead5ff,
    mainLight: 0xffe8ff,
    rimLight: 0xaa22ff
  }
];

export class GameScene {
  constructor(canvasContainer, callbacks = {}) {
    this.container = canvasContainer;
    this.callbacks = callbacks; // onWin, onFail, onMove, onModeChange, onBalanceHold, onSwitchActivated, onJump, onWarp

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.ambientLight = null;
    this.mainLight = null;
    this.rimLight = null;

    this.levelData = null;
    this.blockLogic = new PuzzleBlock();
    this.blockMesh = null;
    this.pivotGroup = null;

    this.tileMeshes = [];
    this.switchMeshes = [];
    this.bridgeMeshes = []; // { mesh, targetX, targetY, swRef }
    this.jumpPadMeshes = [];
    this.portalMeshes = [];
    this.iceMeshes = [];

    this.goalLight = null;
    this.particles = null;
    this.compassGroup = null;
    this.hintIndicator = null;

    this.isAnimating = false;
    this.isJumping = false;
    this.isWarping = false;
    this.isClear = false;
    this.isDead = false;
    this.moveCount = 0;

    // アンドゥ用の履歴スタック
    this.historyStack = [];

    // 直前の移動方向
    this.lastRollDx = 1;
    this.lastRollDy = 0;

    // 赤いタイル（時限崩壊）の管理
    this.fragileCountdownTimer = null;
    this.fragileStandingCell = null;
    this.isFragileWarning = false;

    // はみ出しバランス耐え状態
    this.isBalancing = false;
    this.balanceAnimId = null;

    // モード: 'PLAY' または 'PREVIEW'
    this.mode = 'PLAY';

    // カメラ初期ターゲット保持用
    this.defaultCamPos = new THREE.Vector3();
    this.defaultCamTarget = new THREE.Vector3();

    this.animDuration = 135;

    this.initScene();
    this.initEventListeners();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b18);
    this.scene.fog = new THREE.FogExp2(0x080b18, 0.022);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 65;
    this.controls.enabled = false;

    // ライティング
    this.ambientLight = new THREE.AmbientLight(0xd5e5ff, 0.85);
    this.scene.add(this.ambientLight);

    this.mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.mainLight.position.set(10, -25, 35);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = 2048;
    this.mainLight.shadow.mapSize.height = 2048;
    this.mainLight.shadow.camera.near = 5;
    this.mainLight.shadow.camera.far = 80;
    const d = 22;
    this.mainLight.shadow.camera.left = -d;
    this.mainLight.shadow.camera.right = d;
    this.mainLight.shadow.camera.top = d;
    this.mainLight.shadow.camera.bottom = -d;
    this.mainLight.shadow.bias = -0.0004;
    this.scene.add(this.mainLight);

    this.rimLight = new THREE.DirectionalLight(0x00d2ff, 0.6);
    this.rimLight.position.set(-15, 20, 15);
    this.scene.add(this.rimLight);

    this.pivotGroup = new THREE.Group();
    this.scene.add(this.pivotGroup);

    this.initGoalParticles();
    this.initCompassAndIndicators();

    window.addEventListener('resize', () => this.onResize());
    this.render();
  }

  setMode(mode) {
    this.mode = mode;
    if (this.controls) {
      this.controls.enabled = (mode === 'PREVIEW');
    }
    if (this.callbacks.onModeChange) {
      this.callbacks.onModeChange(mode);
    }
  }

  initCompassAndIndicators() {
    this.compassGroup = new THREE.Group();
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

    const baseRingGeo = new THREE.RingGeometry(0.7, 0.82, 32);
    const baseRingMat = new THREE.MeshBasicMaterial({
      color: 0x0099ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    const ringMesh = new THREE.Mesh(baseRingGeo, baseRingMat);
    ringMesh.position.set(0, 0, 0.04);
    this.compassGroup.add(ringMesh);

    this.compassGroup.visible = false;
    this.scene.add(this.compassGroup);
  }

  initGoalParticles() {
    const pCount = 36;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    const colors = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      const angle = (i / pCount) * Math.PI * 2;
      const r = 0.28 + Math.random() * 0.15;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.sin(angle) * r;
      positions[i * 3 + 2] = Math.random() * 2.2;

      colors[i * 3] = 0.0;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 1.0;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geom, mat);
    this.particles.visible = false;
    this.scene.add(this.particles);
  }

  loadLevel(levelData) {
    this.levelData = JSON.parse(JSON.stringify(levelData));
    this.isAnimating = false;
    this.isJumping = false;
    this.isWarping = false;
    this.isClear = false;
    this.isDead = false;
    this.moveCount = 0;
    this.historyStack = [];

    // ステージテーマの適用
    const themeIdx = Math.floor((levelData.id - 1) / 20) % THEMES.length;
    const theme = THEMES[themeIdx];
    this.applyTheme(theme);

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

    if (this.compassGroup) {
      this.compassGroup.position.set(levelData.spawn.x + 0.5, levelData.spawn.y - 1.2, 0);
      this.compassGroup.visible = true;
    }

    if (this.callbacks.onMove) {
      this.callbacks.onMove(this.moveCount);
    }
  }

  applyTheme(theme) {
    this.scene.background.setHex(theme.bg);
    this.scene.fog.color.setHex(theme.fog);
    this.ambientLight.color.setHex(theme.ambient);
    this.mainLight.color.setHex(theme.mainLight);
    this.rimLight.color.setHex(theme.rimLight);
    this.currentTheme = theme;
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
    this.bridgeMeshes.forEach(b => this.scene.remove(b.mesh));
    this.bridgeMeshes = [];
    this.jumpPadMeshes.forEach(m => this.scene.remove(m));
    this.jumpPadMeshes = [];
    this.portalMeshes.forEach(m => this.scene.remove(m));
    this.portalMeshes = [];
    this.iceMeshes.forEach(m => this.scene.remove(m));
    this.iceMeshes = [];

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
    const theme = this.currentTheme || THEMES[0];

    const normalTileMat = new THREE.MeshStandardMaterial({
      color: theme.tileColor,
      roughness: theme.roughness,
      metalness: theme.metalness
    });
    const tileEdgeMat = new THREE.LineBasicMaterial({ color: theme.tileEdge });

    const fragileTileMat = new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xcc0000,
      emissiveIntensity: 0.45,
      roughness: 0.35
    });

    const iceTileMat = new THREE.MeshStandardMaterial({
      color: 0x70d8ff,
      emissive: 0x0088cc,
      emissiveIntensity: 0.3,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
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

        // 1: 通常タイル
        if (type === 1) {
          const mesh = new THREE.Mesh(tileGeo, normalTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);

          const wire = new THREE.LineSegments(tileEdgesGeo, tileEdgeMat);
          mesh.add(wire);
        }
        // 2: 壊れる床 (赤いひび割れタイル)
        else if (type === 2) {
          const mesh = new THREE.Mesh(tileGeo, fragileTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          mesh.userData = { isFragile: true, gx: x, gy: y };
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);
        }
        // 3: ゴール (光るゴールパッド＋ビーコン)
        else if (type === 3) {
          const baseMesh = new THREE.Mesh(tileGeo, normalTileMat);
          baseMesh.position.set(cx, cy, cz);
          baseMesh.receiveShadow = true;
          this.scene.add(baseMesh);
          this.tileMeshes.push(baseMesh);

          const goldEdgeMat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 2 });
          const baseWire = new THREE.LineSegments(tileEdgesGeo, goldEdgeMat);
          baseMesh.add(baseWire);

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

          const ringGeo = new THREE.RingGeometry(0.18, 0.36, 32);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(cx, cy, 0.055);
          this.scene.add(ring);
          this.tileMeshes.push(ring);

          this.goalLight = new THREE.PointLight(0x00ffea, 3.5, 9);
          this.goalLight.position.set(cx, cy, 0.8);
          this.scene.add(this.goalLight);
        }
        // 4 & 5: スイッチマス (土台床を敷く)
        else if (type === 4 || type === 5) {
          const mesh = new THREE.Mesh(tileGeo, normalTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);

          const wire = new THREE.LineSegments(tileEdgesGeo, tileEdgeMat);
          mesh.add(wire);
        }
        // 6: ジャンプ台 (スプリングパッド)
        else if (type === 6) {
          const baseMesh = new THREE.Mesh(tileGeo, normalTileMat);
          baseMesh.position.set(cx, cy, cz);
          baseMesh.receiveShadow = true;
          this.scene.add(baseMesh);
          this.tileMeshes.push(baseMesh);

          // ジャンプ台の光るトッププレート
          const jPadGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.08, 16);
          jPadGeo.rotateX(Math.PI / 2);
          const jPadMat = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0xff5500,
            emissiveIntensity: 0.8,
            roughness: 0.2
          });
          const jMesh = new THREE.Mesh(jPadGeo, jPadMat);
          jMesh.position.set(cx, cy, 0.04);
          jMesh.userData = { gx: x, gy: y };
          this.scene.add(jMesh);
          this.jumpPadMeshes.push(jMesh);

          // 上向きジャンプ矢印
          const ringGeo = new THREE.RingGeometry(0.12, 0.24, 16);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(cx, cy, 0.085);
          this.scene.add(ring);
          this.jumpPadMeshes.push(ring);
        }
        // 7: ワープポータルA (シアン)
        else if (type === 7) {
          const baseMesh = new THREE.Mesh(tileGeo, normalTileMat);
          baseMesh.position.set(cx, cy, cz);
          this.scene.add(baseMesh);
          this.tileMeshes.push(baseMesh);

          const pGeo = new THREE.RingGeometry(0.15, 0.42, 32);
          const pMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
          });
          const pMesh = new THREE.Mesh(pGeo, pMat);
          pMesh.position.set(cx, cy, 0.02);
          pMesh.userData = { portalType: 7, gx: x, gy: y };
          this.scene.add(pMesh);
          this.portalMeshes.push(pMesh);
        }
        // 8: ワープポータルB (マゼンタ)
        else if (type === 8) {
          const baseMesh = new THREE.Mesh(tileGeo, normalTileMat);
          baseMesh.position.set(cx, cy, cz);
          this.scene.add(baseMesh);
          this.tileMeshes.push(baseMesh);

          const pGeo = new THREE.RingGeometry(0.15, 0.42, 32);
          const pMat = new THREE.MeshBasicMaterial({
            color: 0xff00d4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
          });
          const pMesh = new THREE.Mesh(pGeo, pMat);
          pMesh.position.set(cx, cy, 0.02);
          pMesh.userData = { portalType: 8, gx: x, gy: y };
          this.scene.add(pMesh);
          this.portalMeshes.push(pMesh);
        }
        // 9: 氷の床 (スリップゾーン)
        else if (type === 9) {
          const mesh = new THREE.Mesh(tileGeo, iceTileMat);
          mesh.position.set(cx, cy, cz);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.iceMeshes.push(mesh);
          this.tileMeshes.push(mesh);

          const iceEdge = new THREE.LineSegments(tileEdgesGeo, new THREE.LineBasicMaterial({ color: 0xaaffff }));
          mesh.add(iceEdge);
        }
      }
    }

    // スイッチオブジェクトの配置 & 【超重要】架け橋（Bridge）の事前生成！
    if (this.levelData.switches) {
      const softBtnGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.08, 16);
      softBtnGeo.rotateX(Math.PI / 2);

      const heavyBtnGeo = new THREE.BoxGeometry(0.65, 0.65, 0.08);

      const bridgeMat = new THREE.MeshStandardMaterial({
        color: 0x2a3e5c,
        emissive: 0x0088cc,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.4
      });
      const bridgeEdgeMat = new THREE.LineBasicMaterial({ color: 0x00e1ff });

      this.levelData.switches.forEach(sw => {
        const isHeavy = sw.type === 'heavy';
        const swMat = new THREE.MeshStandardMaterial({
          color: isHeavy ? 0xff1144 : 0xffcc00,
          emissive: isHeavy ? 0xaa0022 : 0x774400,
          emissiveIntensity: 0.6,
          roughness: 0.2
        });

        const swMesh = new THREE.Mesh(isHeavy ? heavyBtnGeo : softBtnGeo, swMat);
        swMesh.position.set(sw.x + 0.5, sw.y + 0.5, 0.04);
        swMesh.userData = { switchData: sw, active: false };
        this.scene.add(swMesh);
        this.switchMeshes.push(swMesh);

        // 各スイッチのターゲットマスに、架け橋メッシュ（浮上式床）を事前生成！
        if (sw.targets) {
          sw.targets.forEach(tgt => {
            const bMesh = new THREE.Mesh(tileGeo, bridgeMat);
            // 初期状態は隙間の下深く（z = -1.5）に待機！
            bMesh.position.set(tgt.x + 0.5, tgt.y + 0.5, -1.5);
            bMesh.visible = false;
            bMesh.receiveShadow = true;

            const bWire = new THREE.LineSegments(tileEdgesGeo, bridgeEdgeMat);
            bMesh.add(bWire);

            this.scene.add(bMesh);
            this.bridgeMeshes.push({
              mesh: bMesh,
              targetX: tgt.x,
              targetY: tgt.y,
              swRef: sw
            });
          });
        }
      });
    }
  }

  buildBlockMesh() {
    const dim = this.blockLogic.getDimensions();
    const geo = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);

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

  setupCameraForStage() {
    const width = this.levelData.width;
    const height = this.levelData.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const span = Math.max(width, height);
    const dist = Math.max(12, span * 1.55);

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

  mapScreenDirToGrid(screenDx, screenDy) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.z = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 0, 1)).normalize();

    const desired = new THREE.Vector3();
    if (screenDy === -1) desired.copy(forward);
    else if (screenDy === 1) desired.copy(forward).negate();
    else if (screenDx === 1) desired.copy(right);
    else if (screenDx === -1) desired.copy(right).negate();

    const gridOptions = [
      { dx: 1, dy: 0, vec: new THREE.Vector3(1, 0, 0) },
      { dx: -1, dy: 0, vec: new THREE.Vector3(-1, 0, 0) },
      { dx: 0, dy: 1, vec: new THREE.Vector3(0, 1, 0) },
      { dx: 0, dy: -1, vec: new THREE.Vector3(0, -1, 0) }
    ];

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

  rollScreenRelative(screenDx, screenDy) {
    if (this.mode === 'PREVIEW') return;
    if (this.isAnimating || this.isClear || this.isDead) return;

    const { dx, dy } = this.mapScreenDirToGrid(screenDx, screenDy);
    this.executeRoll(dx, dy);
  }

  // アンドゥ用スナップショットの保存
  saveStateSnapshot() {
    const snap = {
      x: this.blockLogic.x,
      y: this.blockLogic.y,
      orientation: this.blockLogic.orientation,
      blockType: this.blockLogic.blockType,
      grid: JSON.parse(JSON.stringify(this.levelData.grid)),
      switches: this.levelData.switches ? JSON.parse(JSON.stringify(this.levelData.switches)) : null,
      moveCount: this.moveCount
    };
    this.historyStack.push(snap);
    if (this.historyStack.length > 50) {
      this.historyStack.shift();
    }
  }

  // 【神機能】1手戻す（アンドゥ）
  undo() {
    if (this.isAnimating || this.isClear || this.isDead || this.historyStack.length === 0) return;

    const prev = this.historyStack.pop();
    if (!prev) return;

    sound.playUndo();

    // 状態を巻き戻し
    this.blockLogic.x = prev.x;
    this.blockLogic.y = prev.y;
    this.blockLogic.orientation = prev.orientation;
    this.blockLogic.blockType = prev.blockType;
    this.levelData.grid = prev.grid;
    this.moveCount = prev.moveCount;

    if (prev.switches && this.levelData.switches) {
      this.levelData.switches = prev.switches;
      // スイッチメッシュの押し込み状態・エミッシブを復元
      this.levelData.switches.forEach(sw => {
        const swMesh = this.switchMeshes.find(m => m.userData && m.userData.switchData.x === sw.x && m.userData.switchData.y === sw.y);
        if (swMesh) {
          swMesh.position.z = sw.active ? 0.01 : 0.04;
          if (swMesh.material) swMesh.material.emissiveIntensity = sw.active ? 1.2 : 0.6;
        }
      });
      // 橋メッシュの浮上/下降状態を復元
      this.bridgeMeshes.forEach(b => {
        const isOpen = this.levelData.grid[b.targetY] && this.levelData.grid[b.targetY][b.targetX] === 1;
        b.mesh.visible = isOpen;
        b.mesh.position.z = isOpen ? -0.125 : -1.5;
      });
    }

    // ブロック形状の同期
    const dim = this.blockLogic.getDimensions();
    this.blockMesh.geometry.dispose();
    this.blockMesh.geometry = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);
    if (this.blockMesh.children[0]) {
      this.blockMesh.children[0].geometry.dispose();
      this.blockMesh.children[0].geometry = new THREE.EdgesGeometry(this.blockMesh.geometry);
    }
    this.updateBlockMeshInstant();

    if (this.callbacks.onMove) {
      this.callbacks.onMove(this.moveCount);
    }
  }

  executeRoll(dx, dy) {
    if (this.isAnimating || this.isClear || this.isDead) return;

    this.lastRollDx = dx;
    this.lastRollDy = dy;

    // 前回のバランス耐えアニメーションを停止
    if (this.balanceAnimId) {
      cancelAnimationFrame(this.balanceAnimId);
      this.balanceAnimId = null;
    }
    this.isBalancing = false;

    // 赤いタイルの脱出処理
    if (this.isFragileWarning && this.fragileStandingCell) {
      if (this.fragileCountdownTimer) {
        clearTimeout(this.fragileCountdownTimer);
        this.fragileCountdownTimer = null;
      }
      this.isFragileWarning = false;

      const cellToCollapse = { ...this.fragileStandingCell };
      this.fragileStandingCell = null;
      setTimeout(() => {
        this.executeSingleCollapse(cellToCollapse.x, cellToCollapse.y, false);
      }, 80);
    }

    const rollData = this.blockLogic.calculateRoll(dx, dy);
    if (!rollData) return;

    // アンドゥ用のスナップショット保存
    this.saveStateSnapshot();

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

    // 【最優先】ゴール床ブロックへの到達！
    const touchesGoal = occupied.some(c => {
      if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) {
        return grid[c.y][c.x] === 3;
      }
      return false;
    });

    if (touchesGoal) {
      this.isBalancing = false;
      if (this.blockLogic.orientation === ORIENTATION.STANDING) {
        this.triggerGoalClear(true);
        return;
      } else {
        this.triggerGoalClear(false);
        return;
      }
    }

    // 床チェック
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

    // ケースA: 全マスが空中 => 落下死
    if (validCells.length === 0) {
      this.isBalancing = false;
      this.triggerFall();
      return;
    }

    // ケースB: 1マスはみ出し耐性 (バランスホールド)
    if (validCells.length < occupied.length) {
      this.isBalancing = true;
      sound.playPenalty();
      this.triggerBalanceHoldVisual(validCells, invalidCells);

      if (this.callbacks.onBalanceHold) {
        this.callbacks.onBalanceHold({
          penalty: 50,
          validCount: validCells.length,
          totalCount: occupied.length
        });
      }
      return;
    }

    // ケースC: 完全着地
    this.isBalancing = false;

    // 壊れる赤い床 (type 2) 直立判定
    if (this.blockLogic.orientation === ORIENTATION.STANDING) {
      const cell = occupied[0];
      if (grid[cell.y][cell.x] === 2) {
        this.startFragileCountdown(cell.x, cell.y);
      }
    }

    // 【ギミック 1】ジャンプ台 (type 6) 判定
    const onJumpPad = occupied.some(c => grid[c.y]?.[c.x] === 6);
    if (onJumpPad) {
      this.triggerJumpPad();
      return;
    }

    // 【ギミック 2】ワープポータル (type 7 & 8) 判定 (直立で乗ると発動)
    if (this.blockLogic.orientation === ORIENTATION.STANDING) {
      const cell = occupied[0];
      const t = grid[cell.y]?.[cell.x];
      if (t === 7 || t === 8) {
        this.checkTeleport(occupied);
        return;
      }
    }

    // 【ギミック 3】氷の床 (type 9) 判定 (滑る)
    const onIce = occupied.every(c => grid[c.y]?.[c.x] === 9);
    if (onIce && !this.isSliding) {
      this.triggerIceSlide();
      return;
    }

    // 【ギミック 4】スイッチ作動判定 & 架け橋せり上がり
    if (this.levelData.switches) {
      this.checkSwitches(occupied);
    }
  }

  triggerBalanceHoldVisual(validCells, invalidCells) {
    if (!this.blockMesh) return;
    if (this.balanceAnimId) {
      cancelAnimationFrame(this.balanceAnimId);
      this.balanceAnimId = null;
    }

    const vX = validCells.reduce((sum, c) => sum + c.x, 0) / validCells.length;
    const vY = validCells.reduce((sum, c) => sum + c.y, 0) / validCells.length;
    const invX = invalidCells.reduce((sum, c) => sum + c.x, 0) / invalidCells.length;
    const invY = invalidCells.reduce((sum, c) => sum + c.y, 0) / invalidCells.length;

    const dirX = Math.sign(invX - vX);
    const dirY = Math.sign(invY - vY);

    const maxTilt = 0.22;
    const startT = performance.now();
    const duration = 400;
    const baseCenter = this.blockLogic.getCenterWorld();

    const anim = (now) => {
      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);
      const wobble = Math.sin(elapsed * 0.05) * Math.exp(-progress * 3.5) * 0.08;
      const currentTilt = (1 - Math.exp(-progress * 4)) * maxTilt + wobble;

      if (this.blockMesh) {
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

  startFragileCountdown(x, y) {
    if (this.isFragileWarning || this.isDead || this.isClear) return;
    this.isFragileWarning = true;
    this.fragileStandingCell = { x, y };

    const targetMesh = this.tileMeshes.find(m =>
      m.userData && m.userData.isFragile &&
      m.userData.gx === x && m.userData.gy === y
    );

    const startT = performance.now();
    const duration = 1800;

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

    this.fragileCountdownTimer = setTimeout(() => {
      if (!this.isFragileWarning) return;
      this.isFragileWarning = false;
      this.executeSingleCollapse(x, y, true);
    }, duration);
  }

  executeSingleCollapse(x, y, shouldKillPlayer = false) {
    sound.playFall();

    if (this.levelData.grid[y]) {
      this.levelData.grid[y][x] = 0;
    }

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

    if (shouldKillPlayer) {
      this.triggerFall();
    }
  }

  // 【最重要機能】スイッチ作動判定＆架け橋（Bridge）のせり上がり出現！
  checkSwitches(occupied) {
    if (!this.levelData.switches || this.isDead || this.isClear) return;

    this.levelData.switches.forEach(sw => {
      const isStepping = occupied.some(c => c.x === sw.x && c.y === sw.y);
      if (!isStepping) return;

      const isStanding = this.blockLogic.orientation === ORIENTATION.STANDING;

      // ヘビースイッチは直立（強い重み）でのみ作動！
      if (sw.type === 'heavy' && !isStanding) {
        return;
      }

      // スイッチが未作動の場合、作動させる！
      if (!sw.active) {
        sw.active = true;
        sound.playSwitch();

        // スイッチ押し込みアニメーション
        const swMesh = this.switchMeshes.find(m => m.userData && m.userData.switchData === sw);
        if (swMesh) {
          swMesh.position.z = 0.01; // カチッと沈み込む
          if (swMesh.material) swMesh.material.emissiveIntensity = 1.3;
        }

        // 遠くの隙間に架け橋がグググッと浮上出現！
        const relatedBridges = this.bridgeMeshes.filter(b => b.swRef === sw);
        relatedBridges.forEach(b => {
          b.mesh.visible = true;

          // グリッドを即座に通行可能な床 (1) に更新！
          if (this.levelData.grid[b.targetY]) {
            this.levelData.grid[b.targetY][b.targetX] = 1;
          }

          // 下方からせり上がる滑らかなアニメーション
          const startT = performance.now();
          const duration = 500;
          const animBridge = (now) => {
            const elapsed = now - startT;
            const p = Math.min(elapsed / duration, 1.0);
            const ease = 1 - Math.pow(1 - p, 3);
            b.mesh.position.z = -1.5 + ease * 1.375; // -0.125 に到着
            if (p < 1.0) requestAnimationFrame(animBridge);
          };
          requestAnimationFrame(animBridge);
        });

        if (this.callbacks.onSwitchActivated) {
          this.callbacks.onSwitchActivated(sw);
        }
      }
    });
  }

  // ジャンプ装置（パルスジャンプ台）による放物線大ジャンプ！
  triggerJumpPad() {
    if (this.isJumping || this.isDead || this.isClear) return;
    this.isJumping = true;
    sound.playJump();

    const dx = this.lastRollDx || 1;
    const dy = this.lastRollDy || 0;
    const jumpDistance = 2;

    const curPos = this.blockLogic.getCenterWorld();
    const targetCenterX = curPos.cx + dx * jumpDistance;
    const targetCenterY = curPos.cy + dy * jumpDistance;

    const startT = performance.now();
    const duration = 480;

    const startX = curPos.cx;
    const startY = curPos.cy;
    const startZ = curPos.cz;

    const jumpAnim = (now) => {
      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);

      // 放物線アーチ
      const arch = Math.sin(progress * Math.PI) * 2.2;
      const curX = startX + (targetCenterX - startX) * progress;
      const curY = startY + (targetCenterY - startY) * progress;
      const curZ = startZ + arch;

      if (this.blockMesh) {
        this.blockMesh.position.set(curX, curY, curZ);
        if (dx !== 0) this.blockMesh.rotation.y = progress * Math.PI * 2 * Math.sign(dx);
        if (dy !== 0) this.blockMesh.rotation.x = progress * Math.PI * 2 * Math.sign(dy);
      }

      if (progress < 1.0) {
        requestAnimationFrame(jumpAnim);
      } else {
        this.isJumping = false;
        this.blockLogic.applyRoll(
          this.blockLogic.x + dx * jumpDistance,
          this.blockLogic.y + dy * jumpDistance,
          this.blockLogic.orientation
        );
        this.updateBlockMeshInstant();

        sound.playRoll(this.blockLogic.orientation === ORIENTATION.STANDING);
        this.checkLandState();

        if (this.callbacks.onJump) {
          this.callbacks.onJump();
        }
      }
    };

    requestAnimationFrame(jumpAnim);
  }

  // ワープポータル（異次元空間転移）
  checkTeleport(occupied) {
    if (this.isWarping || this.isDead || this.isClear) return;
    const grid = this.levelData.grid;
    const height = grid.length;
    const width = grid[0].length;

    const cell = occupied[0];
    if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) return;
    const type = grid[cell.y][cell.x];

    if (type === 7 || type === 8) {
      const destType = (type === 7) ? 8 : 7;
      let destX = -1, destY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (grid[y][x] === destType) {
            destX = x;
            destY = y;
            break;
          }
        }
        if (destX !== -1) break;
      }

      if (destX !== -1) {
        this.isWarping = true;
        sound.playWarp();

        const startT = performance.now();
        const duration = 500;
        const startPos = this.blockLogic.getCenterWorld();

        const warpAnim = (now) => {
          const elapsed = now - startT;
          const p = Math.min(elapsed / duration, 1.0);

          if (p < 0.5) {
            const subP = p / 0.5;
            this.blockMesh.scale.set(1 - subP, 1 - subP, 1 - subP);
            this.blockMesh.position.z = startPos.cz - subP * 0.8;
          } else {
            const subP = (p - 0.5) / 0.5;
            this.blockMesh.position.set(destX + 0.5, destY + 0.5, 0.4 + subP * 0.6);
            this.blockMesh.scale.set(subP, subP, subP);
          }

          if (p < 1.0) {
            requestAnimationFrame(warpAnim);
          } else {
            this.isWarping = false;
            this.blockLogic.x = destX;
            this.blockLogic.y = destY;
            this.updateBlockMeshInstant();
            sound.playRoll(true);
            this.checkLandState();

            if (this.callbacks.onWarp) {
              this.callbacks.onWarp();
            }
          }
        };
        requestAnimationFrame(warpAnim);
      }
    }
  }

  // 氷の床（スリップゾーン）連続スライド
  triggerIceSlide() {
    this.isSliding = true;
    sound.playSlide();

    const dx = this.lastRollDx;
    const dy = this.lastRollDy;

    const slideTimer = setTimeout(() => {
      this.isSliding = false;
      // 向きを維持したまま1マススライド
      this.blockLogic.x += dx;
      this.blockLogic.y += dy;
      this.updateBlockMeshInstant();
      this.checkLandState();
    }, 180);
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

    const clearAnim = (now) => {
      const elapsed = now - startT;
      const progress = Math.min(elapsed / duration, 1.0);

      if (progress < 1.0) {
        const ease = Math.sin(progress * Math.PI * 0.5);
        this.blockMesh.position.z = startZ + ease * 1.6;
        this.blockMesh.rotation.z += 0.06;
        this.blockMesh.rotation.y += 0.04;

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
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'PREVIEW') return;
      if (this.isAnimating || this.isClear || this.isDead) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.rollScreenRelative(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.rollScreenRelative(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.rollScreenRelative(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.rollScreenRelative(1, 0);
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          this.undo();
          break;
        case 'r':
        case 'R':
          if (this.callbacks.onRestart) this.callbacks.onRestart();
          break;
        case 'v':
        case 'V':
          this.setMode(this.mode === 'PLAY' ? 'PREVIEW' : 'PLAY');
          break;
      }
    });

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

    // ワープポータルの回転エフェクト
    if (this.portalMeshes.length > 0) {
      this.portalMeshes.forEach(p => {
        p.rotation.z += 0.03;
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}
