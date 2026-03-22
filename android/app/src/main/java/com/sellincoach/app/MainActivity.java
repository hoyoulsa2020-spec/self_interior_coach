package com.sellincoach.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final String CHANNEL_ID = "selco-default";

  private long lastBackPress = 0;

  private static final String[] ROOT_PATHS = {
    "/", "/login", "/signup", "/dashboard", "/provider", "/provider/dashboard", "/admin"
  };

  private boolean isRootPath(String path) {
    if (path == null) return true;
    for (String p : ROOT_PATHS) {
      if (path.equals(p) || path.equals(p + "/")) return true;
    }
    return false;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    createNotificationChannel();

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        MainActivity.this.handleBackPressed();
      }
    });
  }

  private void handleBackPressed() {
    Bridge bridge = getBridge();
    if (bridge != null) {
      WebView webView = bridge.getWebView();
      if (webView != null) {
        String url = webView.getUrl();
        String path = url != null ? Uri.parse(url).getPath() : "/";
        if (webView.canGoBack() && !isRootPath(path)) {
          webView.goBack();
          return;
        }
      }
    }
    long now = System.currentTimeMillis();
    if (now - lastBackPress < 2000) {
      finish();
    } else {
      lastBackPress = now;
      Toast.makeText(this, "한 번 더 누르면 종료됩니다", Toast.LENGTH_SHORT).show();
    }
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "셀인코치 알림",
        NotificationManager.IMPORTANCE_HIGH
      );
      channel.setDescription("푸시 알림");
      channel.enableVibration(true);
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager != null) {
        manager.createNotificationChannel(channel);
      }
    }
  }
}
