import { useLayoutEffect } from "react";

export function useSurfaceMotion(pathname) {
  useLayoutEffect(() => {
    const media = matchMedia("(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)");
    let card, pointer, frame=0, measure=0;
    function paint() {
      frame=0;
      if (!card || !pointer) return;
      const r=card.getBoundingClientRect();
      card.style.setProperty("--light-x",pointer.clientX-r.left+"px");
      card.style.setProperty("--light-y",pointer.clientY-r.top+"px");
    }
    function clear() {card?.removeAttribute("data-lit"); card=null;}
    function move(e) {
      const next=media.matches && e.target.closest?.(".panel,.app-card,.plan,.pack,.card");
      if(next!==card) {clear(); if(next) {card=next; card.dataset.lit="";}}
      pointer=e;
      if(card && !frame) frame=requestAnimationFrame(paint);
    }
    function indicators() {
      measure=0;
      for (const rail of document.querySelectorAll(".rail,.tabs")) {
        const current=rail.querySelector('[aria-current="page"],button.on');
        rail.toggleAttribute("data-selected",!!current);
        if(!current) continue;
        const previousX = rail.style.getPropertyValue("--indicator-x");
        if (previousX && previousX !== current.offsetLeft+"px" && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
          try {
            rail.animate([{scale:"1 1"},{scale:"1.11 .94",offset:.4},{scale:".985 1.01",offset:.78},{scale:"1 1"}],
              {duration:380,easing:"ease-out",pseudoElement:"::before"});
          } catch { /* The position transition remains available on older engines. */ }
        }
        rail.style.setProperty("--indicator-x",current.offsetLeft+"px");
        rail.style.setProperty("--indicator-y",current.offsetTop+"px");
        rail.style.setProperty("--indicator-w",current.offsetWidth+"px");
        rail.style.setProperty("--indicator-h",current.offsetHeight+"px");
      }
    }
    function schedule() {if(!measure) measure=requestAnimationFrame(indicators);}
    const observer=new MutationObserver(schedule);
    observer.observe(document.getElementById("root"),{childList:true,subtree:true,attributes:true,attributeFilter:["class","aria-current"]});
    const resize=new ResizeObserver(schedule);
    resize.observe(document.body);
    function scrolled() {document.documentElement.toggleAttribute("data-scrolled",scrollY>12); clear();}
    indicators(); scrolled();
    document.addEventListener("pointermove",move,{passive:true});
    document.addEventListener("pointerleave",clear);
    window.addEventListener("scroll",scrolled,{passive:true});
    window.addEventListener("resize",schedule);
    return () => {clear();cancelAnimationFrame(frame);cancelAnimationFrame(measure);observer.disconnect();resize.disconnect();document.removeEventListener("pointermove",move);document.removeEventListener("pointerleave",clear);window.removeEventListener("resize",schedule);window.removeEventListener("scroll",scrolled);};
  },[pathname]);
}
