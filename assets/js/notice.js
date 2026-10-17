// Privacy banner (index.html). Fixed at the bottom of the viewport, slides up
// shortly after load, and never blocks the page behind it. The site keeps no
// storage, so it appears on every visit. "Got it" slides it back down, removes
// it, and then loads the model list.

export function initNotice(onAccept) {
  const notice = document.getElementById("notice");
  const acceptBtn = document.getElementById("notice-accept");
  if (!notice || !acceptBtn) return;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    notice.remove();
    if (typeof onAccept === "function") onAccept();
  };

  acceptBtn.addEventListener("click", () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    notice.classList.add("leaving");
    notice.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 600); // safety net if transitionend never fires
  });
}
