import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sitebolt.app",
  appName: "SiteBolt",
  webDir: "public",
  server: {
    // Points the native mobile wrapper directly to your live production server
    // so web and mobile app updates stay live simultaneously:
    url: "https://www.site-bolt.com.au",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
