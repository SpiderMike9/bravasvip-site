#!/usr/bin/env node
/* Checks assets/flyers/flyers.json: dates, times, duplicate dates, Tuesday openings, missing flyer files.
   Run: node scripts/validate-events.js   (exit code 1 when something needs fixing) */
'use strict';
const fs=require('fs'),path=require('path');
const S=require('../assets/bravas-schedule.js');
const root=path.join(__dirname,'..');
const file=process.argv[2]||path.join(root,'assets/flyers/flyers.json');
const rel=path.relative(root,file);
const gh=!!process.env.GITHUB_ACTIONS;
let data;
try{data=JSON.parse(fs.readFileSync(file,'utf8'));}
catch(e){
 const msg=rel+' is not valid JSON: '+e.message+'. Check for a missing comma, an extra comma before } or ], or a missing quote.';
 console.error(gh?'::error file='+rel+'::'+msg:'✗ '+msg);process.exit(1);
}
const {errors}=S.validate(data,{assetExists:src=>fs.existsSync(path.join(root,src))});
if(errors.length){
 errors.forEach(m=>console.error(gh?'::error file='+rel+'::'+m:'✗ '+m));
 console.error('\n'+errors.length+' problem(s) in '+rel+'. Fix them in GitHub and commit again.');
 process.exit(1);
}
const n=(data.flyers||[]).length;
console.log('✓ '+rel+' is valid: weekly lineup for all 7 days and '+n+' dated entr'+(n===1?'y':'ies')+'.');
