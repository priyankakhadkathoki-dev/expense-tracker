// Drives the real app page in a headless browser with the Supabase library swapped for the fake.
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{
  const browser=await chromium.launch({executablePath:fs.existsSync('/opt/pw-browsers/chromium')&&fs.statSync('/opt/pw-browsers/chromium').isFile()?'/opt/pw-browsers/chromium':undefined});
  const ctx=await browser.newContext({viewport:{width:390,height:800}});
  const page=await ctx.newPage();const errors=[];let pass=0,fail=0;
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{const t=m.text();if(m.type()==='error'&&!/ERR_FAILED|Invalid login credentials/.test(t))errors.push('console: '+t)}); // blocked fonts and the deliberate wrong login are expected
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8')});
    if(u.startsWith('file:'))return r.continue();
    return r.abort()});
  const ok=(c,label)=>{if(c){pass++;console.log('ok   '+label)}else{fail++;console.log('FAIL '+label)}};
  const text=()=>page.locator('#view').innerText();
  const url='file://'+path.join(__dirname,'..','index.html');
  const settle=()=>page.waitForTimeout(250);

  await page.goto(url);await settle();
  ok((await text()).includes('Log in'),'opens on the login page when signed out');

  // wrong login
  await page.fill('#au-email','nobody@example.com');await page.fill('#au-pass','secret12');await page.click('form[data-form=auth] button');await settle();
  ok((await text()).includes('Wrong email or password.'),'wrong login shows a clear message');

  // sign up with email confirmation required
  await page.evaluate(()=>{window.FAKE_CONFIRM_EMAIL=true});
  await page.click('[data-act=authmode][data-v=signup]');
  await page.fill('#au-name','Meera Shah');await page.fill('#au-email','confirm@example.com');await page.fill('#au-pass','secret12');await page.click('form[data-form=auth] button');await settle();
  ok((await text()).includes('Open the confirmation link'),'sign-up tells the owner to confirm their email');
  await page.evaluate(()=>{window.FAKE_CONFIRM_EMAIL=false});

  // sign up, session returned
  await page.click('[data-act=authmode][data-v=signup]');
  await page.fill('#au-name','Ravi Kumar');await page.fill('#au-email','ravi@example.com');await page.fill('#au-pass','secret12');await page.click('form[data-form=auth] button');await settle();
  ok((await text()).includes('Set up your shop'),'new account lands on shop setup');
  await page.fill('#sh-name','Ravi Kirana');await page.fill('#sh-goal','50000');await page.click('form[data-form=setup] button');await settle();
  ok((await text()).includes('Hello, Ravi')&&(await text()).includes('Ravi Kirana'),'setup opens the dashboard');
  ok((await text()).includes('Monthly sales'),'setup goal appears on the dashboard');

  // record the day
  await page.click('a.rec');await settle();
  ok(await page.locator('.entry.income .chip').count()===4&&await page.locator('.entry.expense .chip').count()===8,'starter categories load from the database');
  await page.fill('#amt-income','1200');await page.fill('#amt-expense','300');await page.fill('#rec-note','Morning rush');await page.click('form[data-form=record] button.big');await settle();
  ok((await page.locator('.today .net').innerText()).includes('900'),'saving a day shows net 900 on the dashboard');

  // persistence across reload
  await page.reload();await settle();
  ok((await text()).includes('Hello, Ravi')&&(await page.locator('.today .net').innerText()).includes('900'),'still signed in with saved data after reload');

  // income page: add, undo, edit, delete
  await page.click('.tabs a[data-go=income]');await settle();
  await page.fill('#amt-income','500');await page.click('form[data-form=income] button.primary');await settle();
  ok((await text()).includes('1,700'),'adding income updates today\'s total');
  await page.click('#toast button');await settle();
  ok(!(await text()).includes('1,700')&&(await text()).includes('1,200'),'undo removes the entry');
  await page.click('[data-act=edit]');await settle();await page.fill('#amt-income','1500');await page.click('form[data-form=income] button.primary');await settle();
  ok((await text()).includes('1,500'),'editing an entry saves the change');
  await page.reload();await settle();await page.click('.tabs a[data-go=income]');await settle();
  ok((await text()).includes('1,500'),'the edit is still there after reload');

  // categories
  await page.goto(url+'#categories');await page.reload();await settle();
  await page.fill('#cat-new-income','Catering');await page.click('form[data-form=catadd][data-type=income] button');await settle();
  ok((await text()).includes('Catering'),'category added');
  await page.fill('#cat-new-income','catering');await page.click('form[data-form=catadd][data-type=income] button');await settle();
  ok((await page.locator('#toast').innerText()).includes('already exists'),'duplicate category refused');
  const row=page.locator('li.tx',{hasText:'Product Sales'});
  await row.locator('[data-act=ask]').click();await settle();
  await page.locator('li.tx',{hasText:'Product Sales'}).locator('[data-act=catdel]').click();await settle();
  ok(!(await text()).includes('Product Sales'),'category deleted after two taps');
  await page.goto(url+'#history');await page.reload();await settle();
  ok((await text()).includes('Uncategorised'),'entries of the deleted category stay as Uncategorised');

  // goals
  await page.goto(url+'#goals');await page.reload();await settle();
  await page.fill('#g-target','2000');await page.selectOption('#g-measure','expense');await page.click('form[data-form=goal] button.primary');await settle();
  ok(await page.locator('.bar').count()===2,'second goal added');

  // layout
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll at phone width');

  // log out, another owner sees nothing of Ravi's
  await page.goto(url+'#settings');await page.reload();await settle();
  await page.click('[data-act=logout]');await settle();
  ok((await text()).includes('Log in'),'log out returns to login');
  await page.reload();await settle();
  ok((await text()).includes('Log in'),'stays signed out after reload');
  await page.click('[data-act=authmode][data-v=signup]');
  await page.fill('#au-name','Sana');await page.fill('#au-email','sana@example.com');await page.fill('#au-pass','secret12');await page.click('form[data-form=auth] button');await settle();
  ok((await text()).includes('Set up your shop'),'second owner starts with no shop');
  await page.fill('#sh-name','Sana Salon');await page.click('form[data-form=setup] button');await settle();
  ok((await page.locator('.today .net').innerText()).replace(/[^0-9]/g,'')==='0'&&!(await text()).includes('Ravi'),'second owner sees none of the first owner\'s data');
  await page.goto(url+'#settings');await page.reload();await settle();await page.click('[data-act=logout]');await settle();

  // first owner logs back in
  await page.fill('#au-email','ravi@example.com');await page.fill('#au-pass','secret12');await page.click('form[data-form=auth] button');await settle();
  ok((await text()).includes('Hello, Ravi')&&(await page.locator('.today .net').innerText()).includes('1,200'),'first owner logs back in to their own data');

  // sample shop
  await page.goto(url+'#settings');await page.reload();await settle();await page.click('[data-act=logout]');await settle();
  await page.click('[data-act=sample]');await settle();
  ok((await text()).includes('sample shop')&&await page.locator('#chart svg').count()===1,'sample shop opens with a chart and saves nothing');

  ok(errors.length===0,'no script errors'+(errors.length?': '+errors.join(' | '):''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
