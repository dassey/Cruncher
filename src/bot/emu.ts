import { XRDevice, metaQuest3 } from 'iwer';

/**
 * Installs IWER (Meta's WebXR emulator) as navigator.xr so the game runs as an
 * emulated Quest 3 on desktop browsers and in headless Playwright.
 * Loaded only with ?emu or ?bot (code-split; never shipped to normal players).
 */
export function installEmulator(): XRDevice {
  const device = new XRDevice(metaQuest3);
  // Chromium ships a native navigator.xr; force IWER to replace it.
  device.installRuntime({ forceInstall: true });
  device.stereoEnabled = false;
  (window as unknown as { __IWER__: XRDevice }).__IWER__ = device;
  return device;
}
