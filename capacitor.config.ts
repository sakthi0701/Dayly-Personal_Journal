import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dayly.app',
  appName: 'Dayly',
  webDir: 'out', // Next.js static export output dir

  // ─── SERVER ──────────────────────────────────────────────
  // Points the Android WebView to your deployed Vercel URL.
  // The app calls your Next.js API routes there — your laptop
  // never needs to be on for the app to function.
  //
  // REPLACE THIS URL after running: vercel --prod
  server: {
    url: 'https://dayly7.vercel.app',     // Live Vercel deployment
    cleartext: false,                     // Force HTTPS only
    androidScheme: 'https',              // Required for cookies & Supabase auth
  },

  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
    // Allow the WebView to use hardware acceleration
    backgroundColor: '#0d0d1a',          // Match your dark theme to prevent flash
  },

  plugins: {
    // Status bar: dark background, light icons (matches Dayly dark theme)
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0d0d1a',
      overlaysWebView: false,
    },

    // Splash screen config (shown while WebView loads the Vercel page)
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0d0d1a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },

    // Local notifications for streak reminders
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#FFD700',             // Sun Warrior gold
      sound: 'default',
    },

    // Preferences (local key-value cache, replaces localStorage for native)
    Preferences: {
      group: 'DaylyCache',
    },
  },
};

export default config;
