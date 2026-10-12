import { AmbientLight, CircleGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer, NeutralToneMapping } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPaintedLady } from './PaintedLady.js';
import { travelAt } from './gait.js';
import { paintedPaper } from './paperTextures.js';

export class PaperStage {
  constructor(canvas,settings) {
    this.canvas=canvas;this.settings={...settings};this.time=0;this.blend=0;this.travelStart=0;this.disposed=false;
    this.scene=new Scene();this.scene.background=new Color('#eee5d3');
    this.renderer=new WebGLRenderer({canvas,antialias:true,alpha:false});
    this.renderer.outputColorSpace=SRGBColorSpace;this.renderer.toneMapping=NeutralToneMapping;this.renderer.toneMappingExposure=1;this.renderer.localClippingEnabled=true;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=PCFShadowMap;
    this.camera=new PerspectiveCamera(34,1,.05,40);this.camera.position.set(2.4,1.65,4.2);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,.92,0);
    this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.enablePan=false;
    this.controls.minDistance=1.35;this.controls.maxDistance=7;this.controls.maxPolarAngle=Math.PI*.49;
    this.controls.autoRotateSpeed=.65;
    this.scene.add(new AmbientLight('#fff4dc',1.7));
    const key=new DirectionalLight('#fff0d7',3.1);key.position.set(-3,6,5);key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3.8,right:3.8,top:3.8,bottom:-3.8,near:.2,far:15});
    key.shadow.bias=-.00012;key.shadow.normalBias=.006;key.shadow.radius=3;this.scene.add(key);
    const fill=new DirectionalLight('#d1e0d8',1.3);fill.position.set(4,3,-4);this.scene.add(fill);
    this.groundTexture=paintedPaper('#e5dbc6','ground');
    this.groundMaterial=new MeshStandardMaterial({map:this.groundTexture,roughness:1});
    this.groundGeometry=new CircleGeometry(3.4,96);this.groundGeometry.rotateX(-Math.PI/2);
    this.ground=new Mesh(this.groundGeometry,this.groundMaterial);this.ground.position.set(0,-.001,-.65);this.ground.receiveShadow=true;this.scene.add(this.ground);
    this.model=createPaintedLady();this.scene.add(this.model.root);
    this.setSettings(settings);
    this.resize=()=>{
      const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;
      this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
    };
    this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);this.resize();
    this.last=performance.now();
    this.visibility=()=>{this.last=performance.now();};document.addEventListener('visibilitychange',this.visibility);
    this.raf=requestAnimationFrame(this.frame);
  }
  setSettings(patch) {
    const previous=this.settings.travel;Object.assign(this.settings,patch);
    if(previous!==this.settings.travel){this.travelStart=this.time;this.model.legs.forEach(l=>{l.anchor=null;l.planted=false;});this.controls.target.z=this.settings.travel?-1.15:0;}
    this.model.setPaperDepth(this.settings.depth);this.model.setLayers(this.settings.layers);
    this.controls.autoRotate=this.settings.turntable;
  }
  view(name) {
    const z=this.settings.travel?-1.15:0;
    this.controls.target.set(0,name==='detail'?1.48:.92,z);
    const points={front:[0,1.3,z+4.1],side:[4.1,1.3,z],back:[0,1.3,z-4.1],detail:[.28,1.57,z+1.38]};
    this.camera.position.set(...points[name]);this.controls.update();
  }
  frame=now=>{
    if(this.disposed)return;
    const dt=document.hidden?0:Math.min(.04,(now-this.last)/1000);this.last=now;
    if(!this.settings.paused){
      const target=this.settings.action==='walk'?1:0;this.blend+=(target-this.blend)*(1-Math.exp(-dt*6));
      if(this.settings.action==='walk')this.time+=dt*this.settings.speed;
    }
    if(this.settings.travel){
      if(this.settings.action==='walk'&&!this.settings.paused){
        const elapsed=Math.max(0,this.time-this.travelStart),pose=travelAt(Math.max(0,elapsed-.6));
        const u=Math.min(1,elapsed/.6),turn=u*u*(3-2*u);
        this.model.root.position.set(pose.x,0,pose.z);this.model.root.rotation.y=elapsed<.6?Math.PI/2*turn:pose.heading;
      }
    } else {this.model.root.position.set(0,0,0);this.model.root.rotation.y=0;}
    this.model.update(this.time,this.blend,this.settings.travel&&this.settings.action==='walk');
    this.controls.update();this.model.updateView?.(this.camera);this.renderer.render(this.scene,this.camera);
    this.raf=requestAnimationFrame(this.frame);
  };
  dispose() {
    if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);
    this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.controls.dispose();
    this.model.dispose();this.groundTexture.dispose();this.groundMaterial.dispose();this.groundGeometry.dispose();
    this.scene.traverse(o=>o.isLight&&o.shadow?.dispose());this.renderer.dispose();
  }
}




