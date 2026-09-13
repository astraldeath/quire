export interface ViewportBox {top:number;left:number;width:number;height:number}
export function dialogPosition(viewport:ViewportBox,panelHeight:number,insets:{top:number;bottom:number},anchor?:number){
 const minimum=insets.top+12;
 const bottom=insets.bottom+12;
 const available=Math.max(0,viewport.height-minimum-bottom);
 const top=anchor===undefined?minimum+Math.max(0,(available-Math.min(panelHeight,available))/2):Math.max(minimum,Math.min(anchor,viewport.height-bottom-120));
 return {top:viewport.top+top,left:viewport.left+viewport.width/2,maxHeight:Math.max(0,viewport.height-top-bottom),anchor:top};
}
export function safeInsets(){
 const probe=document.createElement('div');
 probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
 document.body.append(probe);const css=getComputedStyle(probe);
 const insets={top:parseFloat(css.paddingTop)||0,bottom:parseFloat(css.paddingBottom)||0};probe.remove();return insets;
}
export function visualBox():ViewportBox{
 const vv=window.visualViewport;
 return {top:vv?.offsetTop??0,left:vv?.offsetLeft??0,width:vv?.width??window.innerWidth,height:vv?.height??window.innerHeight};
}
