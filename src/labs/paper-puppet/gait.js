export const GAIT={cycle:1.28,stance:.62,stride:.38};
export const phaseAt=time=>((time/GAIT.cycle)%1+1)%1;
export function travelAt(time){
  const radius=1.15,velocity=GAIT.stride/(GAIT.cycle*GAIT.stance),angle=time*velocity/radius;
  return {x:radius*Math.sin(angle),z:radius*(Math.cos(angle)-1),heading:Math.PI/2+angle,velocity};
}
