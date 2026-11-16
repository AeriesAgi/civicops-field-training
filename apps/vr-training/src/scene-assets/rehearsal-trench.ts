import {BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments} from '@iwsdk/core';
/** 2.4×1.2m exclusion outline on the actual floor, never a tabletop. */
export function rehearsalTrench():LineSegments<BufferGeometry,LineBasicMaterial> {
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-.4,.015,-.3,2,.015,-.3,2,.015,-.3,2,.015,-1.5,2,.015,-1.5,-.4,.015,-1.5,-.4,.015,-1.5,-.4,.015,-.3],3));
  const line=new LineSegments(geometry,new LineBasicMaterial({color:'#ffc247',toneMapped:false}));line.name='FullScaleTrenchExclusionOutline';return line;
}
