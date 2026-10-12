import { BufferAttribute } from 'three';
import { createNoise } from '../../../engine/noise.js';
import { STRUCTURES } from './layout.js';

const noise = createNoise(719);
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
function roadAt(x, axis) {
  const points=STRUCTURES.plankRoad;
  for (let i=0;i<points.length-1;i++) {
    if (x<=points[i+1][0]) {
      const t=Math.max(0,Math.min(1,(x-points[i][0])/(points[i+1][0]-points[i][0])));
      return points[i][axis]*(1-t)+points[i+1][axis]*t;
    }
  }
  return points.at(-1)[axis];
}

/** Local outward relief; deck clearance, terrace top and all other terrain stay fixed. */
export function cliffReliefAmount(x,y,z,nx,ny,nz) {
  const side=smooth(0.45,0.88,Math.hypot(nx,nz)) * smooth(0.08,0.4,nz);
  if (!side) return 0;
  const depth=roadAt(x,1)-1.15-z;
  const roadMask=smooth(34,40,x)*(1-smooth(90,96,x))
    *smooth(0.2,1.8,depth)*(1-smooth(15,22,depth))
    *smooth(roadAt(x,2)+1.8,roadAt(x,2)+5,y)*(1-smooth(40,51,y));
  const t=STRUCTURES.terrace, front=t.cz+t.hz;
  const terraceMask=smooth(t.cx-t.hx-3,t.cx-t.hx+1,x)*(1-smooth(t.cx+t.hx-1,t.cx+t.hx+4,x))
    *smooth(front-1,front+0.5,z)*(1-smooth(front+3.2,front+5,z))
    *smooth(1.2,3,y)*(1-smooth(t.y-2.5,t.y-0.6,y));
  if (roadMask===0 && terraceMask===0) return 0;
  // Irregular vertical rock ribs with broad rounded shoulders, not repeated ripples.
  const broad=noise.noise2(x*0.14+y*0.025,y*0.13+11)*0.5+0.5;
  const ribs=1-Math.abs(noise.noise2(x*0.38+noise.noise2(y*0.12,7)*0.4,y*0.17+3));
  const detail=noise.noise2(x*0.72,y*0.43)*0.5+0.5;
  const shape=0.18+0.4*ribs*ribs+0.28*broad+0.14*detail;
  return side*shape*Math.max(roadMask*0.78,terraceMask*0.44);
}

/** Subdivide only the requested patch, then displace its steep faces horizontally. */
export function applyCliffRelief(geometry) {
  const originalPosition=geometry.attributes.position, originalNormal=geometry.attributes.normal;
  const positions=Array.from(originalPosition.array), normals=Array.from(originalNormal.array);
  const indices=[], edges=new Map();
  function midpoint(a,b) {
    const key=a<b ? `${a}:${b}` : `${b}:${a}`;
    if(edges.has(key)) return edges.get(key);
    const index=positions.length/3;
    for(let k=0;k<3;k++) positions.push((positions[a*3+k]+positions[b*3+k])/2);
    const nx=normals[a*3]+normals[b*3],ny=normals[a*3+1]+normals[b*3+1],nz=normals[a*3+2]+normals[b*3+2];
    const length=Math.hypot(nx,ny,nz)||1;
    normals.push(nx/length,ny/length,nz/length);edges.set(key,index);return index;
  }
  function subdivide(a,b,c,depth) {
    if(!depth) {indices.push(a,b,c);return;}
    const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    subdivide(a,ab,ca,depth-1);subdivide(ab,b,bc,depth-1);
    subdivide(ca,bc,c,depth-1);subdivide(ab,bc,ca,depth-1);
  }
  const source=geometry.index.array;
  for(let i=0;i<source.length;i+=3) {
    const triangle=[source[i],source[i+1],source[i+2]];
    const patch=triangle.every(v=>positions[v*3]>=31 && positions[v*3]<=129 && positions[v*3+2]>=-86 && positions[v*3+2]<=-49);
    if(patch) subdivide(...triangle,2);else indices.push(...triangle);
  }
  const displaced=new Uint8Array(positions.length/3);
  let changed=0,maximum=0;
  for(let v=0;v<displaced.length;v++) {
    const i=v*3,amount=cliffReliefAmount(positions[i],positions[i+1],positions[i+2],normals[i],normals[i+1],normals[i+2]);
    if(amount<=0) continue;
    const horizontal=Math.hypot(normals[i],normals[i+2]);
    positions[i]+=normals[i]/horizontal*amount;
    positions[i+2]+=normals[i+2]/horizontal*amount;
    displaced[v]=1;changed++;maximum=Math.max(maximum,amount);
  }
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
  geometry.setIndex(indices);geometry.deleteAttribute('normal');geometry.computeVertexNormals();
  // Preserve the existing lighting exactly on untouched surfaces and the protected deck/top.
  const updated=geometry.attributes.normal;
  for(let v=0;v<displaced.length;v++) if(!displaced[v]) updated.setXYZ(v,normals[v*3],normals[v*3+1],normals[v*3+2]);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return { changed, maximum };
}

