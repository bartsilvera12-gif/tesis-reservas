import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tesis.reserva',
  appName: 'AJ Spots',
  webDir: 'dist',

  android: {
    // El APK de depuración se instala directo en el teléfono.
    allowMixedContent: false,
  },

  plugins: {
    Keyboard: {
      // El contenido se achica para que el teclado no tape los inputs.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
