/**
 * Runs before the page paints (inlined in <head>) so a saved theme or text
 * size never flashes the default first.
 */
export const PREFS_BOOT = `try{var d=document.documentElement,t=localStorage.getItem("lk-theme"),s=localStorage.getItem("lk-text");if(t==="night"||t==="paper")d.dataset.theme=t;var k=[1,1.18,1.35][+s]||1;d.style.setProperty("--text-scale",k)}catch(e){}`;
