import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const version=process.argv[2]??pkg.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Use x.y.z without a v prefix.');
for(const file of ['package.json','manifest.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(file,'utf8'));value.version=version;if(file==='package-lock.json')value.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));const versions=fs.existsSync('versions.json')?JSON.parse(fs.readFileSync('versions.json','utf8')):{};versions[version]=manifest.minAppVersion;fs.writeFileSync('versions.json',JSON.stringify(versions,null,2)+'\n');
