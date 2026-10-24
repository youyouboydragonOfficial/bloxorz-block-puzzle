// main.js - Application orchestration, Flow controller, Tutorial & UI binding
// Author: ©youyouboydragon

import { GameScene } from './game.js';
import { generateLevel } from './levels.js';
import { sound } from './audio.js';
import { AppUpdater } from './updater.js';

// チュートリアルスライドデータ
const TUTORIAL_SLIDES = [
  {
    icon: "🕹",
    headline: "1. ブロックの基本動作",
    desc: "画面のスワイプ、矢印キー（WASD）、または画面下の十字キーでブロックを転がします。<br>転がる向きに応じて、<strong>「立っている状態（1x1x2）」</strong>と<strong>「横倒しの状態（2x1x1）」</strong>に滑らかに姿勢変化します。"
  },
  {
    icon: "✨",
    headline: "2. ゴールへの到達条件",
    desc: "ステージ上にある<strong>ネオンに光るゴールホール</strong>を目指します！<br>ブロックが<strong>「直立した状態」</strong>で入れば<strong>【★★★ PERFECT!】</strong><br>また、横倒しの状態でもゴールを踏めば<strong>【★★ STAGE CLEAR!】</strong>としてクリアできます！"
  },
  {
    icon: "⚠️",
    headline: "3. 落下と壊れるオレンジ床",
    desc: "床のない奈落に足を踏み外すと落下して失敗となります。<br>また、<strong>オレンジ色の薄い床タイル</strong>は、直立した重みで砕け落ちます！オレンジ床の上は<strong>横倒しの状態</strong>で素早く通り抜けましょう。"
  },
  {
    icon: "🔘",
    headline: "4. スイッチと橋のギミック",
    desc: "ステージ上にはスイッチが存在します。<br>・<strong>丸型スイッチ (○)</strong>: 横倒しでも直立でも踏むだけで作動。<br>・<strong>十字ヘビースイッチ (＋)</strong>: 直立した強い重みでのみ作動！<br>スイッチを踏むと遠くの足場が出現・消滅します。"
  },
  {
    icon: "👁",
    headline: "5. 3D視点確認モード",
    desc: "ブロックが落ちてしまわないよう、右上の<strong>「👁 視点確認」</strong>ボタンを押すと、画面ドラッグでステージを360度全方位から観察できます！<br><strong>「🎯 正面」</strong>ボタンでいつでも正面のベストポジションに戻せます。"
  },
  {
    icon: "🎲",
    headline: "6. ブロック形状チェンジ（救済機能）",
    desc: "HUDの<strong>「BLOCK 🔄」</strong>をタップすると、ブロックの形状をいつでも切り替えられます！<br>・<strong>1x1x2 (STANDARD)</strong>: 本格パズルの標準直方体<br>・<strong>1x1x1 (CUBE)</strong>: 初心者救済キューブ！細い一本道でも絶対に落ちません！<br>・<strong>1x1x3 (LONG)</strong>: 超ロングピラーの超難関モード！"
  }
];

class App {
  constructor() {
    this.currentLevelId = this.loadSavedLevel();
    this.stagePage = Math.floor((this.currentLevelId - 1) / 20);
    this.gameScene = null;
    this.updater = null;
    this.tutIndex = 0;

    this.initElements();
    this.initGame();
    this.initUIEvents();
    this.initUpdater();

    // ホーム画面のラベル更新
    this.updateHomeLabels();
  }

  loadSavedLevel() {
    const saved = localStorage.getItem('bloxorz_saved_level');
    if (saved) {
      const num = parseInt(saved, 10);
      if (!isNaN(num) && num >= 1 && num <= 1000) {
        return num;
      }
    }
    return 1;
  }

  saveLevel(levelId) {
    localStorage.setItem('bloxorz_saved_level', levelId.toString());
  }

  updateHomeLabels() {
    if (this.homeResumeLabel) {
      this.homeResumeLabel.textContent = `STAGE ${this.currentLevelId} からプレイ`;
    }
  }

