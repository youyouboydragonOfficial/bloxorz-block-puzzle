package com.youyouboydragon.rollingblock;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private NativeAppUpdater nativeUpdater;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        WebView webView = this.getBridge().getWebView();
        if (webView != null) {
            nativeUpdater = new NativeAppUpdater(this, webView);
            webView.addJavascriptInterface(nativeUpdater, "NativeAppUpdater");
        }
    }
}
