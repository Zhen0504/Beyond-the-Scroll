/** Static triangle grid for short dialogue sightlines. Built once; no scene-wide scan per bubble. */
export function createOcclusionGrid(meshes, cellSize=12) {
  const valid=meshes.filter(m=>m.isMesh&&!m.material?.transparent&&!m.material?.alphaTest&&m.geometry?.attributes.position);
  const count=valid.reduce((n,m)=>n+Math.floor((m.geometry.index?.count??m.geometry.attributes.position.count)/3),0);
  const triangles=new Float32Array(count*9),sides=new Uint8Array(count),visited=new Int32Array(count);
  const cells=new Map(),large=[];let cursor=0,epoch=0,checks=0;
  const key=(x,z)=>`${x},${z}`;
  for(const mesh of valid){
    mesh.updateWorldMatrix(true,false);
    const g=mesh.geometry,p=g.attributes.position,indices=g.index,e=mesh.matrixWorld.elements,n=indices?.count??p.count;
    for(let i=0;i<n;i+=3){
      const id=cursor++,base=id*9;
      for(let j=0;j<3;j++){
        const vi=indices?indices.getX(i+j):i+j,x=p.getX(vi),y=p.getY(vi),z=p.getZ(vi),off=base+j*3;
        triangles[off]=e[0]*x+e[4]*y+e[8]*z+e[12];triangles[off+1]=e[1]*x+e[5]*y+e[9]*z+e[13];triangles[off+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
      }
      sides[id]=mesh.material?.side??0;
      const x0=Math.floor(Math.min(triangles[base],triangles[base+3],triangles[base+6])/cellSize),x1=Math.floor(Math.max(triangles[base],triangles[base+3],triangles[base+6])/cellSize);
      const z0=Math.floor(Math.min(triangles[base+2],triangles[base+5],triangles[base+8])/cellSize),z1=Math.floor(Math.max(triangles[base+2],triangles[base+5],triangles[base+8])/cellSize);
      if((x1-x0+1)*(z1-z0+1)>64){large.push(id);continue;}
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        const k=key(x,z);let bucket=cells.get(k);if(!bucket)cells.set(k,bucket=[]);bucket.push(id);
      }
    }
  }
  function blocked(start,end){
    if(++epoch===2147483647){visited.fill(0);epoch=1;}
    checks=0;
    const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,length=Math.hypot(dx,dy,dz);
    if(length<.22)return false;
    const near=.15/length,far=1-.07/length,minY=Math.min(start.y,end.y),maxY=Math.max(start.y,end.y);
    function hit(id){
      if(visited[id]===epoch)return false;visited[id]=epoch;
      const o=id*9,t=triangles,ay=t[o+1],by=t[o+4],cy=t[o+7];
      if(Math.min(ay,by,cy)>maxY||Math.max(ay,by,cy)<minY)return false;
      checks++;
      const ax=t[o],az=t[o+2],e1x=t[o+3]-ax,e1y=by-ay,e1z=t[o+5]-az,e2x=t[o+6]-ax,e2y=cy-ay,e2z=t[o+8]-az;
      const hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x,det=e1x*hx+e1y*hy+e1z*hz;
      if(Math.abs(det)<1e-9||(sides[id]===0&&det<0)||(sides[id]===1&&det>0))return false;
      const inv=1/det,sx=start.x-ax,sy=start.y-ay,sz=start.z-az,u=(sx*hx+sy*hy+sz*hz)*inv;
      if(u<0||u>1)return false;
      const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,v=(dx*qx+dy*qy+dz*qz)*inv;
      if(v<0||u+v>1)return false;
      const distance=(e2x*qx+e2y*qy+e2z*qz)*inv;return distance>near&&distance<far;
    }
    for(const id of large)if(hit(id))return true;
    let x=Math.floor(start.x/cellSize),z=Math.floor(start.z/cellSize);
    const endX=Math.floor(end.x/cellSize),endZ=Math.floor(end.z/cellSize),stepX=Math.sign(dx),stepZ=Math.sign(dz);
    let tx=dx===0?Infinity:((x+(stepX>0?1:0))*cellSize-start.x)/dx,tz=dz===0?Infinity:((z+(stepZ>0?1:0))*cellSize-start.z)/dz;
    const deltaX=dx===0?Infinity:cellSize/Math.abs(dx),deltaZ=dz===0?Infinity:cellSize/Math.abs(dz);
    const limit=Math.abs(endX-x)+Math.abs(endZ-z)+3;
    for(let i=0;i<limit;i++){
      const bucket=cells.get(key(x,z));if(bucket)for(const id of bucket)if(hit(id))return true;
      if(x===endX&&z===endZ)break;
      if(tx<tz){x+=stepX;tx+=deltaX;}else{z+=stepZ;tz+=deltaZ;}
    }
    return false;
  }
  return {blocked,get triangleCount(){return count;},get lastTriangleChecks(){return checks;},dispose(){cells.clear();large.length=0;}};
}