  initElements() {
    // Screens
    this.screenHome = document.getElementById('screen-home');
    this.screenGame = document.getElementById('screen-game');
    this.canvasContainer = document.getElementById('canvas-container');

    // Home buttons
    this.btnHomePlay = document.getElementById('btn-home-play');
    this.homeResumeLabel = document.getElementById('home-resume-label');
    this.btnHomeTutorial = document.getElementById('btn-home-tutorial');
    this.btnHomeStages = document.getElementById('btn-home-stages');
    this.btnHomeUpdate = document.getElementById('btn-home-update');
    this.btnHomeSound = document.getElementById('btn-home-sound');

    // In-Game HUD
    this.btnBackHome = document.getElementById('btn-back-home');
    this.hudLevelNumber = document.getElementById('hud-level-number');
    this.hudLevelName = document.getElementById('hud-level-name');
    this.hudMoveCount = document.getElementById('hud-move-count');
    this.hudBlockType = document.getElementById('hud-block-type');
    this.btnChangeBlock = document.getElementById('btn-change-block');

    this.btnToggleMode = document.getElementById('btn-toggle-mode');
    this.modeIcon = document.getElementById('mode-icon');
    this.modeText = document.getElementById('mode-text');
    this.btnResetCam = document.getElementById('btn-reset-cam');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnGameUpdate = document.getElementById('btn-game-update');
    this.previewBanner = document.getElementById('preview-banner');
    this.btnBannerReturn = document.getElementById('btn-banner-return');

    // D-Pad
    this.dpadContainer = document.getElementById('dpad-container');
    this.dpadUp = document.getElementById('dpad-up');
    this.dpadDown = document.getElementById('dpad-down');
    this.dpadLeft = document.getElementById('dpad-left');
    this.dpadRight = document.getElementById('dpad-right');

    // Tutorial modal
    this.modalTutorial = document.getElementById('modal-tutorial');
    this.tutIcon = document.getElementById('tut-icon');
    this.tutHeadline = document.getElementById('tut-headline');
    this.tutDesc = document.getElementById('tut-desc');
    this.tutDots = document.querySelectorAll('.tut-pagination .dot');
    this.btnTutPrev = document.getElementById('btn-tut-prev');
    this.btnTutNext = document.getElementById('btn-tut-next');
    this.btnCloseTutorial = document.getElementById('btn-close-tutorial');

    // Clear Modal
    this.modalClear = document.getElementById('modal-clear');
    this.clearTitle = document.getElementById('clear-title');
    this.clearSubtitle = document.getElementById('clear-subtitle');
    this.clearMovesCount = document.getElementById('clear-moves-count');
    this.btnNextLevel = document.getElementById('btn-next-level');
    this.btnClearRetry = document.getElementById('btn-clear-retry');

    // Stage Select Modal
    this.modalStageSelect = document.getElementById('modal-stage-select');
    this.stageGrid = document.getElementById('stage-grid');
    this.inputJumpLevel = document.getElementById('input-jump-level');
    this.btnJumpLevel = document.getElementById('btn-jump-level');
    this.btnStagePrevPage = document.getElementById('btn-stage-prev-page');
    this.btnStageNextPage = document.getElementById('btn-stage-next-page');
    this.btnCloseStageSelect = document.getElementById('btn-close-stage-select');

    // Updater UI
    this.updaterUi = {
      scanModal: document.getElementById('modal-scan'),
      scanStatusText: document.getElementById('scan-status-text'),
      updateModal: document.getElementById('modal-update'),
      updateCurrentVer: document.getElementById('update-current-ver'),
      updateNewVer: document.getElementById('update-new-ver'),
      updateSize: document.getElementById('update-size'),
      updateChangelog: document.getElementById('update-changelog'),
      btnStartDownload: document.getElementById('btn-start-download'),
      btnCloseUpdate: document.getElementById('btn-close-update'),
      downloadModal: document.getElementById('modal-download'),
      downloadStatusText: document.getElementById('download-status-text'),
      downloadProgressBar: document.getElementById('download-bar-fill'),
      downloadPercent: document.getElementById('download-percent'),
      downloadCounter: document.getElementById('download-counter'),
      downloadSpeed: document.getElementById('download-speed'),
      downloadActionButton: document.getElementById('btn-download-action')
    };
  }

  initGame() {
    this.gameScene = new GameScene(this.canvasContainer, {
      onMove: (moves) => {
        this.hudMoveCount.textContent = moves;
      },
      onWin: (totalMoves, isPerfect) => {
        this.onStageClear(totalMoves, isPerfect);
      },
      onFail: () => {
        setTimeout(() => {
          this.loadLevel(this.currentLevelId);
        }, 500);
      },
      onRestart: () => {
        this.loadLevel(this.currentLevelId);
      },
      onModeChange: (mode) => {
        this.updateModeUI(mode);
      }
    });

    // 初期ロード
    this.loadLevel(this.currentLevelId);
  }

  showGameScreen() {
    this.screenHome.classList.add('hidden');
    this.screenGame.classList.remove('hidden');
    this.gameScene.setMode('PLAY');
    this.gameScene.onResize();
    sound.init();
    sound.startBgm();
  }

