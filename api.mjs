import crypto from 'node:crypto';

const DAY = 86400000;
const CODE_TTL = 10 * DAY;
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

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

const tasks = [
  {id:'t1',name:'Подпишись на канал Elite Force',icon:'📢'},
  {id:'t2',name:'Открой раздел рулетки',icon:'🎰'},
  {id:'t3',name:'Пригласи друга',icon:'👥'},
  {id:'t4',name:'Забери ежедневный бонус',icon:'🎁'}
];

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
  return {telegramId:String(user.id),username:user.username?`@${user.username}`:(user.first_name||'@EliteForcePlayer'),coins:250,earned:0,lastSpin:0,lastDaily:0,inventory:[],history:[],wins:0,spins:0,streak:1,tasks:{},refs:0,completedFriends:0,refEarned:0,friendTasks:0,doubleNext:false};
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
function pickIndex(){
  const total=rewards.reduce((a,r)=>a+r.p,0); let x=Math.random()*total;
  for(let i=0;i<rewards.length;i++){x-=rewards[i].p;if(x<0)return i}
  return rewards.length-1;
}
function publicState(s){return {...s,username:s.username};}

async function auth(req){
  const body=await req.json().catch(()=>({}));
  return {user:validateInitData(body.initData),body};
}

export default async function(req){
  try{
    const url=new URL(req.url), action=url.searchParams.get('action') || 'state';
    if(req.method==='GET') return fail('Используй POST',405);
    const authResult=await auth(req);
    const user=authResult.user;
    const body=authResult.body;
    const state=await getUser(user);

    if(action==='state') return json({ok:true,state:publicState(state),isAdmin:ADMIN_ID===String(user.id)});

    if(action==='daily'){
      if(Date.now()-state.lastDaily<DAY) return fail('Ежедневный бонус уже получен');
      state.lastDaily=Date.now(); state.coins+=35; state.earned+=35; state.streak++;
      await putUser(state); return json({ok:true,state,message:'🎁 Получено +35 монет'});
    }

    if(action==='task'){
      const {id}=body;
      if(!tasks.some(t=>t.id===id)) return fail('Неизвестное задание');
      if(state.tasks[id]) return fail('Это задание уже выполнено');
      state.tasks[id]=true; state.coins+=50; state.earned+=50;
      await putUser(state); return json({ok:true,state,message:'✅ Задание выполнено: +50 монет'});
    }

    if(action==='spin'){
      const now=Date.now(), free=now-state.lastSpin>=DAY;
      const repeatCost=free?0:100;
      if(!free && state.coins<100) return fail('Нужно 100 монет для повторного прокрута');
      if(repeatCost) state.coins-=repeatCost;
      state.lastSpin=free?now:state.lastSpin; state.spins++;
      const idx=pickIndex(), r=rewards[idx];
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
      const name=String(body.name||'');
      const catalog={'Скидка 25% на экипировку':800,'60 UC':3000,'30 UC':1800};
      const cost=catalog[name]; if(!cost)return fail('Недоступный обмен');
      if(state.coins<cost)return fail('Недостаточно монет');
      state.coins-=cost;
      const r=rewards.find(x=>x.name===name) || {name,icon:name==='60 UC'?'💎':'🎟️'};
      const code=await createCode(state,name); await notifyAdmin(code);
      state.inventory.unshift({name,icon:r.icon,date:new Date().toLocaleString('ru-RU'),quantity:1,code:code.code});
      state.history.unshift({name:'Обмен: '+name,icon:r.icon,date:new Date().toLocaleString('ru-RU'),code:code.code});
      await putUser(state);
      return json({ok:true,state,code});
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
