import {useEffect} from 'react';
import {Platform} from 'react-native';
/** iOS Web only. Do not resize during user pinch-zoom or force scroll/focus changes. */
export function WebViewport(){
 useEffect(()=>{
  if(Platform.OS!=='web'||typeof window==='undefined')return;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!ios)return;
  const root=document.documentElement,viewport=window.visualViewport;
  const style=document.createElement('style');style.dataset.zetraViewport='ios';
  style.textContent=`#root{height:var(--zetra-visible-height,100%);min-height:0;min-width:0;width:100%;box-sizing:border-box} #root input,#root textarea,[role="dialog"] input,[role="dialog"] textarea{font-size:16px!important} [role="dialog"]{height:var(--zetra-visible-height,100%);min-height:0;bottom:auto} @supports(height:100dvh){#root{height:var(--zetra-visible-height,100dvh)}}`;
  document.head.appendChild(style);
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   if(viewport&&Math.abs(viewport.scale-1)>.01)return;
   const height=viewport?.height??window.innerHeight;
   if(Number.isFinite(height)&&height>0)root.style.setProperty('--zetra-visible-height',`${Math.round(height)}px`);
  })};
  update();viewport?.addEventListener('resize',update);window.addEventListener('resize',update);
  return()=>{cancelAnimationFrame(frame);viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);root.style.removeProperty('--zetra-visible-height');style.remove()};
 },[]);
 return null;
}
