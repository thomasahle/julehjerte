import {circle,star} from '../../docs/design-start/topology-construction.mjs';
export const topologyCases=[
 {id:'star-circle',name:'One silhouette · circle + four corner rays',options:{shape:'circle'},topology:'1 component, 0 holes',expectGeometry:true},
 {id:'star-diamond',name:'One silhouette · diamond + corner checker',options:{shape:'diamond',style:'corner-checker'},topology:'1 component, 0 holes',expectGeometry:true},
 {id:'star-hexagon',name:'One silhouette · hexagon + four corner rays',options:{shape:'hexagon'},topology:'1 component, 0 holes',expectGeometry:true},
 {id:'star-two-gates',name:'Same silhouette · two diagonal frame connections',options:{recipe:'nested',contours:[star()]},topology:'1 component, 0 holes',expectGeometry:true},
 {id:'annulus',name:'A hole inside a figure',options:{recipe:'nested',contours:[circle(24),circle(12)]},topology:'1 component, 1 hole',expectGeometry:true},
 {id:'nested-island',name:'An island inside a hole',options:{recipe:'nested',contours:[circle(26),circle(17),circle(8)]},topology:'2 components, 1 hole; nested',expectGeometry:true},
 {id:'two-islands',name:'Two separate components',options:{recipe:'islands',contours:[circle(8,[37,37]),circle(8,[63,63])],centers:[[37,37],[63,63]]},topology:'2 components, 0 holes',expectGeometry:true},
 {id:'thin-annulus',name:'Same topology, insufficient clearance',options:{recipe:'nested',contours:[circle(24),circle(23)]},topology:'1 component, 1 hole; 1 mm ring',expectGeometry:false}
];
