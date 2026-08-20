import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

/**
 * Ajustes nativos (sólo dentro del APK; en web son no-ops).
 * Se cargan de forma dinámica para no pesar en el bundle web.
 */
async function setupNative() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');

    // Sin esto la WebView dibuja DEBAJO de la barra de estado y la hora y la
    // batería quedan encima del contenido.
    await StatusBar.setOverlaysWebView({ overlay: false });

    // La app es clara: iconos oscuros sobre el beige de fondo.
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#FBF7EE' });
  } catch {
    /* algunos dispositivos no permiten pintar la barra de estado */
  }

  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    // Reajusta el alto para que el teclado no tape los inputs.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    /* el plugin no está disponible en todas las plataformas */
  }
}

void setupNative();

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el elemento #root.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