  showHomeScreen() {
    this.screenGame.classList.add('hidden');
    this.screenHome.classList.remove('hidden');
    this.updateHomeLabels();
  }

  loadLevel(levelId) {
    if (levelId < 1) levelId = 1;
    if (levelId > 1000) levelId = 1000;

    this.currentLevelId = levelId;
    this.saveLevel(levelId);

    const levelData = generateLevel(levelId);
    this.hudLevelNumber.textContent = `STAGE ${levelId} / 1000`;
    this.hudLevelName.textContent = levelData.name;
    this.hudMoveCount.textContent = "0";

    const blockTypeLabels = {
      STANDARD: "1x1x2",
      CUBE: "1x1x1 (救済)",
      LONG: "1x1x3 (難関)"
    };
    this.hudBlockType.textContent = blockTypeLabels[levelData.blockType || "STANDARD"] || "1x1x2";

    this.gameScene.loadLevel(levelData);
  }

  onStageClear(moves, isPerfect = true) {
    this.clearMovesCount.textContent = moves;
    if (isPerfect) {
      this.clearTitle.textContent = "PERFECT CLEAR! ★★★";
      this.clearSubtitle.textContent = "直立でホールイン達成！完璧なクリアです！";
    } else {
      this.clearTitle.textContent = "STAGE CLEAR! ★★";
      this.clearSubtitle.textContent = "ゴール到達！（直立で入ると★★★PERFECT達成）";
    }
    this.modalClear.classList.remove('hidden');
  }

  cycleBlockType() {
    sound.playClick();
    const cur = this.gameScene.blockLogic.blockType;
    let next = "STANDARD";
    if (cur === "STANDARD") next = "CUBE";
    else if (cur === "CUBE") next = "LONG";
    else next = "STANDARD";

    this.gameScene.changeBlockType(next);

    const blockTypeLabels = {
      STANDARD: "1x1x2",
      CUBE: "1x1x1 (救済)",
      LONG: "1x1x3 (難関)"
    };
    this.hudBlockType.textContent = blockTypeLabels[next] || next;
  }

  updateModeUI(mode) {
    if (mode === 'PREVIEW') {
      this.modeIcon.textContent = "🎮";
      this.modeText.textContent = "操作へ戻る";
      this.btnToggleMode.classList.add('preview-active');
      this.previewBanner.classList.remove('hidden');
      this.dpadContainer.classList.add('hidden'); // 視点操作中はD-Padを非表示
    } else {
      this.modeIcon.textContent = "👁";
      this.modeText.textContent = "視点確認";
      this.btnToggleMode.classList.remove('preview-active');
      this.previewBanner.classList.add('hidden');
      this.dpadContainer.classList.remove('hidden');
    }
  }

