// main.js - Application entry point, UI binding, Save/Load & Updater orchestration
// Author: ©youyouboydragon

import { GameScene } from './game.js';
import { generateLevel } from './levels.js';
import { sound } from './audio.js';
import { AppUpdater } from './updater.js';

class App {
  constructor() {
    this.currentLevelId = this.loadSavedLevel();
    this.stagePage = Math.floor((this.currentLevelId - 1) / 20);
    this.gameScene = null;
    this.updater = null;

    this.initElements();
    this.initGame();
    this.initUIEvents();
    this.initUpdater();

    // 初回レベルロード
    this.loadLevel(this.currentLevelId);
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

  initElements() {
    this.canvasContainer = document.getElementById('canvas-container');
    this.hudLevelNumber = document.getElementById('hud-level-number');
    this.hudLevelName = document.getElementById('hud-level-name');
    this.hudMoveCount = document.getElementById('hud-move-count');
    this.hudBlockType = document.getElementById('hud-block-type');

    this.btnRestart = document.getElementById('btn-restart');
    this.btnSelectStage = document.getElementById('btn-select-stage');
    this.btnSound = document.getElementById('btn-sound');
    this.btnCheckUpdate = document.getElementById('btn-check-update');

    // DPad
    this.dpadUp = document.getElementById('dpad-up');
    this.dpadDown = document.getElementById('dpad-down');
    this.dpadLeft = document.getElementById('dpad-left');
    this.dpadRight = document.getElementById('dpad-right');

    // Modals
    this.modalClear = document.getElementById('modal-clear');
    this.clearMovesCount = document.getElementById('clear-moves-count');
    this.btnNextLevel = document.getElementById('btn-next-level');
    this.btnClearRetry = document.getElementById('btn-clear-retry');

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
      onWin: (totalMoves) => {
        this.onStageClear(totalMoves);
      },
      onFail: () => {
        // 落下失敗時：0.5秒後に自動リトライ
        setTimeout(() => {
          this.loadLevel(this.currentLevelId);
        }, 500);
      },
      onRestart: () => {
        this.loadLevel(this.currentLevelId);
      }
    });
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
      CUBE: "1x1x1",
      LONG: "1x1x3"
    };
    this.hudBlockType.textContent = blockTypeLabels[levelData.blockType || "STANDARD"] || "1x1x2";

    this.gameScene.loadLevel(levelData);
  }

  onStageClear(moves) {
    this.clearMovesCount.textContent = moves;
    this.modalClear.classList.remove('hidden');
  }

  initUIEvents() {
    // リトライボタン
    this.btnRestart.addEventListener('click', () => {
      sound.playClick();
      this.loadLevel(this.currentLevelId);
    });

    // サウンド切り替え
    this.btnSound.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      this.btnSound.textContent = isMuted ? '🔇' : '🔊';
      if (!isMuted) {
        sound.startBgm();
      }
    });

    // D-Pad 操作
    const handleDPad = (dx, dy) => {
      sound.init(); // 最初のタップでAudioContextを有効化
      this.gameScene.roll(dx, dy);
    };

    this.dpadUp.addEventListener('click', () => handleDPad(0, -1));
    this.dpadDown.addEventListener('click', () => handleDPad(0, 1));
    this.dpadLeft.addEventListener('click', () => handleDPad(-1, 0));
    this.dpadRight.addEventListener('click', () => handleDPad(1, 0));

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
    this.btnSelectStage.addEventListener('click', () => {
      sound.playClick();
      this.renderStageGrid();
      this.modalStageSelect.classList.remove('hidden');
    });

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
      }
    });
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
      });
      this.stageGrid.appendChild(btn);
    }
  }

  initUpdater() {
    this.updater = new AppUpdater(this.updaterUi);

    // アップデート確認ボタン
    this.btnCheckUpdate.addEventListener('click', () => {
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

// 起動
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
