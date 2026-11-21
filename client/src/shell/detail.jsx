import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

export const DetailSource = createContext(null);

export function DetailLink({to, children, ...props}) {
  const source = useContext(DetailSource);
  const location = useLocation();
  return <Link {...props} to={to} state={{background:location, detail:to}} onClick={event => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      source.current = {element:event.currentTarget, backgroundKey:location.key};
    }
  }}>{children}</Link>;
}

export function DetailDialog({source, onDismiss, children, label}) {
  const ref = useRef(null);
  const close = useRef(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previous = document.documentElement.style.overflow;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    let animation, closing = false;
    function collapsed() {
      const box = dialog.getBoundingClientRect();
      const card = source.getBoundingClientRect();
      if (!source.isConnected || !card.width || !box.width) return {opacity:0};
      return {
        transform:`translate(${card.left-box.left}px,${card.top-box.top}px) scale(${card.width/box.width},${card.height/box.height})`,
        borderRadius:getComputedStyle(source).borderRadius, backgroundColor:getComputedStyle(source).backgroundColor,
        boxShadow:getComputedStyle(source).boxShadow,
      };
    }
    const expanded = {transform:"none",borderRadius:getComputedStyle(dialog).borderRadius,boxShadow:getComputedStyle(dialog).boxShadow,backgroundColor:getComputedStyle(dialog).backgroundColor};
    if (!reduced.matches) animation = dialog.animate([collapsed(),expanded],{duration:440,easing:"cubic-bezier(.19,.86,.26,1)"});
    close.current = () => {
      if (closing) return;
      closing = true;
      const visible = getComputedStyle(dialog).transform;
      animation?.cancel();
      dialog.dataset.closing = "";
      if (reduced.matches) return dismiss.current();
      animation = dialog.animate([{...expanded,transform:visible},collapsed()],{duration:310,easing:"cubic-bezier(.4,0,.26,1)",fill:"forwards"});
      animation.onfinish = () => dismiss.current();
    };
    return () => {
      animation?.cancel();
      delete dialog.dataset.closing;
      dialog.close();
      document.documentElement.style.overflow = previous;
      if (source.isConnected) source.focus({preventScroll:true});
    };
  },[source]);
  return <dialog className="detail-dialog" ref={ref} aria-label={label} onCancel={e => {e.preventDefault(); close.current();}}
    onClick={e => {if(e.target === ref.current) {
      const r=ref.current.getBoundingClientRect();
      if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) close.current();
    }}}>
    <div className="detail-scroll"><button className="detail-dismiss" onClick={() => close.current()} aria-label="关闭详情">×</button>{children}</div>
  </dialog>;
}
