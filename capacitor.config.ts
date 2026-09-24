import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sitebolt.app",
  appName: "SiteBolt",
  webDir: "public",
  server: {
    // Live production origin: APK loads this URL on launch, so main/Vercel
    // deploys reach workers without a new store or sideload install.
    url: "https://www.site-bolt.com.au",
    androidScheme: "https",
    cleartext: false,
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
