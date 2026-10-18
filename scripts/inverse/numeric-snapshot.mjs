/** Test snapshots of geometry, not floating-point implementation details.
 * Eight decimal places resolve 1e-8 mm in a 100 mm design, far below the
 * geometry validator's tolerance. Raster targets and topology stay exact.
 */
export function numericSnapshot(value,decimalPlaces=8){
  return JSON.stringify(value,(_,v)=>{
    if(typeof v!=='number')return v;
    if(!Number.isFinite(v))throw new Error('A numeric snapshot requires finite numbers.');
    return Number(v.toFixed(decimalPlaces));
  });
}
