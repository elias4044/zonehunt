import { Browser, sleep } from 'file:///C:/Users/hello/.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const api = async (route,body={},token) => {const r=await fetch('http://127.0.0.1:8090/api/mh/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(route+': '+JSON.stringify(data));return data;};
const host=await api('games',{name:'MotionHost',head_start_s:0,catch_radius_m:0});
const runner=await api('join',{name:'MotionRunner',code:host.game.code});
await api('config',{zone:{type:'circle',lat:56.0465,lng:12.6945,radius:500}},host.token);
await api('role',{role:'chaser'},host.token);await api('role',{role:'runner'},runner.token);await api('ready',{ready:true},runner.token);await api('start',{},host.token);
const browser=await Browser.launch();
try {
 const page=await browser.newPage({width:390,height:844,mobile:true});
 const auth={token:host.token,record:{id:host.player.id,collectionId:'players',collectionName:'players',game:host.game.id}};
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('pocketbase_auth',${JSON.stringify(JSON.stringify(auth))})`});
 await page.goto('http://127.0.0.1:3002');await sleep(2000);
 const click=async(text)=>{const hit=await page.eval((label)=>{const el=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label||e.getAttribute('aria-label')===label);if(el){el.click();return true;}return false;},text);if(!hit)throw Error('Missing control: '+text);await sleep(400);};
 const check=async(name,fn)=>{if(!await page.eval(fn))throw Error(name);console.log('PASS '+name);};
 await click('Open the game menu');await check('menu enters',()=>!!document.querySelector('[aria-label="Game menu"]'));
 await click('Close');await check('menu exits',()=>!document.querySelector('[aria-label="Game menu"]'));
 await click('Enter code');await check('catch sheet enters',()=>!!document.querySelector('[aria-label="Enter catch code"]'));
 await click('Cancel');await check('catch sheet exits',()=>!document.querySelector('[aria-label="Enter catch code"]'));
 await click('Pause the game');await sleep(1000);await check('pause overlay enters',()=>!!document.querySelector('[aria-label="Game paused"]'));
 await click('Resume the game');await sleep(1000);await check('pause overlay exits',()=>!document.querySelector('[aria-label="Game paused"]'));
 await click('Enter code');const state=await api('sync',{},runner.token);for(const digit of state.me.catch_code){await click(digit);}await sleep(1600);await check('catch result and game completion',()=>document.body.textContent.includes('Chasers win'));
 if(page.consoleErrors.length)throw Error(JSON.stringify(page.consoleErrors));console.log('PASS no game browser errors');
} finally {await browser.close();await api('leave',{},host.token).catch(()=>{});await api('leave',{},runner.token).catch(()=>{});}
