import crypto from 'node:crypto';

const DAY = 86400000;
const CODE_TTL = 10 * DAY;
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();

const rewards = [
  {name:'FULL 6',icon:'🥷',type:'item',p:0.1},
  {name:'Пушка',icon:'🔫',type:'item',p:0.5},
  {name:'30 UC',icon:'🎮',type:'item',p:2},
  {name:'60 UC',icon:'💎',type:'item',p:0.5},
  {name:'Шлем',icon:'🪖',type:'item',p:3},
  {name:'Броня',icon:'🦺',type:'item',p:2},
  {name:'Сумка',icon:'🎒',type:'item',p:3},
  {name:'50 монет',icon:'🪙',type:'coins',value:50,p:35},
  {name:'100 монет',icon:'🪙',type:'coins',value:100,p:25},
  {name:'200 монет',icon:'💰',type:'coins',value:200,p:10},
  {name:'Ничего',icon:'🌑',type:'none',p:18.9}
];

const tasks = [{id:'channel',name:'Подпишись на канал Elite Force',icon:'📢'}];

import fs from 'node:fs/promises';
import path from 'node:path';
const DATA_DIR = process.env.DATA_DIR || './data';
async function readDb(name) {
  await fs.mkdir(DATA_DIR, {recursive:true});
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, name+'.json'),'utf8')); }
  catch { return {}; }
}
async function writeDb(name, db) {
  await fs.mkdir(DATA_DIR, {recursive:true});
  const target=path.join(DATA_DIR,name+'.json');
  const tmp=target+'.tmp';
  await fs.writeFile(tmp,JSON.stringify(db,null,2));
  await fs.rename(tmp,target);
}
function makeStore(name) {
 return {
  async get(key, opts={}) { const db=await readDb(name); return db[key] ?? null; },
  async setJSON(key, value, opts={}) { const db=await readDb(name); if(opts.onlyIfNew && key in db) return; db[key]=value; await writeDb(name,db); },
  async *list() { const db=await readDb(name); yield {blobs:Object.keys(db).map(key=>({key}))}; }
 };
}
const users = () => makeStore('users');
const codes = () => makeStore('codes');
const stockStore = () => makeStore('stock');
const settingsStore = () => makeStore('settings');
const DEFAULT_SETTINGS = {referrerReward:70, inviteeReward:35, freeSpins:3,maxSpins:10,spinCost:100,catalog: Object.entries({'FULL 6':{cost:10000,icon:'🥷'},'Пушка':{cost:5000,icon:'🔫'},'30 UC':{cost:1800,icon:'🎮'},'60 UC':{cost:3500,icon:'💎'},'Шлем':{cost:1200,icon:'🪖'},'Броня':{cost:1500,icon:'🦺'},'Сумка':{cost:1000,icon:'🎒'}}).map(([name,v])=>({name,...v,stock:100})), rewards: rewards.map(r=>({name:r.name,icon:r.icon,p:r.p}))};
async function getSettings(){const s=await settingsStore().get('main',{type:'json'});return s||structuredClone(DEFAULT_SETTINGS)}
const exchangeCatalog = { 'FULL 6':{cost:10000,icon:'🥷'}, 'Пушка':{cost:5000,icon:'🔫'}, '30 UC':{cost:1800,icon:'🎮'}, '60 UC':{cost:3500,icon:'💎'}, 'Шлем':{cost:1200,icon:'🪖'}, 'Броня':{cost:1500,icon:'🦺'}, 'Сумка':{cost:1000,icon:'🎒'} };
async function getStock(name){ const st=stockStore(); let n=await st.get(name,{type:'json'}); if(n===null){n=100; await st.setJSON(name,n,{onlyIfNew:true});} return Number(n); }
async function setStock(name,n){ await stockStore().setJSON(name,Math.max(0,n)); }

function json(data, status=200){
  return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
}
function fail(message,status=400){return json({ok:false,error:message},status)}

function timingSafeEqualHex(a,b){
  try{
    const aa=Buffer.from(a,'hex'), bb=Buffer.from(b,'hex');
    return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
  }catch{return false}
}

