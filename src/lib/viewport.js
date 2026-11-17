// Makes the web app behave like a native app on phones:
//  - the page itself never scrolls or bounces (only lists inside it do)
//  - the layout height follows the *visible* area, so the on-screen keyboard
//    doesn't push the chat off screen (iOS Safari doesn't resize the page for it)

const setHeight = () => {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(h)}px`);
  // iOS scrolls the whole page when an input is focused — put it back
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
};

export const initViewport = () => {
  setHeight();
  window.visualViewport?.addEventListener("resize", setHeight);
  window.visualViewport?.addEventListener("scroll", setHeight);
  window.addEventListener("resize", setHeight);
  window.addEventListener("orientationchange", () => setTimeout(setHeight, 300));
};
