import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Expand test names here so Windows does not rely on shell glob expansion.
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
