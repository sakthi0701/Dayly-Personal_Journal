'use client';

/**
 * Copies all styles from the main document into a target window (like a PiP window)
 * so that Tailwind classes and custom fonts render correctly.
 */
export function copyStylesToWindow(target: Window) {
  // 1. Copy all <link rel="stylesheet"> tags (covers Google Fonts + prod CSS)
  document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
    target.document.head.appendChild(el.cloneNode(true));
  });

  // 2. Copy all <style> tags (covers Next.js dev-mode injected styles)
  [...document.styleSheets].forEach((sheet) => {
    try {
      const cssText = [...sheet.cssRules].map((r) => r.cssText).join('');
      const style = target.document.createElement('style');
      style.textContent = cssText;
      target.document.head.appendChild(style);
    } catch {
      // Cross-origin sheet — usually handled by the link copy above
    }
  });

  // 3. Baseline body reset
  target.document.body.style.cssText = 'margin:0;padding:0;background:#09090b;overflow:hidden;height:100vh;';
  target.document.documentElement.style.cssText = 'height:100%;';
}
