// game.js - Three.js Renderer, Stage Builder, Camera Controller & Visual Effects
import * as THREE from 'three';
import { PuzzleBlock, ORIENTATION } from './block.js';
import { sound } from './audio.js';

export class GameScene {
  constructor(canvasContainer, callbacks = {}) {
    this.container = canvasContainer;
    this.callbacks = callbacks; // onWin, onFail, onMove

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.levelData = null;
    this.blockLogic = new PuzzleBlock();
    this.blockMesh = null;
    this.pivotGroup = null;

    this.tileMeshes = [];
    this.switchMeshes = [];
    this.bridgeMeshes = [];
    this.goalLight = null;
    this.particles = null;

    this.isAnimating = false;
    this.isClear = false;
    this.isDead = false;
    this.moveCount = 0;

    this.animStartTime = 0;
    this.animDuration = 150; // 軽快でスムーズな150ms

    this.initScene();
    this.initEventListeners();
  }

  initScene() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0f1d); // 深遠なコズミックネイビー
    this.scene.fog = new THREE.FogExp2(0x0c0f1d, 0.025);

    // Camera (斜め上からの美麗アイソメトリック俯瞰)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 1000);
    this.camera.position.set(10, -14, 18);
    this.camera.up.set(0, 0, 1); // Z軸が鉛直上向き
    this.camera.lookAt(5, 5, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, -20, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 70;
    const d = 16;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 補助ソフトライト
    const fillLight = new THREE.DirectionalLight(0x4466aa, 0.5);
    fillLight.position.set(-15, 20, 10);
    this.scene.add(fillLight);

    // Pivot Group (ブロック転がり回転用)
    this.pivotGroup = new THREE.Group();
    this.scene.add(this.pivotGroup);

    // パーティクルシステム
    this.initGoalParticles();

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Render loop
    this.render();
  }

  initGoalParticles() {
    const pCount = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    const speeds = new Float32Array(pCount);

    for (let i = 0; i < pCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1.2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
      positions[i * 3 + 2] = Math.random() * 2.5;
      speeds[i] = 0.01 + Math.random() * 0.02;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x00ffcc,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
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

    // 前のオブジェクト破棄
    this.clearLevelObjects();

    // タイル＆ステージ生成
    this.buildStage();

    // ブロック生成 & スポーン
    this.blockLogic.reset(levelData.spawn.x, levelData.spawn.y, levelData.blockType || "STANDARD");
    this.buildBlockMesh();
    this.updateBlockMeshInstant();

    // カメラ自動調整 (ステージ全体が美しく収まるように)
    this.adjustCamera();

    // パーティクル位置設定 (ゴール)
    if (this.particles && this.levelData.goal) {
      this.particles.position.set(this.levelData.goal.x + 0.5, this.levelData.goal.y + 0.5, 0.2);
      this.particles.visible = true;
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

    // マテリアル定義
    const normalTileMat = new THREE.MeshStandardMaterial({
      color: 0x222a3f,
      roughness: 0.4,
      metalness: 0.2
    });
    const tileEdgeMat = new THREE.LineBasicMaterial({ color: 0x3d4b6e });

    const fragileTileMat = new THREE.MeshStandardMaterial({
      color: 0xdd6611,
      emissive: 0xaa3300,
      emissiveIntensity: 0.3,
      roughness: 0.5
    });

    const goalHoleMat = new THREE.MeshStandardMaterial({
      color: 0x001122,
      roughness: 0.8
    });

    const tileGeo = new THREE.BoxGeometry(0.96, 0.96, 0.25);
    const tileEdgesGeo = new THREE.EdgesGeometry(tileGeo);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = grid[y][x];
        if (type === 0) continue; // 空白

        const cx = x + 0.5;
        const cy = y + 0.5;
        const cz = -0.125;

        if (type === 1) { // 通常床
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
          // ゴール枠
          const mesh = new THREE.Mesh(tileGeo, goalHoleMat);
          mesh.position.set(cx, cy, cz - 0.05);
          this.scene.add(mesh);
          this.tileMeshes.push(mesh);

          // ネオングローリング
          const ringGeo = new THREE.RingGeometry(0.2, 0.45, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffee,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(cx, cy, 0.01);
          this.scene.add(ring);
          this.tileMeshes.push(ring);

          // ゴールの発光ライト
          this.goalLight = new THREE.PointLight(0x00ffcc, 2.5, 6);
          this.goalLight.position.set(cx, cy, 0.6);
          this.scene.add(this.goalLight);
        }
      }
    }

    // スイッチと橋の構築
    if (this.levelData.switches) {
      const buttonGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.08, 16);
      buttonGeo.rotateX(Math.PI / 2);

      this.levelData.switches.forEach(sw => {
        const isHeavy = sw.type === 'heavy';
        const swMat = new THREE.MeshStandardMaterial({
          color: isHeavy ? 0xff2255 : 0xffcc00,
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
    // 角がシャープな直方体ブロック（エッジを強調して視認性抜群）
    const geo = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);
    
    // 高品質メタリック＆サイバーブロックマテリアル
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe0e6ed,
      roughness: 0.28,
      metalness: 0.45,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2
    });

    this.blockMesh = new THREE.Mesh(geo, mat);
    this.blockMesh.castShadow = true;
    this.blockMesh.receiveShadow = true;

    // ブロックのエッジライン (ネオンブルーの輪郭線)
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, linewidth: 2 });
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

  adjustCamera() {
    const width = this.levelData.width;
    const height = this.levelData.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const span = Math.max(width, height);
    const dist = Math.max(14, span * 1.6);

    // カメラ位置をステージ中央に向けて滑らかにセット
    this.camera.position.set(centerX + dist * 0.55, centerY - dist * 0.75, dist * 0.95);
    this.camera.lookAt(centerX, centerY, 0);
  }

  // プレイヤーの移動入力処理 (dx, dy)
  roll(dx, dy) {
    if (this.isAnimating || this.isClear || this.isDead) return;

    const rollData = this.blockLogic.calculateRoll(dx, dy);
    if (!rollData) return;

    this.isAnimating = true;
    this.moveCount++;
    if (this.callbacks.onMove) {
      this.callbacks.onMove(this.moveCount);
    }

    // 回転音再生
    sound.playRoll(rollData.nextOrientation === ORIENTATION.STANDING);

    // ピボット回転アニメーションの準備
    // 1. PivotGroupを回転軸の位置に配置
    const { pivot, axis, angle } = rollData;
    this.pivotGroup.position.set(pivot.x, pivot.y, pivot.z);
    this.pivotGroup.rotation.set(0, 0, 0);

    // 2. blockMeshをSceneからPivotGroupの子に付け替える (ワールド位置を維持)
    this.pivotGroup.attach(this.blockMesh);

    // 3. アニメーション実行
    const startTime = performance.now();
    const duration = this.animDuration;

    const rotAxis = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

    const animateRoll = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      
      // イージング (easeOutQuad)
      const ease = 1 - (1 - progress) * (1 - progress);
      const curAngle = ease * angle;

      this.pivotGroup.setRotationFromAxisAngle(rotAxis, curAngle);

      if (progress < 1.0) {
        requestAnimationFrame(animateRoll);
      } else {
        // 回転完了
        this.pivotGroup.setRotationFromAxisAngle(rotAxis, angle);
        
        // メッシュをSceneに戻す
        this.scene.attach(this.blockMesh);
        
        // 論理座標の更新
        this.blockLogic.applyRoll(rollData.nextX, rollData.nextY, rollData.nextOrientation);

        // 寸法再作成 (形状変化時)
        const dim = this.blockLogic.getDimensions();
        this.blockMesh.geometry.dispose();
        this.blockMesh.geometry = new THREE.BoxGeometry(dim.sx - 0.04, dim.sy - 0.04, dim.sz - 0.04);
        
        // エッジも再作成
        if (this.blockMesh.children[0]) {
          this.blockMesh.children[0].geometry.dispose();
          this.blockMesh.children[0].geometry = new THREE.EdgesGeometry(this.blockMesh.geometry);
        }

        this.updateBlockMeshInstant();
        this.pivotGroup.rotation.set(0, 0, 0);

        this.isAnimating = false;

        // 接地後判定 (落下・スイッチ・ゴール)
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
    let allOnFragile = true;

    for (const cell of occupied) {
      if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) {
        hasTile = false;
        break;
      }
      const tileType = grid[cell.y][cell.x];
      if (tileType === 0) { // 穴・床なし
        hasTile = false;
        break;
      }
      if (tileType !== 2) {
        allOnFragile = false;
      }
    }

    // 壊れる床 (オレンジ床) の判定:
    // 直立 (STANDING) でオレンジ床に乗ると床が抜けて落下！
    if (this.blockLogic.orientation === ORIENTATION.STANDING && hasTile) {
      const cell = occupied[0];
      if (grid[cell.y][cell.x] === 2) {
        // 崩壊！
        this.triggerFragileCollapse(cell.x, cell.y);
        return;
      }
    }

    // スイッチの判定
    if (hasTile && this.levelData.switches) {
      this.checkSwitches(occupied);
    }

    // 落下判定
    if (!hasTile) {
      this.triggerFall();
      return;
    }

    // ゴール判定:
    // STANDING でゴール穴 (tileType 3) に入った場合
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
          return; // 重いスイッチは直立のみ反応
        }
        // スイッチ作動
        sound.playSwitch();
        swMesh.position.z = 0.01; // 押し込まれた視覚効果
        
        // 橋のトグル (床タイルの生成/消滅)
        if (sw.targets) {
          sw.targets.forEach(tgt => {
            const curVal = this.levelData.grid[tgt.y][tgt.x];
            this.levelData.grid[tgt.y][tgt.x] = (curVal === 0) ? 1 : 0;
          });
          // ステージ再描画（ブロック位置は維持）
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
    
    // オレンジ床が砕け落ちるアニメーション
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
    const duration = 700;
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

    // ブロックがゴール穴にスポッと沈み込む
    const startT = performance.now();
    const duration = 800;
    const startZ = this.blockMesh.position.z;

    const clearAnim = (now) => {
      const progress = (now - startT) / duration;
      if (progress < 1.0) {
        this.blockMesh.position.z = startZ - progress * 1.5;
        this.blockMesh.scale.x = Math.max(0.01, 1 - progress * 0.8);
        this.blockMesh.scale.y = Math.max(0.01, 1 - progress * 0.8);
        
        // ゴールライトが激しく明滅
        if (this.goalLight) {
          this.goalLight.intensity = 2.5 + Math.sin(progress * 20) * 2;
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
    // キーボード操作 (Arrow keys, WASD)
    window.addEventListener('keydown', (e) => {
      if (this.isAnimating || this.isClear || this.isDead) return;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.roll(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.roll(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.roll(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.roll(1, 0);
          break;
        case 'r':
        case 'R':
          if (this.callbacks.onRestart) this.callbacks.onRestart();
          break;
      }
    });

    // スワイプ操作 (モバイル対応)
    let touchStartX = 0;
    let touchStartY = 0;
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.container.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const threshold = 25; // 25px以上のフリックで検知

        if (Math.max(absX, absY) > threshold) {
          if (absX > absY) {
            this.roll(dx > 0 ? 1 : -1, 0);
          } else {
            this.roll(0, dy > 0 ? 1 : -1);
          }
        }
      }
    }, { passive: true });
  }

  render() {
    requestAnimationFrame(() => this.render());

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