  initUIEvents() {
    // ホーム画面イベント
    this.btnHomePlay.addEventListener('click', () => {
      sound.playClick();
      this.showGameScreen();
    });

    this.btnHomeTutorial.addEventListener('click', () => {
      sound.playClick();
      this.openTutorial();
    });

    this.btnHomeStages.addEventListener('click', () => {
      sound.playClick();
      this.renderStageGrid();
      this.modalStageSelect.classList.remove('hidden');
    });

    this.btnHomeSound.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      this.btnHomeSound.textContent = isMuted ? '🔇 BGM/効果音: OFF' : '🔊 BGM/効果音: ON';
      if (!isMuted) sound.startBgm();
    });

    // ゲーム画面イベント
    this.btnBackHome.addEventListener('click', () => {
      sound.playClick();
      this.showHomeScreen();
    });

    this.btnRestart.addEventListener('click', () => {
      sound.playClick();
      this.loadLevel(this.currentLevelId);
    });

    // ブロック形状切り替え (救済キューブ / 標準 / ロング)
    if (this.btnChangeBlock) {
      this.btnChangeBlock.addEventListener('click', () => {
        this.cycleBlockType();
      });
    }

    // 視点確認モードトグル
    this.btnToggleMode.addEventListener('click', () => {
      sound.playClick();
      const newMode = (this.gameScene.mode === 'PLAY') ? 'PREVIEW' : 'PLAY';
      this.gameScene.setMode(newMode);
    });

    this.btnBannerReturn.addEventListener('click', () => {
      sound.playClick();
      this.gameScene.setMode('PLAY');
    });

    // 正面カメラリセット
    this.btnResetCam.addEventListener('click', () => {
      sound.playClick();
      this.gameScene.resetCamera();
    });

    // D-Pad 操作 (画面相対方向への厳密な転がり)
    const handleDPad = (screenDx, screenDy) => {
      sound.init();
      this.gameScene.rollScreenRelative(screenDx, screenDy);
    };

    this.dpadUp.addEventListener('click', () => handleDPad(0, -1));    // 画面奥へ
    this.dpadDown.addEventListener('click', () => handleDPad(0, 1));    // 画面手前へ
    this.dpadLeft.addEventListener('click', () => handleDPad(-1, 0));  // 画面左へ
    this.dpadRight.addEventListener('click', () => handleDPad(1, 0));   // 画面右へ

    // チュートリアル操作
    this.btnTutPrev.addEventListener('click', () => {
      sound.playClick();
      if (this.tutIndex > 0) {
        this.tutIndex--;
        this.renderTutorialSlide();
      }
    });

    this.btnTutNext.addEventListener('click', () => {
      sound.playClick();
      if (this.tutIndex < TUTORIAL_SLIDES.length - 1) {
        this.tutIndex++;
        this.renderTutorialSlide();
      } else {
        this.modalTutorial.classList.add('hidden');
      }
    });

    this.btnCloseTutorial.addEventListener('click', () => {
      sound.playClick();
      this.modalTutorial.classList.add('hidden');
    });

    // クリア画面
    this.btnNextLevel.addEventListener('click', () => {
      sound.playClick();
      this.modalClear.classList.add('hidden');
      this.loadLevel(this.currentLevelId + 1);
    });

    this.btnClearRetry.addEventListener('click', () => {
      sound.playClick();
      this.modalClear.classList.add('hidden');
      this.loadLevel(this.currentLevelId);
    });

    // ステージセレクト画面
    this.btnCloseStageSelect.addEventListener('click', () => {
      sound.playClick();
      this.modalStageSelect.classList.add('hidden');
    });

    this.btnStagePrevPage.addEventListener('click', () => {
      if (this.stagePage > 0) {
        this.stagePage--;
        this.renderStageGrid();
      }
    });

    this.btnStageNextPage.addEventListener('click', () => {
      if ((this.stagePage + 1) * 20 < 1000) {
        this.stagePage++;
        this.renderStageGrid();
      }
    });

    this.btnJumpLevel.addEventListener('click', () => {
      const val = parseInt(this.inputJumpLevel.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 1000) {
        this.modalStageSelect.classList.add('hidden');
        this.loadLevel(val);
        this.showGameScreen();
      }
    });
  }

  openTutorial() {
    this.tutIndex = 0;
    this.renderTutorialSlide();
    this.modalTutorial.classList.remove('hidden');
  }

  renderTutorialSlide() {
    const slide = TUTORIAL_SLIDES[this.tutIndex];
    this.tutIcon.textContent = slide.icon;
    this.tutHeadline.textContent = slide.headline;
    this.tutDesc.innerHTML = slide.desc;

    this.tutDots.forEach((dot, idx) => {
      if (idx === this.tutIndex) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    this.btnTutPrev.disabled = (this.tutIndex === 0);
    this.btnTutNext.textContent = (this.tutIndex === TUTORIAL_SLIDES.length - 1) ? "完了" : "次へ ▶";
  }

  renderStageGrid() {
    this.stageGrid.innerHTML = '';
    const start = this.stagePage * 20 + 1;
    const end = Math.min(start + 19, 1000);

    for (let id = start; id <= end; id++) {
      const btn = document.createElement('button');
      btn.className = 'level-grid-btn';
      if (id === this.currentLevelId) {
        btn.classList.add('current');
      }
      btn.textContent = id;
      btn.addEventListener('click', () => {
        sound.playClick();
        this.modalStageSelect.classList.add('hidden');
        this.loadLevel(id);
        this.showGameScreen();
      });
      this.stageGrid.appendChild(btn);
    }
  }

  initUpdater() {
    this.updater = new AppUpdater(this.updaterUi);

    // ホーム画面の特大アップデート確認ボタン
    this.btnHomeUpdate.addEventListener('click', () => {
      sound.playClick();
      this.updater.checkForUpdates(true);
    });

    // ゲーム中右上のアップデート確認ボタン
    this.btnGameUpdate.addEventListener('click', () => {
      sound.playClick();
      this.updater.checkForUpdates(true);
    });

    this.updaterUi.btnCloseUpdate.addEventListener('click', () => {
      sound.playClick();
      this.updater.hideUpdateDialog();
    });

    this.updaterUi.btnStartDownload.addEventListener('click', () => {
      sound.playClick();
      this.updater.startDownload();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
