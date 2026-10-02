import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getitdone.taskflow',
  appName: 'Get It Done',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#090d16',
    allowMixedContent: true,
  },
};

export default config;
