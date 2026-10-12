import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector2, Vector3, Vector4 } from 'three';

export function ladyViewWeights(angle) {
  const a=Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)));
  const smooth=(lo,hi,v)=>{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);};
  const side=smooth(.64,.82,a),back=smooth(2.31,2.49,a);
  return [1-side,side*(1-back),back];
}

/** Painted multi-view paper figure. The source illustration supplies the detail. */
export function createPaintedLady() {
  const root=new Group(),card=new Group();root.name='宋式仕女 · 绘画纸人';root.visible=false;root.add(card);
  const height=1.84,width=height*566/1018,geometry=new PlaneGeometry(width,height,40,80);
  const uniforms={tAtlas:{value:null},uRect0:{value:new Vector4(0,50/1086,566/1448,1018/1086)},
    uRect1:{value:new Vector4(575/1448,39/1086,410/1448,1025/1086)},uRect2:{value:new Vector4(986/1448,40/1086,462/1448,1026/1086)},
    uWeights:{value:new Vector3(1,0,0)},uMirror:{value:0},uWidth:{value:1},uTime:{value:0},uWalk:{value:0},uRelief:{value:.004},uLayers:{value:1}};
  const vertexShader=`
    uniform float uWidth,uTime,uWalk,uRelief,uLayers;
    varying vec2 vUv;
    void main(){
      vUv=uv;vec3 p=position;p.x*=uWidth;
      float phase=uTime*6.28318530718/1.28;
      float lower=(1.-smoothstep(.42,.69,uv.y))*smoothstep(.025,.14,uv.y);
      float edge=smoothstep(.12,.45,abs(uv.x-.5));
      p.x+=sin(phase-.45+uv.x*.6)*.009*lower*uWalk*uLayers;
      p.y+=(1.-cos(phase*2.))*.0025*smoothstep(.10,.75,uv.y)*uWalk;
      p.x+=sin(phase)*.003*smoothstep(.25,.7,uv.y)*uWalk;
      p.z+=sin(uv.x*3.14159265)*sin(uv.y*3.14159265)*uRelief;
      p.z+=sin(phase-.65+uv.x)*.012*lower*edge*uWalk*uLayers;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`;
  const material=new ShaderMaterial({uniforms,vertexShader,fragmentShader:`
    uniform sampler2D tAtlas;uniform vec4 uRect0,uRect1,uRect2;uniform vec3 uWeights;uniform float uMirror;
    varying vec2 vUv;
    vec4 sampleCell(vec4 cell,vec2 uv){vec4 c=texture2D(tAtlas,cell.xy+uv*cell.zw);return vec4(c.rgb*c.a,c.a);}
    void main(){
      vec2 sideUv=vec2(mix(vUv.x,1.-vUv.x,uMirror),vUv.y);
      vec4 c=sampleCell(uRect0,vUv)*uWeights.x+sampleCell(uRect1,sideUv)*uWeights.y+sampleCell(uRect2,vUv)*uWeights.z;
      if(c.a<.35)discard;
      gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a);
      #include <colorspace_fragment>
    }`,side:DoubleSide,transparent:true,depthWrite:false,toneMapped:false});
  const image=new Mesh(geometry,material);image.position.y=height/2+.001;image.frustumCulled=false;card.add(image);
  const shadowGeometry=new PlaneGeometry(.8,.45);
  const shadowMaterial=new ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;void main(){float r=length((vUv-.5)*2.);if(r>1.)discard;gl_FragColor=vec4(.33,.29,.21,.15*pow(1.-r,2.));}`});
  const shadow=new Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.0015;root.add(shadow);
  let disposed=false,texture=null,depth=1;
  const ready=new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}characters/song-lady/views-v1.png`).then(loaded=>{
    if(disposed){loaded.dispose();return;}
    texture=loaded;texture.colorSpace=SRGBColorSpace;texture.anisotropy=8;uniforms.tAtlas.value=texture;root.visible=true;
  });
  return {root,ready,legs:[],get depth(){return depth;},setPaperDepth(value){depth=value;uniforms.uRelief.value=.004*value;},
    setLayers(value){uniforms.uLayers.value=value;},update(time,blend){uniforms.uTime.value=time;uniforms.uWalk.value=blend;},
    updateView(camera){
      const yaw=Math.atan2(camera.position.x-root.position.x,camera.position.z-root.position.z),relative=yaw-root.rotation.y;
      card.rotation.y=relative;
      const weights=ladyViewWeights(relative);uniforms.uWeights.value.set(...weights);uniforms.uMirror.value=Math.sin(relative)<0?1:0;
      uniforms.uWidth.value=weights[0]+weights[1]*(410/1025)/(566/1018)+weights[2]*(462/1026)/(566/1018);
    },dispose(){disposed=true;texture?.dispose();geometry.dispose();material.dispose();shadowGeometry.dispose();shadowMaterial.dispose();}};
}

