package com.youyouboydragon.rollingblock;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NativeAppUpdater {
    private final Activity activity;
    private final WebView webView;
    private final Handler mainHandler;
    private boolean isDownloading = false;

    public NativeAppUpdater(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    @JavascriptInterface
    public boolean isNativeAvailable() {
        return true;
    }

    @JavascriptInterface
    public void downloadAndInstall(final String downloadUrl) {
        if (isDownloading) return;
        isDownloading = true;

        new Thread(new Runnable() {
            @Override
            public void run() {
                File apkFile = null;
                try {
                    // キャッシュディレクトリに保存
                    File cacheDir = activity.getCacheDir();
                    apkFile = new File(cacheDir, "rolling-block-update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    // リダイレクト追従ループ
                    String currentUrl = downloadUrl;
                    HttpURLConnection conn = null;
                    int redirectCount = 0;

                    while (redirectCount < 8) {
                        URL url = new URL(currentUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "RollingBlock3D-Updater");
                        conn.setInstanceFollowRedirects(true);
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(30000);

                        int status = conn.getResponseCode();
                        if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                            status == HttpURLConnection.HTTP_MOVED_PERM ||
                            status == 307 || status == 308) {
                            String newUrl = conn.getHeaderField("Location");
                            if (newUrl != null) {
                                currentUrl = newUrl;
                                redirectCount++;
                                conn.disconnect();
                                continue;
                            }
                        }
                        break;
                    }

                    if (conn == null) {
                        throw new Exception("Connection failed");
                    }

                    long totalBytes = conn.getContentLength();
                    if (totalBytes <= 0) {
                        totalBytes = 4325000; // フォールバック推定サイズ
                    }

                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(apkFile);

                    byte[] buffer = new byte[8192];
                    long receivedBytes = 0;
                    int bytesRead;
                    long startTime = System.currentTimeMillis();
                    long lastUpdateTime = startTime;
                    long lastBytes = 0;

                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        receivedBytes += bytesRead;

                        long now = System.currentTimeMillis();
                        if (now - lastUpdateTime >= 100) {
                            long timeDiff = now - lastUpdateTime;
                            long bytesDiff = receivedBytes - lastBytes;
                            double speedBps = (bytesDiff * 1000.0) / (timeDiff > 0 ? timeDiff : 1);
                            int percent = (int) Math.min(100, (receivedBytes * 100) / totalBytes);

                            sendProgressToJs(percent, receivedBytes, totalBytes, speedBps);

                            lastUpdateTime = now;
                            lastBytes = receivedBytes;
                        }
                    }

                    out.flush();
                    out.close();
                    in.close();
                    conn.disconnect();

                    // 100% 完了通知
                    sendProgressToJs(100, receivedBytes, receivedBytes, 0);

                    // インストーラー起動
                    final File finalApk = apkFile;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            isDownloading = false;
                            installApk(finalApk);
                        }
                    });

                } catch (final Exception e) {
                    e.printStackTrace();
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            isDownloading = false;
                            sendErrorToJs(e.getMessage());
                        }
                    });
                }
            }
        }).start();
    }

    private void sendProgressToJs(final int percent, final long receivedBytes, final long totalBytes, final double speedBps) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String script = String.format(
                        "window.onNativeDownloadProgress && window.onNativeDownloadProgress(%d, %d, %d, %f);",
                        percent, receivedBytes, totalBytes, speedBps
                    );
                    webView.evaluateJavascript(script, null);
                }
            }
        });
    }

    private void sendErrorToJs(final String errorMsg) {
        if (webView != null) {
            String script = String.format(
                "window.onNativeDownloadError && window.onNativeDownloadError('%s');",
                errorMsg != null ? errorMsg.replace("'", "\\'") : "Unknown error"
            );
            webView.evaluateJavascript(script, null);
        }
    }

    // Android システム公式のパッケージインストーラー Intent を起動
    public void installApk(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) return;

            Context context = activity.getApplicationContext();
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            activity.startActivity(intent);

            // JS側に完了コールバック
            if (webView != null) {
                webView.evaluateJavascript("window.onNativeInstallTriggered && window.onNativeInstallTriggered();", null);
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendErrorToJs("Installer launch failed: " + e.getMessage());
        }
    }
}
