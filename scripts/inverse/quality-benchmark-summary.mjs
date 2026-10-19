import fs from 'node:fs/promises';

const file=process.argv[2],tap=await fs.readFile(file,'utf8');
const results=tap.split('\n').filter(line=>/^(?:not )?ok \d+ - benchmark: /.test(line));
const failures=results.filter(line=>line.startsWith('not ok'));
const failedBlocks=tap.split(/(?=^(?:not )?ok \d+ - )/m).filter(block=>block.startsWith('not ok '));
const unexpected=failedBlocks.filter(block=>!/^not ok \d+ - benchmark: /.test(block)||
  !/^ {2}code: ['"]?ERR_ASSERTION['"]?\r?$/m.test(block)).map(block=>block.split('\n')[0]);
const completed=/^# duration_ms /m.test(tap);
// Only existing quality assertions are advisory. Missing fixtures, runtime
// exceptions, timeouts and crashed/import-failed test processes remain hard
// failures, including when Node catches them inside a benchmark callback.
const valid=completed&&results.length>0&&unexpected.length===0;
const outcome=process.env.BENCHMARK_OUTCOME;
const status=valid?`${results.length-failures.length}/${results.length} passed; ${failures.length} missed their original targets.`:'Benchmark did not complete normally.';
const lines=['## Timed inverse quality (advisory)','',status,'',
  'These fresh searches keep their original budgets, masks and assertions. Results depend on runner speed. They are tracked separately from the blocking geometry, paper, export and functional tests.',
  '',...failures.map(line=>`- ${line.replace(/^not ok \d+ - benchmark: /,'')}`),
  '',`Full TAP output and available failed-fit captures: artifact \`inverse-timed-quality\`.`,
  ...(unexpected.length?['','Unexpected test-process failures:',...unexpected.map(line=>`- ${line}`)]:[])];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
if(failures.length)console.log(`::warning::Timed inverse quality: ${status}`);
if(!valid||(outcome==='failure'&&failures.length===0))process.exitCode=1;
