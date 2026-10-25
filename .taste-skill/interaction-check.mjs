import { Browser, sleep } from 'file:///C:/Users/hello/.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const browser = await Browser.launch();
try {
 const page = await browser.newPage({width:390,height:844,mobile:true});
 await page.goto('http://127.0.0.1:3002');
 const click = async (selector) => { await page.eval((s) => document.querySelector(s).click(),selector); await sleep(350); };
 const check = (name,value) => {if(!value) throw Error(name); console.log('PASS '+name);};
 await click('.demo-reveal');
 check('demo reveals two runners',await page.eval(() => document.querySelectorAll('.hunt-demo .map-runner').length===2));
 await click('.demo-switch button:last-child');
 check('runner preview switches to compass',await page.eval(() => !!document.querySelector('.hunt-demo .demo-compass')));
 await click('.demo-switch button:first-child');
 check('chaser preview returns to map',await page.eval(() => !!document.querySelector('.hunt-demo .zone-map')));
 await click('.faq-list summary');
 check('FAQ opens',await page.eval(() => document.querySelector('.faq-list details').open));
 await click('.create-button');
 check('empty name validation',await page.eval(() => document.querySelector('[role=alert]')?.textContent.includes('Pick a name')));
 await page.eval(() => { const input = document.querySelector('#name'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'BrowserHost'); input.dispatchEvent(new Event('input',{bubbles:true})); });
 await click('.create-button');
 await sleep(1800);
 check('create game opens lobby',await page.eval(() => document.body.textContent.includes('Before you start')));
 check('no horizontal overflow',await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
 await page.screenshot({path:'.taste-skill/lobby-phone.jpg'});
 console.log('Browser errors:',JSON.stringify(page.consoleErrors));
 await page.eval(async () => {const token=JSON.parse(localStorage.getItem('pocketbase_auth')||'{}').token; if(token) await fetch('http://127.0.0.1:8090/api/mh/leave',{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:'{}'});});
} finally { await browser.close(); }

