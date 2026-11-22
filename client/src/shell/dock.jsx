import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";

const destinations = [
  ["/","首页","M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z"],
  ["/store","AI 超市","M3 9l2-6h14l2 6v3H3z M5 12v9h14v-9 M9 21v-6h6v6"],
  ["/membership","会员中心","M3 5h18v14H3z M7 9h4 M7 14h8"],
  ["/recharge","充值中心","M3 6h17v14H3z M3 6l13-4v4 M15 11h6v5h-6z"],
];

export function Dock({commercial=true}) {
  const dock = useRef(null);
  useEffect(() => {
    const nav = dock.current, links = [...nav.querySelectorAll("a")];
    const fine = matchMedia("(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)");
    const values = links.map(() => ({value:0, velocity:0, target:0}));
    let frame = 0, last = 0;
    function update(time) {
      const dt = Math.min((time-last)/1000 || 1/60,1/30);
      last = time;
      let moving = false;
      for (const s of values) {
        s.velocity += ((s.target-s.value)*330 - s.velocity*31)*dt;
        s.value += s.velocity*dt;
        if (Math.abs(s.target-s.value)+Math.abs(s.velocity) < .001) {s.value=s.target; s.velocity=0;}
        else moving=true;
      }
      let offset = -values.reduce((sum,s) => sum+s.value*5,0);
      values.forEach((s,i) => {
        links[i].style.setProperty("--spread",(offset+s.value*5)+"px");
        links[i].style.setProperty("--lift",(-s.value*4)+"px");
        links[i].style.setProperty("--zoom",1+s.value*.27);
        offset += s.value*10;
      });
      frame=moving ? requestAnimationFrame(update) : 0;
    }
    function aim(x) {
      const left = nav.getBoundingClientRect().left;
      links.forEach((link,i) => {
        const distance = x-left-link.offsetLeft-link.offsetWidth/2;
        values[i].target = Number.isFinite(x) && fine.matches ? Math.exp(-distance*distance/2600) : 0;
      });
      if (!frame) {last=performance.now(); frame=requestAnimationFrame(update);}
    }
    const move=e=>aim(e.clientX), leave=()=>aim(Infinity);
    nav.addEventListener("pointermove",move);
    nav.addEventListener("pointerleave",leave);
    fine.addEventListener("change",leave);
    return () => {cancelAnimationFrame(frame); nav.removeEventListener("pointermove",move); nav.removeEventListener("pointerleave",leave); fine.removeEventListener("change",leave);};
  },[commercial]);
  return <nav ref={dock} className="dock rail" aria-label="平台导航">
    {destinations.filter(([to])=>commercial || ["/","/store"].includes(to)).map(([to,label,path]) => <NavLink end={to==="/"} key={to} to={to} aria-label={label}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d={path}/></svg>
      <span className="dock-caption">{label}</span><span className="dock-tip" aria-hidden="true">{label}</span>
    </NavLink>)}
  </nav>;
}
