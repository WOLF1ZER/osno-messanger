// Makes the web app behave like a native app on phones:
//  - the page itself never scrolls or bounces (only lists inside it do)
//  - while the on-screen keyboard is open, the app shrinks to the space above it,
//    so the message box stays visible (iOS Safari doesn't resize the page for it)
//
// Normally the app is simply full screen (CSS: 100dvh). We don't use visualViewport.height
// for that, because installed iPhone apps report it ~one status-bar shorter than the screen.

const root = document.documentElement;
let probe = null;

/** Real full-screen height in CSS px (what 100dvh is). */
const fullHeight = () => {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  return probe.getBoundingClientRect().height || window.innerHeight;
};

let baseGap = null; // full height minus visualViewport height while no keyboard is shown

const update = () => {
  const vv = window.visualViewport;
  if (!vv) return;
  const full = fullHeight();
  const gap = full - vv.height;
  if (baseGap === null || gap < baseGap) baseGap = Math.max(0, gap);
  const keyboardOpen = gap - baseGap > 120;
  if (keyboardOpen) root.style.setProperty("--app-height", `${Math.round(vv.height + baseGap)}px`);
  else root.style.removeProperty("--app-height");
  // iOS scrolls the whole page when an input is focused — put it back
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
};

export const initViewport = () => {
  const start = () => {
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", () => {
      baseGap = null; // screen size changed
      setTimeout(update, 300);
    });
  };
  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
};
