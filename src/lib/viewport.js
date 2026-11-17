// Makes the web app behave like a native app on phones:
//  - the app fills the real screen and the page never scrolls or bounces (only lists inside it do)
//  - while the on-screen keyboard is open, the app shrinks to the space above it,
//    so the message box stays visible (iOS Safari doesn't resize the page for it)
//
// iOS quirk: an installed (Home Screen) app with a see-through status bar reports a viewport that is
// one status bar shorter than the screen, so `100dvh` / innerHeight end ~47pt above the bottom.
// There we use the real screen height instead.

const root = document.documentElement;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

let probe = null;
const cssHeight = (unit) => {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  probe.style.height = unit;
  return probe.getBoundingClientRect().height;
};

/** Height of the whole screen area the app may use. */
const screenHeight = () => {
  if (isIOS() && isStandalone()) {
    const portrait = window.matchMedia?.("(orientation: portrait)").matches ?? true;
    const s = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    return Math.max(s, cssHeight("100lvh"), window.innerHeight);
  }
  return cssHeight("100dvh") || window.innerHeight;
};

let baseGap = null; // screen height minus visualViewport height while no keyboard is shown

const update = () => {
  const full = Math.round(screenHeight());
  root.style.setProperty("--screen-height", `${full}px`);

  const vv = window.visualViewport;
  let appHeight = full;
  if (vv) {
    const gap = full - vv.height;
    if (baseGap === null || gap < baseGap) baseGap = Math.max(0, gap);
    const keyboard = gap - baseGap > 120;
    if (keyboard) appHeight = Math.round(vv.height + baseGap);
    root.style.setProperty("--keyboard", keyboard ? `${Math.round(gap - baseGap)}px` : "0px");
  }
  root.style.setProperty("--app-height", `${appHeight}px`);

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
