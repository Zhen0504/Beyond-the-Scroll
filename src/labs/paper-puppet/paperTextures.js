import { CanvasTexture, SRGBColorSpace } from 'three';
import { mulberry32 } from '../../utils/math.js';
export function paintedPaper(color){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;
  const c=canvas.getContext('2d'),rng=mulberry32(161);
  c.fillStyle=color;c.fillRect(0,0,512,1024);
  for(let i=0;i<18000;i++){c.fillStyle=i%2?'rgba(69,50,35,.035)':'rgba(255,255,242,.085)';c.fillRect(rng()*512,rng()*1024,1+rng()*1.3,1+rng()*1.3);}
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
