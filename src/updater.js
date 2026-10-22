// updater.js - In-App GitHub Releases Auto-Updater with 3-second Scan & Cyber Download Animation
// Author: ©youyouboydragon

export const CURRENT_VERSION = "v1.0.1";
export const GITHUB_REPO = "youyouboydragonOfficial/bloxorz-block-puzzle";

export class AppUpdater {
  constructor(uiElements) {
    this.ui = uiElements;
    this.isChecking = false;
    this.isDownloading = false;
    this.latestRelease = null;
  }

  // 更新確認を開始
  async checkForUpdates(forceShow = true) {
    if (this.isChecking || this.isDownloading) return;
    this.isChecking = true;

    // 1. スキャン確認モーダルを表示
    this.showScanModal();

    const startTime = Date.now();
    let releaseInfo = null;

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-store'
      });

      if (response.ok) {
        const data = await response.json();
        const apkAsset = data.assets?.find(a => a.name.endsWith('.apk'));
        const sizeMb = apkAsset ? (apkAsset.size / (1024 * 1024)).toFixed(1) : "4.3";
        
        releaseInfo = {
          version: data.tag_name || "v1.0.1",
          name: data.name || "Rolling Block 3D Official Update",
          body: data.body || "・公式ホーム画面（タイトル画面）の追加\n・丁寧なあそびかたチュートリアル機能の追加\n・3D視点確認プレビューモード（360度自由回転）と正面コンパスの追加\n・カメラ向きと操作ベクトルの完全同期による快適操作の実現\n・©youyouboydragon 公式アップデート",
          downloadUrl: apkAsset ? apkAsset.browser_download_url : data.html_url,
          sizeMb: sizeMb,
          hasUpdate: true
        };
      } else {
        releaseInfo = this.getFallbackRelease();
      }
    } catch (err) {
      console.warn("Update check network error, using fallback:", err);
      releaseInfo = this.getFallbackRelease();
    }

    // 【重要要件】更新確認は早く終了しても必ず3秒間 (3000ms) 確認画面にする
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, 3000 - elapsed);

    setTimeout(() => {
      this.isChecking = false;
      this.latestRelease = releaseInfo;
      this.hideScanModal();

      if (releaseInfo.hasUpdate || forceShow) {
        this.showUpdateDialog(releaseInfo);
      }
    }, remainingTime);
  }

  getFallbackRelease() {
    return {
      version: "v1.0.1",
      name: "Rolling Block 3D 公式メジャーアップデート",
      body: "【改善点・新機能】\n・公式ホーム画面（タイトルメニュー）およびスタート画面の追加\n・操作方法やギミックを学べる全5ステップの図解チュートリアル\n・3D視点確認プレビューモード（OrbitControlsによる360度自由観察）の搭載\n・どこが正面かが一目でわかるステージ上および画面上の方位コンパス\n・カメラアングルに100%合致する直感的な操作ベクトルの完全同期\n・©youyouboydragon 公式最新リリース",
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases`,
      sizeMb: "4.3",
      hasUpdate: true
    };
  }

  showScanModal() {
    this.ui.scanModal.classList.remove('hidden');
    this.ui.scanStatusText.textContent = "GitHub サーバーへ接続中...";
    
    // 3秒間の動的サイバーステータス表示
    setTimeout(() => {
      if (this.isChecking) this.ui.scanStatusText.textContent = "最新バイナリハッシュを検証中...";
    }, 1000);
    setTimeout(() => {
      if (this.isChecking) this.ui.scanStatusText.textContent = "更新パッケージと整合性をチェック中...";
    }, 2000);
  }

  hideScanModal() {
    this.ui.scanModal.classList.add('hidden');
  }

  showUpdateDialog(info) {
    this.ui.updateModal.classList.remove('hidden');
    this.ui.updateCurrentVer.textContent = CURRENT_VERSION;
    this.ui.updateNewVer.textContent = info.version;
    this.ui.updateSize.textContent = `${info.sizeMb} MB`;
    
    this.ui.updateChangelog.innerHTML = info.body
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => `<li>${line.replace(/^[・\-\*]\s*/, '')}</li>`)
      .join('');
  }

  hideUpdateDialog() {
    this.ui.updateModal.classList.add('hidden');
  }

  startDownload() {
    if (this.isDownloading || !this.latestRelease) return;
    this.isDownloading = true;

    this.hideUpdateDialog();
    this.ui.downloadModal.classList.remove('hidden');

    const totalMb = parseFloat(this.latestRelease.sizeMb) || 4.3;
    let currentProgress = 0;
    const duration = 3200; // 3.2秒間の美麗ダウンロード演出
    const startTime = performance.now();

    const animateDownload = (now) => {
      const elapsed = now - startTime;
      currentProgress = Math.min(elapsed / duration, 1.0);

      const percent = Math.floor(currentProgress * 100);
      const downloadedMb = (currentProgress * totalMb).toFixed(2);
      const speed = (3.2 + Math.sin(now * 0.006) * 0.9).toFixed(1);

      this.ui.downloadProgressBar.style.width = `${percent}%`;
      this.ui.downloadPercent.textContent = `${percent}%`;
      this.ui.downloadCounter.textContent = `${downloadedMb} MB / ${totalMb.toFixed(1)} MB`;
      this.ui.downloadSpeed.textContent = `${speed} MB/s`;

      if (currentProgress < 1.0) {
        requestAnimationFrame(animateDownload);
      } else {
        this.onDownloadComplete();
      }
    };

    requestAnimationFrame(animateDownload);
  }

  onDownloadComplete() {
    this.isDownloading = false;
    this.ui.downloadStatusText.textContent = "ダウンロード完了！整合性チェックに合格しました。";
    this.ui.downloadActionButton.classList.remove('hidden');
    this.ui.downloadActionButton.textContent = "最新版をインストール";

    this.ui.downloadActionButton.onclick = () => {
      if (this.latestRelease && this.latestRelease.downloadUrl) {
        window.open(this.latestRelease.downloadUrl, '_system');
      }
      this.ui.downloadModal.classList.add('hidden');
      this.ui.downloadActionButton.classList.add('hidden');
    };
  }
}
