// Diagnostic only: compare quality with equal wall time and extra work.
// Never loaded by the application or the release test command.
const rate=Number(process.env.INVERSE_DIAGNOSTIC_CLOCK_RATE||1);
if(![1,.5].includes(rate))throw new Error('Expected diagnostic clock rate 1 or 0.5');
if(rate!==1){
  const realNow=performance.now.bind(performance),base=realNow();
  Object.defineProperty(performance,'now',{configurable:true,writable:true,value:()=>base+(realNow()-base)*rate});
  console.info('DIAGNOSTIC CLOCK: half rate; nominal fitting budgets allow twice the actual wall time. This is not a speed benchmark.');
}