function validateInitData(initData){
  if(!BOT_TOKEN) throw new Error('На Render не задан TELEGRAM_BOT_TOKEN');
  if(!initData) throw new Error('Telegram initData отсутствует');
  const p=new URLSearchParams(initData);
  const hash=p.get('hash');
  const authDate=Number(p.get('auth_date')||0);
  if(!hash || !authDate) throw new Error('Некорректные Telegram данные');
  if(Math.abs(Date.now()/1000-authDate)>86400) throw new Error('Telegram initData устарели');
  const data=[...p.entries()].filter(([k])=>k!=='hash').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
  const expected=crypto.createHmac('sha256',secret).update(data).digest('hex');
  if(!timingSafeEqualHex(expected,hash)) throw new Error('Telegram подпись недействительна');
  let user;
  try{user=JSON.parse(p.get('user')||'{}')}catch{throw new Error('Некорректный Telegram user')}
  if(!user.id) throw new Error('Telegram user ID отсутствует');
  return user;
}

function defaultState(user){
  return {telegramId:String(user.id),username:user.username?`@${user.username}`:(user.first_name||'@EliteForcePlayer'),coins:250,earned:0,lastSpin:0,spinDay:'',freeSpinsUsed:0,lastDaily:0,inventory:[],history:[],wins:0,spins:0,streak:1,tasks:{},refs:0,completedFriends:0,refEarned:0,friendTasks:0,doubleNext:false};
}
async function getUser(user){
  const store=users();
  return (await store.get(String(user.id),{type:'json'})) || defaultState(user);
}
async function putUser(state){await users().setJSON(String(state.telegramId),state);}
function cleanCode(c){
  if(c.status==='Активен' && Date.now()>=c.expiresAt) c.status='Истёк';
  return c;
}
function makeCode(kind){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let x=''; for(let i=0;i<8;i++) x+=chars[crypto.randomInt(chars.length)];
  return `EF-${kind}-${x}`;
}
async function createCode(state,prize){
  const issuedAt=Date.now(), expiresAt=issuedAt+CODE_TTL;
  const code=makeCode(prize.includes('UC')?'UC':prize.includes('Скидка')?'SKIDKA':'PRIZE');
  const item={id:crypto.randomUUID(),code,prize,telegramId:String(state.telegramId),username:state.username,date:new Date(issuedAt).toLocaleString('ru-RU'),issuedAt,expiresAt,status:'Активен'};
  await codes().setJSON(item.id,item,{onlyIfNew:true});
  return item;
}
async function notifyAdmin(item){
  if(!BOT_TOKEN||!ADMIN_ID) return;
  try{
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:ADMIN_ID,text:`🎁 Elite Force\nНовый код\n\nПриз: ${item.prize}\nКод: ${item.code}\nПользователь: ${item.username}\nTelegram ID: ${item.telegramId}\nВыдан: ${item.date}\nДействует до: ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}`})});
  }catch{}
}
function pickIndex(probabilities=rewards){ const total=probabilities.reduce((a,r)=>a+Number(r.p||0),0); if(total<=0)return rewards.length-1; let x=Math.random()*total; for(let i=0;i<probabilities.length;i++){x-=Number(probabilities[i].p||0);if(x<0)return i} return probabilities.length-1; }
function publicState(s){return {...s,username:s.username};}

