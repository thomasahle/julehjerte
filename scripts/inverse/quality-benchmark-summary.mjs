import fs from 'node:fs/promises';

const file=process.argv[2],tap=await fs.readFile(file,'utf8');
const results=tap.split('\n').filter(line=>/^(?:not )?ok \d+ - benchmark: /.test(line));
const failures=results.filter(line=>line.startsWith('not ok'));
const unexpected=tap.split('\n').filter(line=>/^not ok /.test(line)&&!line.includes(' - benchmark: '));
const completed=/^# duration_ms /m.test(tap);
// A missing suite, import error or crashed test process is an infrastructure
// failure, not an advisory quality result. Never silently bless an empty run.
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
