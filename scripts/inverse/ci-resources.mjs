// Diagnostic branch only: observe resource use without changing any clock.
import {cpus,availableParallelism} from 'node:os';
const start=process.hrtime.bigint(),usage=process.cpuUsage();
process.once('exit',()=>{
  const cpu=process.cpuUsage(usage),wall=Number(process.hrtime.bigint()-start)/1e9;
  console.log(JSON.stringify({diagnosticResources:{file:process.argv.slice(1),node:process.version,cpuModel:cpus()[0]?.model,parallelism:availableParallelism(),wallSeconds:wall,cpuSeconds:(cpu.user+cpu.system)/1e6,cpuToWallRatio:(cpu.user+cpu.system)/1e6/wall,maxRssKiB:process.resourceUsage().maxRSS}}));
});