async function auth(req){
  const body=await req.json().catch(()=>({}));
  return {user:validateInitData(body.initData),body};
}
async function processReferral(state, startParam){
  const raw=String(startParam||'');
  const match=raw.match(/^(?:ref_|EF)([0-9]{3,20})$/i);
  if(!match || state.referralProcessed || String(state.telegramId)===match[1]) return false;
  const referrerId=match[1];
  const referrer=await users().get(referrerId,{type:'json'});
  if(!referrer) return false;
  const referralDb=await readDb('referrals');
  if(referralDb[String(state.telegramId)]) return false;
  // Save a pending referral; do not pay until Telegram channel membership is verified.
  referralDb[String(state.telegramId)]={referrerId,inviteeId:String(state.telegramId),date:Date.now(),status:'pending'};
  await writeDb('referrals',referralDb);
  state.referredBy=referrerId;
  return true;
}
async function verifyChannelMembership(userId){
  if(!BOT_TOKEN) throw new Error('На Render не задан TELEGRAM_BOT_TOKEN');
  const channel=String(process.env.TELEGRAM_CHANNEL_ID||'').trim();
  if(!channel) throw new Error('На Render не задан TELEGRAM_CHANNEL_ID');
  const resp=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(channel)}&user_id=${encodeURIComponent(userId)}`);
  const data=await resp.json();
  if(!data.ok) throw new Error('Не удалось проверить подписку. Проверь TELEGRAM_CHANNEL_ID и права бота.');
  return ['creator','administrator','member'].includes(data.result?.status) || (data.result?.status==='restricted' && data.result?.is_member===true);
}
async function completeReferral(state){
  const db=await readDb('referrals');
  const record=db[String(state.telegramId)];
  if(!record || record.status==='completed' || state.referralProcessed) return false;
  const referrer=await users().get(String(record.referrerId),{type:'json'});
  if(!referrer || String(referrer.telegramId)===String(state.telegramId)) return false;
  const settings=await getSettings();
  const referrerReward=Math.max(0,Math.floor(Number(settings.referrerReward??70)));
  const inviteeReward=Math.max(0,Math.floor(Number(settings.inviteeReward??35)));
  referrer.coins=Number(referrer.coins||0)+referrerReward; referrer.earned=Number(referrer.earned||0)+referrerReward; referrer.refs=Number(referrer.refs||0)+1; referrer.refEarned=Number(referrer.refEarned||0)+referrerReward;
  state.coins=Number(state.coins||0)+inviteeReward; state.earned=Number(state.earned||0)+inviteeReward; state.referralProcessed=true; state.referredBy=String(record.referrerId);
  record.status='completed'; record.completedAt=Date.now(); db[String(state.telegramId)]=record;
  await writeDb('referrals',db); await putUser(referrer); return true;
}

export default async function(req){
  try{
    const url=new URL(req.url), action=url.searchParams.get('action') || 'state';
    if(req.method==='GET') return fail('Используй POST',405);
    const authResult=await auth(req);
    const user=authResult.user;
    const body=authResult.body;
    const state=await getUser(user);

    if(action==='state'){await processReferral(state, body.startParam);const settings=await getSettings();const today=new Date().toISOString().slice(0,10);if(state.spinDay!==today){state.spinDay=today;state.freeSpinsUsed=0;state.totalSpinsToday=0;}state.freeSpinsLeft=Math.max(0,Number(settings.freeSpins)-Number(state.freeSpinsUsed||0));state.maxSpins=Number(settings.maxSpins??10);await putUser(state);return json({ok:true,state:publicState(state),isAdmin:ADMIN_ID===String(user.id),botUsername:BOT_USERNAME,channelUrl:process.env.TELEGRAM_CHANNEL_URL||'',catalog:settings.catalog,rewards:settings.rewards,settings:{freeSpins:settings.freeSpins,maxSpins:settings.maxSpins,spinCost:settings.spinCost}});}


    if(action==='task'){
      const {id}=body;
      if(id!=='channel') return fail('Неизвестное задание');
      const isMember=await verifyChannelMembership(user.id);
      if(!isMember) return fail('Подпишись на канал и нажми «Проверить подписку»');
      let taskRewarded=false;
      if(!state.tasks[id]){state.tasks[id]=true;state.coins=Number(state.coins||0)+50;state.earned=Number(state.earned||0)+50;taskRewarded=true;}
      const referralRewarded=await completeReferral(state);
      await putUser(state);
      return json({ok:true,state,message:taskRewarded?(referralRewarded?'✅ Подписка проверена: +50 монет за задание и реферальная награда начислена.':'✅ Подписка проверена: +50 монет'):(referralRewarded?'✅ Реферальная награда начислена.':'Это задание уже выполнено; подписка подтверждена.')});
    }

    if(action==='spin'){
      const settings=await getSettings(); const now=Date.now();
      const dayKey=new Date(now).toISOString().slice(0,10);
      if(state.spinDay!==dayKey){state.spinDay=dayKey;state.freeSpinsUsed=0;state.totalSpinsToday=0;}
      state.freeSpinsUsed=Number(state.freeSpinsUsed||0);
      state.totalSpinsToday=Number(state.totalSpinsToday||0);
      if(state.totalSpinsToday>=Number(settings.maxSpins??10)) return fail(`Достигнут лимит ${Number(settings.maxSpins??10)} прокруток в день`);
      const free=state.freeSpinsUsed<Number(settings.freeSpins);
      if(!free && state.coins<Number(settings.spinCost)) return fail(`Нужно ${settings.spinCost} монет для повторного прокрута`);
      if(free) state.freeSpinsUsed++; else state.coins-=Number(settings.spinCost);
      state.totalSpinsToday++;
      state.lastSpin=now; state.freeSpinsLeft=Math.max(0,Number(settings.freeSpins)-state.freeSpinsUsed); state.spins++;
      const weighted=settings.rewards; const idx=pickIndex(weighted); const r=rewards.find(x=>x.name===weighted[idx]?.name)||rewards[rewards.length-1];
      let multiplier=1;
      if(state.doubleNext && r.name!=='Двойная награда'){multiplier=2;state.doubleNext=false}
      if(r.name==='Двойная награда') state.doubleNext=true;
      let code=null;
      if(r.type==='coins'){const amount=r.value*multiplier;state.coins+=amount;state.earned+=amount}
      if(r.type==='item'){
        code=await createCode(state,r.name);await notifyAdmin(code)
        state.inventory.unshift({name:r.name+(multiplier===2?' ×2':''),icon:r.icon,date:new Date().toLocaleString('ru-RU'),quantity:multiplier,code:code?.code||''});
      }
      state.history.unshift({name:r.type==='coins'&&multiplier===2?`${r.name} ×2`:r.type==='item'&&r.name!=='Двойная награда'&&multiplier===2?`${r.name} ×2`:r.name,icon:r.icon,date:new Date().toLocaleString('ru-RU'),code:code?.code||''});
      state.wins+=r.type==='none'?0:1;
      await putUser(state);
      return json({ok:true,state,reward:r,index:idx,multiplier,code});
    }

    if(action==='exchange'){
      const name=String(body.name||''); const settings=await getSettings();
      const item=settings.catalog.find(x=>x.name===name); if(!item)return fail('Эта награда недоступна для обмена');
      if(state.coins<Number(item.cost))return fail('Недостаточно монет');
      const remaining=Number(item.stock ?? await getStock(name)); if(remaining<=0)return fail('Эта награда закончилась. Попробуй позже.');
      state.coins-=Number(item.cost); item.stock=remaining-1; await settingsStore().setJSON('main',settings);
      const code=await createCode(state,name); await notifyAdmin(code);
      state.inventory.unshift({name,icon:item.icon,date:new Date().toLocaleString('ru-RU'),quantity:1,code:code.code});
      state.history.unshift({name:'Обмен: '+name,icon:item.icon,date:new Date().toLocaleString('ru-RU'),code:code.code});
      await putUser(state);
      return json({ok:true,state,code,remaining:remaining-1});
    }

    if(action==='admin-settings'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const settings=await getSettings(); return json({ok:true,settings});
    }
    if(action==='admin-settings-save'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const settings=await getSettings();
      const freeSpins=Number(body.freeSpins), maxSpins=Number(body.maxSpins??10), spinCost=Number(body.spinCost);
      if(!Number.isInteger(freeSpins)||freeSpins<0||freeSpins>20||!Number.isInteger(maxSpins)||maxSpins<freeSpins||maxSpins>100||!Number.isFinite(spinCost)||spinCost<0) return fail('Проверь общее количество прокруток, бесплатные попытки и цену');
      settings.freeSpins=freeSpins; settings.maxSpins=maxSpins; settings.spinCost=Math.floor(spinCost);
      if(body.referrerReward!==undefined) settings.referrerReward=Math.max(0,Math.floor(Number(body.referrerReward)));
      if(body.inviteeReward!==undefined) settings.inviteeReward=Math.max(0,Math.floor(Number(body.inviteeReward)));
      if(Array.isArray(body.catalog)) for(const x of body.catalog){const item=settings.catalog.find(y=>y.name===x.name);if(item){if(!Number.isFinite(Number(x.cost))||Number(x.cost)<0||!Number.isFinite(Number(x.stock))||Number(x.stock)<0)return fail('Цена и остаток должны быть неотрицательными числами');item.cost=Math.floor(Number(x.cost));item.stock=Math.floor(Number(x.stock));}}
      if(Array.isArray(body.probabilities)){const total=body.probabilities.reduce((a,x)=>a+Number(x.p),0);if(body.probabilities.some(x=>!Number.isFinite(Number(x.p))||Number(x.p)<0||Number(x.p)>100)||Math.abs(total-100)>0.11)return fail('Сумма вероятностей должна быть ровно 100% (допуск 0,1%).');for(const x of body.probabilities){const r=settings.rewards.find(y=>y.name===x.name);if(r)r.p=Number(x.p);}}
      await settingsStore().setJSON('main',settings); return json({ok:true,settings});
    }
    if(action==='admin-users'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const db=await readDb('users');
      const list=Object.values(db).map(x=>({telegramId:String(x.telegramId),username:String(x.username||'Без имени'),coins:Number(x.coins||0),earned:Number(x.earned||0),refs:Number(x.refs||0),refEarned:Number(x.refEarned||0)})).sort((a,b)=>b.coins-a.coins);
      return json({ok:true,users:list});
    }
    if(action==='admin-adjust-coins'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const targetId=String(body.telegramId||''); const delta=Number(body.delta);
      if(!/^\d{3,20}$/.test(targetId)||!Number.isInteger(delta)||Math.abs(delta)>100000000) return fail('Проверь Telegram ID и число монет');
      const target=await users().get(targetId,{type:'json'}); if(!target)return fail('Пользователь не найден');
      target.coins=Math.max(0,Number(target.coins||0)+delta); if(delta>0)target.earned=Number(target.earned||0)+delta; await putUser(target); return json({ok:true,user:{telegramId:targetId,coins:target.coins}});
    }
    if(action==='admin-grant-all'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const amount=Number(body.amount??150); if(!Number.isInteger(amount)||amount<0||amount>1000000)return fail('Некорректная сумма');
      const db=await readDb('users'); let count=0;
      for(const [id,u] of Object.entries(db)){u.coins=Number(u.coins||0)+amount;u.earned=Number(u.earned||0)+amount;db[id]=u;count++;}
      await writeDb('users',db); return json({ok:true,count,amount});
    }
    if(action==='admin-stats'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const udb=await readDb('users'), cdb=await readDb('codes'), rdb=await readDb('referrals');
      const today=Date.now()-DAY;
      return json({ok:true,stats:{users:Object.keys(udb).length,codes:Object.keys(cdb).length,referrals:Object.values(rdb).filter(x=>x.status==='completed').length,pendingReferrals:Object.values(rdb).filter(x=>x.status==='pending').length,coins:Object.values(udb).reduce((n,x)=>n+Number(x.coins||0),0)}});
    }
    if(action==='admin-codes'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const arr=[];
      for await(const page of codes().list({paginate:true})){for(const b of page.blobs){const c=await codes().get(b.key,{type:'json'});if(c)arr.push(cleanCode(c))}}
      return json({ok:true,codes:arr.sort((a,b)=>b.issuedAt-a.issuedAt)});
    }

    if(action==='admin-use'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const c=await codes().get(String(body.id),{type:'json'});
      if(!c)return fail('Код не найден',404);
      if(c.status!=='Активен')return fail('Код уже не активен');
      if(Date.now()>=c.expiresAt){c.status='Истёк';await codes().setJSON(String(body.id),c);return fail('Срок действия кода истёк');}
      c.status='Использован'; c.redeemedAt=Date.now(); c.redeemedBy=String(user.id); await codes().setJSON(String(body.id),c);
      return json({ok:true,code:c});
    }

    if(action==='admin-revoke'){
      if(ADMIN_ID!==String(user.id)) return fail('Доступ запрещён',403);
      const c=await codes().get(String(body.id),{type:'json'});
      if(!c)return fail('Код не найден',404);
      c.status='Аннулирован'; c.redeemedAt=Date.now(); c.redeemedBy=String(user.id); await codes().setJSON(String(body.id),c);
      return json({ok:true,code:c});
    }

    return fail('Неизвестное действие',404);
  }catch(e){return fail(e?.message||'Ошибка сервера',500)}
}
