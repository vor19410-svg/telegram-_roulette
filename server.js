import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(process.env.DB_FILE || path.join(__dirname, 'roulette.db'));

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '');
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '';
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const CHANNEL_URL = process.env.CHANNEL_URL || '';
const SECOND_CHANNEL_USERNAME = process.env.SECOND_CHANNEL_USERNAME || '@elitemetrof';
const SECOND_CHANNEL_URL = process.env.SECOND_CHANNEL_URL || 'https://t.me/elitemetrof';

// Telegram chat used for subscription checks. If CHANNEL_USERNAME is wrong
// (for example a display title like "Elite Force"), derive the public
// username from CHANNEL_URL instead of sending an invalid chat_id to Telegram.
function effectiveChannelChatId(){
  if(String(CHANNEL_ID).trim()) return String(CHANNEL_ID).trim();
  const raw=String(CHANNEL_USERNAME).trim();
  if(/^@?[A-Za-z0-9_]{5,32}$/.test(raw) && !/\s/.test(raw)){
    return raw.startsWith('@') ? raw : '@'+raw;
  }
  try{
    const u=new URL(CHANNEL_URL);
    const m=u.pathname.match(/^\/([A-Za-z0-9_]{5,32})\/?$/);
    if(m) return '@'+m[1];
  }catch{}
  return '';
}
const WEBAPP_URL = process.env.WEBAPP_URL || '';

app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname));

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  referred_by INTEGER,
  referral_rewarded INTEGER NOT NULL DEFAULT 0,
  first_spin_done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  result_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_value TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  reward INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS task_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, task_key)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const defaults = {
  free_spin_hours: '24',
  paid_spin_cost: '100',
  paid_spin_limit: '5',
  code_days: '10',
  exchange_coins: '3500',
  exchange_uc: '60',
  exchange_uc_enabled: '1',
  exchange_uc30_coins: '1800',
  exchange_uc30_enabled: '1',
  exchange_discount_coins: '800',
  exchange_discount_percent: '25',
  exchange_discount25_enabled: '1',
  exchange_discount10_coins: '500',
  exchange_discount15_coins: '1000',
  exchange_discount10_enabled: '1',
  exchange_discount15_enabled: '1',
  referral_reward: '100',
  channel_reward: '50',
  second_channel_reward: '50',
  weight_c50a: '15',
  weight_c100a: '10',
  weight_c150a: '5',
  weight_c100b: '7',
  weight_c150b: '5',
  weight_discount25: '5',
  weight_uc60: '1',
  weight_uc30: '2',
  weight_butterfly: '0',
  weight_nothing: '35',
  uc_roulette_inventory: '1',
  discount_roulette_inventory: '-1',
  uc30_roulette_inventory: '0',
  butterfly_roulette_inventory: '0',
  slot_c150a_kind: 'coins',
  slot_c150a_value: '150',
  slot_c100a_kind: 'coins',
  slot_c100a_value: '100',
  slot_discount25_kind: 'discount',
  slot_discount25_value: '25',
  slot_uc30_kind: 'uc',
  slot_uc30_value: '30',
  slot_butterfly_kind: 'butterfly',
  slot_butterfly_value: 'Нож-бабочка',
  slot_nothing_kind: 'nothing',
  slot_nothing_value: '0',
  slot_uc60_kind: 'uc',
  slot_uc60_value: '60',
  slot_c100b_kind: 'coins',
  slot_c100b_value: '100',
  slot_c150b_kind: 'coins',
  slot_c150b_value: '150',
  slot_c50a_kind: 'coins',
  slot_c50a_value: '50'
};
const setDefault = db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)`);
for (const [k,v] of Object.entries(defaults)) setDefault.run(k,v);

// One-time migration: apply the exact roulette layout/percentages requested by the admin.
// A marker prevents later deployments from overwriting future admin changes.
if (db.prepare("SELECT 1 FROM settings WHERE key='roulette_percentages_v3_applied'").get() === undefined) {
  const rouletteV3 = {
    weight_c150a:'5',
    weight_c100a:'10',
    weight_discount25:'5',
    weight_uc30:'2',
    weight_butterfly:'0',
    weight_nothing:'35',
    weight_uc60:'1',
    weight_c100b:'7',
    weight_c150b:'5',
    weight_c50a:'15',
    slot_c150a_kind:'coins', slot_c150a_value:'150',
    slot_c100a_kind:'coins', slot_c100a_value:'100',
    slot_discount25_kind:'discount', slot_discount25_value:'25',
    slot_uc30_kind:'uc', slot_uc30_value:'30',
    slot_butterfly_kind:'butterfly', slot_butterfly_value:'Нож-бабочка',
    slot_nothing_kind:'nothing', slot_nothing_value:'0',
    slot_uc60_kind:'uc', slot_uc60_value:'60',
    slot_c100b_kind:'discount', slot_c100b_value:'10',
    slot_c150b_kind:'discount', slot_c150b_value:'15',
    slot_c50a_kind:'coins', slot_c50a_value:'50'
  };
  const applyRouletteV3 = db.prepare('UPDATE settings SET value=? WHERE key=?');
  const applyRouletteV3Tx = db.transaction(() => {
    for (const [k,v] of Object.entries(rouletteV3)) applyRouletteV3.run(String(v), k);
    db.prepare("INSERT INTO settings(key,value) VALUES ('roulette_percentages_v3_applied','1')").run();
  });
  applyRouletteV3Tx();
}

db.prepare(`INSERT OR IGNORE INTO tasks(key,title,reward) VALUES ('channel','Подпишитесь на наш канал',50)`).run();

const rouletteSlots = [
  { id:'c150a', weightKey:'weight_c150a', fallbackKind:'coins', fallbackValue:'150' },
  { id:'c100a', weightKey:'weight_c100a', fallbackKind:'coins', fallbackValue:'100' },
  { id:'discount25', weightKey:'weight_discount25', fallbackKind:'discount', fallbackValue:'25' },
  { id:'uc30', weightKey:'weight_uc30', fallbackKind:'uc', fallbackValue:'30' },
  { id:'butterfly', weightKey:'weight_butterfly', fallbackKind:'butterfly', fallbackValue:'Нож-бабочка' },
  { id:'nothing', weightKey:'weight_nothing', fallbackKind:'nothing', fallbackValue:'0' },
  { id:'uc60', weightKey:'weight_uc60', fallbackKind:'uc', fallbackValue:'60' },
  { id:'c100b', weightKey:'weight_c100b', fallbackKind:'coins', fallbackValue:'100' },
  { id:'c150b', weightKey:'weight_c150b', fallbackKind:'coins', fallbackValue:'150' },
  { id:'c50a', weightKey:'weight_c50a', fallbackKind:'coins', fallbackValue:'50' }
];

function slotResult(slot){
  const displayKind=String(settingText(`slot_${slot.id}_kind`) || slot.fallbackKind);
  const raw=settingText(`slot_${slot.id}_value`) || slot.fallbackValue;
  let value=raw;
  let label='';
  let inventoryKey=null;
  let kind=displayKind;
  let codePrefix=null;
  if(displayKind==='coins'){
    const n=Math.max(0,Math.floor(Number(raw)||0)); value=n; label=`${n} монет`; kind='coins';
  } else if(displayKind==='discount'){
    const n=Math.min(100,Math.max(1,Math.floor(Number(raw)||0))); value=`${n}% скидка`; label=`Скидка ${n}%`; inventoryKey='discount_roulette_inventory'; kind='code'; codePrefix='SALE';
  } else if(displayKind==='uc'){
    const n=Math.max(1,Math.floor(Number(raw)||0)); value=`${n} UC`; label=`${n} UC`;
    inventoryKey=n===60?'uc_roulette_inventory':n===30?'uc30_roulette_inventory':null; kind='code'; codePrefix='UC';
  } else if(displayKind==='butterfly'){
    value='Нож-бабочка'; label='Нож-бабочка'; inventoryKey='butterfly_roulette_inventory'; kind='code'; codePrefix='KNF';
  } else {
    value=0; label='Ничего'; kind='nothing';
  }
  return {id:slot.id,label,kind,displayKind,value,codePrefix,weightKey:slot.weightKey,inventoryKey,weight:Math.max(0,Number(setting(slot.weightKey))||0)};
}
function settingText(k){ return db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? ''; }

function now(){ return Math.floor(Date.now()/1000); }
function setting(k){ return Number(db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? 0); }
function randomCode(prefix){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';
  for(let i=0;i<7;i++) s += chars[crypto.randomInt(chars.length)];
  return `${prefix}-${s}`;
}
function pickResult(){
  const resultPool=rouletteSlots.map(slot=>slotResult(slot));
  const pool=resultPool
    .filter(r => !r.inventoryKey || setting(r.inventoryKey) < 0 || setting(r.inventoryKey) > 0)
    .map(r=>({...r,weight:Math.max(0,Number(setting(r.weightKey))||0)}));
  const scale=1000;
  let weights=pool.map(r=>Math.max(0,Math.round(r.weight*scale)));
  const total=weights.reduce((a,w)=>a+w,0);
  if(total<=0) return {id:'nothing',label:'Ничего',kind:'nothing',value:0,weightKey:'weight_nothing',weight:1};
  // Шансы являются абсолютными процентами от 100. Остаток НЕ добавляется к «Ничего».
  // Например, если задано 70%, оставшиеся 30% — отдельный исход без награды.
  const finalTotal=scale*100;
  let x=crypto.randomInt(finalTotal);
  for(let i=0;i<pool.length;i++){ x-=weights[i]; if(x<0) return pool[i]; }
  // The configured percentages may intentionally total less than 100%.
  // The remaining probability is a no-reward outcome and must point to the
  // actual "Nothing" sector so the visual wheel and the result can never disagree.
  return {id:'nothing',label:'Ничего',kind:'nothing',value:0,weightKey:'weight_nothing',weight:100-total/scale};
}

function authInitData(initData){
  if(!BOT_TOKEN) return {error:'BOT_TOKEN не настроен на сервере'};
  if(!initData) return {error:'Telegram WebApp initData отсутствует. Откройте Mini App именно из Telegram.'};
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if(!hash) return {error:'В initData отсутствует hash. Откройте Mini App заново через Telegram.'};
  p.delete('hash');
  const dataCheck = [...p.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256',secret).update(dataCheck).digest('hex');
  if(hash.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(hash))) return {error:'Неверная подпись Telegram WebApp. Проверьте, что BOT_TOKEN в Render принадлежит тому же боту, из которого открывается Mini App.'};
  const authDate = Number(p.get('auth_date')||0);
  if(!authDate || Math.abs(now()-authDate) > 86400) return {error:'Данные Telegram WebApp устарели. Закройте Mini App и откройте его заново.'};
  try {
    const user = JSON.parse(p.get('user'));
    user.start_param = p.get('start_param') || '';
    return {user};
  } catch { return {error:'Не удалось прочитать пользователя Telegram из WebApp данных'}; }
}
async function tg(method, body={}){
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  });
  const j=await r.json();
  if(!j.ok) throw new Error(j.description || 'Telegram API error');
  return j.result;
}
async function isSubscribed(userId, chatOverride=''){
  const chatId=String(chatOverride).trim() || effectiveChannelChatId();
  if(!chatId) return false;
  try {
    const m=await tg('getChatMember',{chat_id:chatId,user_id:Number(userId)});
    return ['member','administrator','creator'].includes(m.status) || (m.status==='restricted' && m.is_member);
  } catch { return false; }
}
async function notifyAdmin(text){
  if(!ADMIN_ID) return;
  try { await tg('sendMessage',{chat_id:Number(ADMIN_ID),text,parse_mode:'HTML'}); } catch {}
}
function upsertUser(tgUser, referralId){
  const t=now();
  const existing=db.prepare('SELECT * FROM users WHERE id=?').get(tgUser.id);
  if(existing){
    let ref=existing.referred_by;
    if(!ref && referralId && Number(referralId)!==Number(tgUser.id) && Number.isInteger(Number(referralId))) ref=Number(referralId);
    db.prepare('UPDATE users SET username=?, first_name=?, referred_by=COALESCE(referred_by,?), updated_at=? WHERE id=?').run(tgUser.username||'',tgUser.first_name||'',ref||null,t,tgUser.id);
    return db.prepare('SELECT * FROM users WHERE id=?').get(tgUser.id);
  }
  let ref=null;
  if(referralId && Number(referralId)!==Number(tgUser.id) && Number.isInteger(Number(referralId))) ref=Number(referralId);
  db.prepare('INSERT INTO users(id,username,first_name,referred_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(tgUser.id,tgUser.username||'',tgUser.first_name||'',ref,t,t);
  return db.prepare('SELECT * FROM users WHERE id=?').get(tgUser.id);
}
function requireUser(req,res){
  const auth=authInitData(req.headers['x-telegram-init-data']||'');
  if(auth?.error) { res.status(401).json({error:auth.error}); return null; }
  const tgUser=auth.user;
  const ref = req.headers['x-referral-id'] || tgUser.start_param || '';
  const u=upsertUser(tgUser,ref);
  return {tgUser,u};
}
function requireAdmin(req,res){
  const x=requireUser(req,res); if(!x) return null;
  if(String(x.tgUser.id)!==ADMIN_ID){ res.status(403).json({error:'Доступ только для администратора'}); return null; }
  return x;
}

app.get('/api/health',(req,res)=>res.json({ok:true,telegramConfigured:!!BOT_TOKEN,adminConfigured:!!ADMIN_ID,channelConfigured:!!effectiveChannelChatId(),webappConfigured:!!WEBAPP_URL}));

app.get('/api/telegram/diagnostics',async (req,res)=>{
  const out={secondChannelUsername:SECOND_CHANNEL_USERNAME,secondChannelUrl:SECOND_CHANNEL_URL,botTokenConfigured:!!BOT_TOKEN,adminConfigured:!!ADMIN_ID,channelConfigured:!!effectiveChannelChatId(),webappConfigured:!!WEBAPP_URL,channelId:CHANNEL_ID||null,channelUsername:CHANNEL_USERNAME||null,effectiveChannelChatId:effectiveChannelChatId()||null};
  try{ const me=await tg('getMe'); out.bot={id:me.id,username:me.username,first_name:me.first_name}; }catch(e){ out.botError=e.message; }
  try{ const info=await tg('getWebhookInfo'); out.webhook={url:info.url||'',pending_update_count:info.pending_update_count||0,last_error_message:info.last_error_message||'',last_error_date:info.last_error_date||0}; }catch(e){ out.webhookError=e.message; }
  const chatId=effectiveChannelChatId();
  if(chatId){
    try{ const chat=await tg('getChat',{chat_id:chatId}); out.channel={id:chat.id,title:chat.title,username:chat.username||null,type:chat.type}; }catch(e){ out.channelError=e.message; }
  }
  res.json(out);
});

app.get('/api/config',(req,res)=>{
  const roulette=rouletteSlots.map(slot=>{ const r=slotResult(slot); return {id:slot.id,label:r.label,kind:r.displayKind||r.kind,value:r.value,inventoryKey:r.inventoryKey}; });
  res.json({channelUrl:CHANNEL_URL,channelUsername:CHANNEL_USERNAME,secondChannelUrl:SECOND_CHANNEL_URL,secondChannelUsername:SECOND_CHANNEL_USERNAME,botUsername:BOT_USERNAME,exchangeCoins:setting('exchange_coins'),exchangeUc:setting('exchange_uc'),exchangeUcEnabled:setting('exchange_uc_enabled')===1,exchangeDiscount25Enabled:setting('exchange_discount25_enabled')===1,exchangeDiscountCoins:setting('exchange_discount_coins'),exchangeDiscountPercent:setting('exchange_discount_percent'),exchangeDiscount10Coins:setting('exchange_discount10_coins'),exchangeDiscount15Coins:setting('exchange_discount15_coins'),exchangeDiscount10Enabled:setting('exchange_discount10_enabled')===1,exchangeDiscount15Enabled:setting('exchange_discount15_enabled')===1,exchangeUc30Coins:setting('exchange_uc30_coins'),exchangeUc30Enabled:setting('exchange_uc30_enabled')===1,freeSpinHours:setting('free_spin_hours'),freeSpinLimit:100,paidSpinCost:setting('paid_spin_cost'),paidSpinLimit:setting('paid_spin_limit'),referralReward:setting('referral_reward'),channelReward:setting('channel_reward'),secondChannelReward:setting('second_channel_reward'),rewardInventory:{discount25:setting('discount_roulette_inventory'),uc60:setting('uc_roulette_inventory'),uc30:setting('uc30_roulette_inventory'),butterfly:setting('butterfly_roulette_inventory')},roulette});
});

app.get('/api/me',(req,res)=>{
  const x=requireUser(req,res); if(!x) return;
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(x.tgUser.id);
  db.prepare("UPDATE codes SET status='expired',updated_at=? WHERE user_id=? AND status='pending' AND expires_at<=?").run(now(),u.id,now());
  // TEST MODE: 100 free spins per rolling 24 hours.
  const freeSince=now()-86400;
  const freeCount=db.prepare("SELECT COUNT(*) c FROM spins WHERE user_id=? AND type='free' AND created_at>?").get(u.id,freeSince).c;
  const oldestFree=db.prepare("SELECT created_at FROM spins WHERE user_id=? AND type='free' AND created_at>? ORDER BY created_at ASC LIMIT 1").get(u.id,freeSince)?.created_at||0;
  const freeLimit=100;
  const paidSince=now()-86400;
  const paidCount=db.prepare("SELECT COUNT(*) c FROM spins WHERE user_id=? AND type='paid' AND created_at>?").get(u.id,paidSince).c;
  const claims=db.prepare('SELECT task_key FROM task_claims WHERE user_id=?').all(u.id).map(x=>x.task_key);
  const codes=db.prepare('SELECT code,reward_type,reward_value,status,expires_at,created_at FROM codes WHERE user_id=? ORDER BY created_at DESC').all(u.id);
  const referralCount=db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by=?').get(u.id).c;
  const freeLeft=Math.max(0,freeLimit-freeCount);
  res.json({user:u,referralCount,freeAvailable:freeLeft>0,freeUsed:freeCount,freeLeft,freeLimit,freeNextAt:freeLeft>0?0:oldestFree+86400,paidUsed:paidCount,paidLeft:Math.max(0,setting('paid_spin_limit')-paidCount),claims,codes,admin:String(u.id)===ADMIN_ID});
});

app.post('/api/spin',(req,res)=>{
  const x=requireUser(req,res); if(!x) return;
  const paid=!!req.body.paid;
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(x.tgUser.id);
  db.prepare("UPDATE codes SET status='expired',updated_at=? WHERE user_id=? AND status='pending' AND expires_at<=?").run(now(),u.id,now());
  // TEST MODE: allow up to 100 free spins in any rolling 24-hour window.
  const freeSince=now()-86400;
  const freeCount=db.prepare("SELECT COUNT(*) c FROM spins WHERE user_id=? AND type='free' AND created_at>?").get(u.id,freeSince).c;
  if(!paid && freeCount>=100){
    const oldestFree=db.prepare("SELECT created_at FROM spins WHERE user_id=? AND type='free' AND created_at>? ORDER BY created_at ASC LIMIT 1").get(u.id,freeSince)?.created_at||now();
    return res.status(400).json({error:'Лимит бесплатных прокрутов за 24 часа исчерпан',nextAt:oldestFree+86400});
  }
  const paidCount=db.prepare("SELECT COUNT(*) c FROM spins WHERE user_id=? AND type='paid' AND created_at>?").get(u.id,now()-86400).c;
  if(paid && paidCount>=setting('paid_spin_limit')) return res.status(400).json({error:'Лимит платных прокрутов за 24 часа исчерпан'});
  if(paid && u.coins<setting('paid_spin_cost')) return res.status(400).json({error:'Недостаточно монет'});
  const result=pickResult();
  const t=now();
  const tx=db.transaction(()=>{
    if(paid) db.prepare('UPDATE users SET coins=coins-?,updated_at=? WHERE id=?').run(setting('paid_spin_cost'),t,u.id);
    if(result.kind==='coins') db.prepare('UPDATE users SET coins=coins+?,updated_at=? WHERE id=?').run(result.value,t,u.id);
    db.prepare('INSERT INTO spins(user_id,type,cost,result_id,created_at) VALUES(?,?,?,?,?)').run(u.id,paid?'paid':'free',paid?setting('paid_spin_cost'):0,result.id,t);
  });
  tx();
  let code=null;
  if(result.kind==='code'){
    const prefix=result.codePrefix || 'REWARD';
    code=randomCode(prefix);
    const expires=t+setting('code_days')*86400;
    db.prepare('INSERT INTO codes(code,user_id,reward_type,reward_value,source,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(code,u.id,result.id,result.value,'spin',expires,t,t);
    if(result.inventoryKey) db.prepare("UPDATE settings SET value=CAST(value AS REAL)-1 WHERE key=? AND CAST(value AS REAL)>0").run(result.inventoryKey);
    notifyAdmin(`🎰 <b>Новый выигрыш</b>\n👤 ${escapeHtml(u.username?'@'+u.username:u.first_name)}\n🆔 ${u.id}\n🎁 ${escapeHtml(result.label)}\n🔑 <code>${code}</code>\n⏳ Код действует 10 дней.`);
  }
  if(!u.first_spin_done){
    db.prepare('UPDATE users SET first_spin_done=1,updated_at=? WHERE id=?').run(t,u.id);
    maybeRewardReferral(u.id,t);
  }
  res.json({result:{...result,code,expiresAt:code?t+setting('code_days')*86400:null},coins:db.prepare('SELECT coins FROM users WHERE id=?').get(u.id).coins});
});

app.post('/api/task/second-channel/claim',async (req,res)=>{
  const x=requireUser(req,res); if(!x) return;
  const u=x.u;
  const taskKey='second_channel';
  if(db.prepare('SELECT 1 FROM task_claims WHERE user_id=? AND task_key=?').get(u.id,taskKey)) return res.status(400).json({error:'Задание уже выполнено'});
  if(!(await isSubscribed(u.id, SECOND_CHANNEL_USERNAME))) return res.status(400).json({error:'Сначала подпишитесь на второй канал'});
  const t=now();
  const reward=setting('second_channel_reward');
  const tx=db.transaction(()=>{
    db.prepare('UPDATE users SET coins=coins+?,updated_at=? WHERE id=?').run(reward,t,u.id);
    db.prepare('INSERT INTO task_claims(user_id,task_key,created_at) VALUES(?,?,?)').run(u.id,taskKey,t);
  }); tx();
  res.json({ok:true,reward,coins:db.prepare('SELECT coins FROM users WHERE id=?').get(u.id).coins});
});

app.post('/api/task/channel/claim',async (req,res)=>{
  const x=requireUser(req,res); if(!x) return;
  const u=x.u;
  if(db.prepare('SELECT 1 FROM task_claims WHERE user_id=? AND task_key=?').get(u.id,'channel')) return res.status(400).json({error:'Задание уже выполнено'});
  if(!(await isSubscribed(u.id))) return res.status(400).json({error:'Сначала подпишитесь на канал'});
  const t=now();
  const reward=setting('channel_reward');
  const tx=db.transaction(()=>{
    db.prepare('UPDATE users SET coins=coins+?,updated_at=? WHERE id=?').run(reward,t,u.id);
    db.prepare('INSERT INTO task_claims(user_id,task_key,created_at) VALUES(?,?,?)').run(u.id,'channel',t);
  }); tx();

  // Referral reward is released only after the invited user both subscribes and makes a first spin.
  maybeRewardReferral(u.id,t);
  res.json({ok:true,reward,coins:db.prepare('SELECT coins FROM users WHERE id=?').get(u.id).coins});
});

app.post('/api/exchange', (req,res)=>{
  const x=requireUser(req,res); if(!x) return;
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(x.tgUser.id);
  const type=String(req.body?.type||'uc60');
  let cost, rewardType, rewardValue, prefix, label;
  if(type==='discount25' || type==='discount'){
    if(setting('exchange_discount25_enabled')!==1) return res.status(400).json({error:'Скидка 25% сейчас отключена'});
    cost=setting('exchange_discount_coins');
    const percent=setting('exchange_discount_percent');
    rewardType='exchange_discount25';
    rewardValue=`Скидка ${percent}% на экипировку`;
    prefix='SALE';
    label=`Скидка ${percent}% на экипировку`;
  } else if(type==='discount10' || type==='discount15'){
    const percent=type==='discount10'?10:15;
    const enabled=setting(type==='discount10'?'exchange_discount10_enabled':'exchange_discount15_enabled');
    if(enabled!==1) return res.status(400).json({error:`Скидка ${percent}% сейчас отключена`});
    cost=setting(type==='discount10'?'exchange_discount10_coins':'exchange_discount15_coins');
    rewardType=`exchange_discount${percent}`;
    rewardValue=`Скидка ${percent}% на экипировку`;
    prefix=`SALE${percent}`;
    label=`Скидка ${percent}% на экипировку`;
  } else if(type==='uc30'){
    if(setting('exchange_uc30_enabled')!==1) return res.status(400).json({error:'30 UC сейчас отключены'});
    cost=setting('exchange_uc30_coins');
    rewardType='exchange_uc30';
    rewardValue='30 UC';
    prefix='UC30';
    label='30 UC';
  } else if(type==='uc60' || type==='uc'){
    if(setting('exchange_uc_enabled')!==1) return res.status(400).json({error:'60 UC сейчас отключены'});
    cost=setting('exchange_coins');
    const uc=setting('exchange_uc');
    rewardType='exchange_uc';
    rewardValue=`${uc} UC`;
    prefix='UC';
    label=`${uc} UC`;
  } else {
    return res.status(400).json({error:'Неизвестный тип обмена'});
  }
  if(u.coins<cost) return res.status(400).json({error:`Нужно ${cost} монет`});
  const t=now(), code=randomCode(prefix);
  const expires=t+setting('code_days')*86400;
  const tx=db.transaction(()=>{
    db.prepare('UPDATE users SET coins=coins-?,updated_at=? WHERE id=?').run(cost,t,u.id);
    db.prepare('INSERT INTO codes(code,user_id,reward_type,reward_value,source,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(code,u.id,rewardType,rewardValue,'exchange',expires,t,t);
  }); tx();
  notifyAdmin(`💱 <b>Новый обмен</b>\n👤 ${escapeHtml(u.username?'@'+u.username:u.first_name)}\n🆔 ${u.id}\n💰 Списано: ${cost} монет\n🎁 ${escapeHtml(label)}\n🔑 <code>${code}</code>\n⏳ Код действует 10 дней.`);
  res.json({ok:true,kind:'code',code,reward:rewardValue,label,reward_type:rewardType,expiresAt:expires,coins:db.prepare('SELECT coins FROM users WHERE id=?').get(u.id).coins});
});

app.get('/api/admin/codes',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  db.prepare("UPDATE codes SET status='expired',updated_at=? WHERE status='pending' AND expires_at<=?").run(now(),now());
  const rows=db.prepare(`SELECT c.*,u.username,u.first_name FROM codes c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 200`).all();
  res.json({codes:rows});
});
app.post('/api/admin/codes/:id/status',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  const status=req.body.status;
  if(!['issued','cancelled'].includes(status)) return res.status(400).json({error:'Недопустимый статус'});
  const row=db.prepare('SELECT * FROM codes WHERE id=?').get(req.params.id);
  if(!row) return res.status(404).json({error:'Код не найден'});
  if(row.status!=='pending') return res.status(400).json({error:'Код уже обработан'});
  db.prepare('UPDATE codes SET status=?,updated_at=? WHERE id=?').run(status,now(),row.id);
  res.json({ok:true});
});
app.get('/api/admin/stats',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  const t=now(), day=t-86400;
  res.json({
    users:db.prepare('SELECT COUNT(*) c FROM users').get().c,
    newUsers24h:db.prepare('SELECT COUNT(*) c FROM users WHERE created_at>?').get(day).c,
    activeUsers24h:db.prepare('SELECT COUNT(DISTINCT user_id) c FROM spins WHERE created_at>?').get(day).c,
    spins:db.prepare('SELECT COUNT(*) c FROM spins').get().c,
    spins24h:db.prepare('SELECT COUNT(*) c FROM spins WHERE created_at>?').get(day).c,
    pendingCodes:db.prepare("SELECT COUNT(*) c FROM codes WHERE status='pending' AND expires_at>?").get(t).c,
    issuedCodes:db.prepare("SELECT COUNT(*) c FROM codes WHERE status='issued'").get().c,
    exchangeCodes:db.prepare("SELECT COUNT(*) c FROM codes WHERE source='exchange'").get().c,
    coins:db.prepare('SELECT COALESCE(SUM(coins),0) s FROM users').get().s
  });
});
app.get('/api/admin/users',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  const rows=db.prepare(`SELECT u.id,u.username,u.first_name,u.coins,u.created_at,u.updated_at, (SELECT COUNT(*) FROM spins s WHERE s.user_id=u.id) AS spins, (SELECT COUNT(*) FROM codes c WHERE c.user_id=u.id) AS codes FROM users u ORDER BY u.updated_at DESC LIMIT 200`).all();
  res.json({users:rows});
});
app.post('/api/admin/gift-150',async (req,res)=>{
  if(!requireAdmin(req,res)) return;
  const amount=150;
  const t=now();
  const users=db.prepare('SELECT id FROM users ORDER BY id').all();
  const addCoins=db.prepare('UPDATE users SET coins=coins+?,updated_at=? WHERE id=?');
  const tx=db.transaction((rows)=>{
    for(const u of rows) addCoins.run(amount,t,u.id);
  });
  try {
    tx(users);
  } catch(e) {
    return res.status(500).json({error:'Не удалось начислить подарок всем пользователям'});
  }

  // Начисление уже сохранено в базе. Уведомления отправляем отдельно, чтобы
  // временная ошибка Telegram не могла отменить начисление монет.
  let sent=0, failed=0;
  for(const u of users){
    try {
      await tg('sendMessage',{
        chat_id:Number(u.id),
        text:'🎁 <b>Администратор подарил вам 150 монет!</b>\n\nВаш баланс увеличен на 150 🪙.',
        parse_mode:'HTML'
      });
      sent++;
    } catch {
      failed++;
    }
    // Не превышаем обычный лимит рассылки Telegram.
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  res.json({ok:true,amount,total:users.length,sent,failed});
});
app.post('/api/admin/settings',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  const allowed=['exchange_coins','exchange_uc','exchange_uc_enabled','exchange_uc30_coins','exchange_uc30_enabled','exchange_discount_coins','exchange_discount25_enabled','exchange_discount_percent','exchange_discount10_coins','exchange_discount15_coins','exchange_discount10_enabled','exchange_discount15_enabled','referral_reward','channel_reward','paid_spin_cost','paid_spin_limit','code_days','free_spin_hours','weight_c50a','weight_c100a','weight_c150a','weight_c100b','weight_c150b','weight_discount25','weight_uc60','weight_uc30','weight_butterfly','weight_nothing','uc_roulette_inventory','discount_roulette_inventory','uc30_roulette_inventory','butterfly_roulette_inventory',
    ...rouletteSlots.flatMap(s=>[`slot_${s.id}_kind`,`slot_${s.id}_value`])];
  const update=db.prepare('UPDATE settings SET value=? WHERE key=?');
  const weightKeys=['weight_c50a','weight_c100a','weight_c150a','weight_c100b','weight_c150b','weight_discount25','weight_uc60','weight_uc30','weight_butterfly','weight_nothing'];
  const submittedWeights=weightKeys.filter(k=>req.body[k]!==undefined);
  if(submittedWeights.length){
    if(submittedWeights.length!==weightKeys.length) return res.status(400).json({error:'Нужно указать шанс для всех результатов рулетки'});
    const total=weightKeys.reduce((sum,k)=>sum+Number(req.body[k]),0);
    if(!weightKeys.every(k=>Number.isFinite(Number(req.body[k])) && Number(req.body[k])>=0 && Number(req.body[k])<=100)) return res.status(400).json({error:'Шансы должны быть от 0 до 100%'});
    if(total>100.000001) return res.status(400).json({error:`Сумма шансов не может быть больше 100%. Сейчас ${total.toFixed(1)}%`});
  }
  const slotKinds=['coins','discount','uc','butterfly','nothing'];
  for(const slot of rouletteSlots){
    const kk=`slot_${slot.id}_kind`, vk=`slot_${slot.id}_value`;
    if(req.body[kk]!==undefined && !slotKinds.includes(String(req.body[kk]))) return res.status(400).json({error:'Недопустимый тип награды рулетки'});
    if(req.body[vk]!==undefined && String(req.body[vk]).length>60) return res.status(400).json({error:'Значение награды слишком длинное'});
  }
  for(const k of allowed){
    if(req.body[k]===undefined) continue;
    if(k.startsWith('slot_') && k.endsWith('_kind')){
      update.run(String(req.body[k]),k);
      continue;
    }
    if(k.startsWith('slot_') && k.endsWith('_value')){
      update.run(String(req.body[k]),k);
      continue;
    }
    const n=Number(req.body[k]);
    if(!Number.isFinite(n)) return res.status(400).json({error:`Некорректное значение: ${k}`});
    if(['uc_roulette_inventory','uc30_roulette_inventory','butterfly_roulette_inventory'].includes(k) && n<0) return res.status(400).json({error:`Количество ${k} не может быть отрицательным`});
    if(k==='discount_roulette_inventory' && n<-1) return res.status(400).json({error:'Количество скидок: -1 или 0 и больше'});
    if(['exchange_discount_coins','exchange_discount25_enabled','exchange_uc30_coins','exchange_discount10_coins','exchange_discount15_coins','exchange_coins','exchange_uc','code_days'].includes(k) && n<1) return res.status(400).json({error:`Значение ${k} должно быть больше 0`});
    if(['exchange_uc_enabled','exchange_discount25_enabled','exchange_uc30_enabled','exchange_discount10_enabled','exchange_discount15_enabled',].includes(k) && ![0,1].includes(n)) return res.status(400).json({error:`Флаг ${k} должен быть 0 или 1`});
    if(k==='exchange_discount_percent' && (n<1 || n>100)) return res.status(400).json({error:'Процент скидки должен быть от 1 до 100'});
    if(k==='code_days' && n>365) return res.status(400).json({error:'Срок кода не может быть больше 365 дней'});
    update.run(String(req.body[k]),k);
  }
  const saved=db.prepare('SELECT key,value FROM settings').all();
  res.json({ok:true,settings:Object.fromEntries(saved.map(x=>[x.key, x.key.endsWith('_kind') ? x.value : Number(x.value)]))});
});
app.get('/api/admin/settings',(req,res)=>{
  if(!requireAdmin(req,res)) return;
  const rows=db.prepare('SELECT key,value FROM settings').all();
  res.json(Object.fromEntries(rows.map(x=>[x.key, x.key.endsWith('_kind') ? x.value : Number(x.value)])));
});

function maybeRewardReferral(userId,t=now()){
  const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if(!fresh || !fresh.referred_by || fresh.referral_rewarded) return;
  // Referral reward is granted once after the invited user is verified as subscribed to the channel.
  isSubscribed(userId).then(subscribed=>{
    if(!subscribed) return;
    const fresh2=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if(!fresh2 || !fresh2.referred_by || fresh2.referral_rewarded) return;
    const ref=db.prepare('SELECT * FROM users WHERE id=?').get(fresh2.referred_by);
    if(!ref) return;
    const reward=setting('referral_reward');
    const tx=db.transaction(()=>{
      const marked=db.prepare('UPDATE users SET referral_rewarded=1,updated_at=? WHERE id=? AND referral_rewarded=0').run(t,userId);
      if(!marked.changes) return false;
      db.prepare('UPDATE users SET coins=coins+?,updated_at=? WHERE id=?').run(reward,t,ref.id);
      return true;
    });
    if(tx()) notifyAdmin(`👥 <b>Реферал активирован</b>\nНовый пользователь: ${fresh2.id}\nПригласивший: ${ref.id}\nНачислено: ${reward} монет.`);
  }).catch(()=>{});
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// Telegram updates: webhook on Render/VPS, polling as a local fallback.
let offset=0;
async function handleBotUpdate(up){
  const m=up?.message;
  if(!m?.text) return;
  const chatId=m.chat.id;
  if(m.text.startsWith('/start')){
    const parts=m.text.trim().split(/\s+/);
    const ref=parts[1]||'';
    upsertUser(m.from,ref);
    const buttons={inline_keyboard:[
      [{text:'🎰 Открыть рулетку',web_app:{url:WEBAPP_URL}}],
      [{text:'📢 Подписаться на канал',url:CHANNEL_URL}]
    ]};
    await tg('sendMessage',{chat_id:chatId,text:`🎰 <b>Рулетка</b>\n\nДобро пожаловать, ${escapeHtml(m.from.first_name||'игрок')}!\n\nУ тебя есть бесплатный прокрут раз в 24 часа. Выполняй задания и приглашай друзей, чтобы получать дополнительные монеты.`,parse_mode:'HTML',reply_markup:buttons});
  }
}

app.post('/telegram/webhook',async (req,res)=>{
  try{ await handleBotUpdate(req.body); res.sendStatus(200); }
  catch(e){ res.sendStatus(200); }
});

async function pollBot(){
  if(!BOT_TOKEN || WEBAPP_URL) return;
  try{
    const updates=await tg('getUpdates',{offset,timeout:20,allowed_updates:['message']});
    for(const up of updates){ offset=up.update_id+1; await handleBotUpdate(up); }
  }catch(e){}
}
async function configureTelegramUpdates(){
  if(!BOT_TOKEN) return;
  if(WEBAPP_URL){
    const webhookUrl=`${WEBAPP_URL.replace(/\/$/,'')}/telegram/webhook`;
    try{ await tg('setWebhook',{url:webhookUrl,allowed_updates:['message']}); console.log(`Telegram webhook set: ${webhookUrl}`); }catch(e){ console.error('Webhook setup failed:',e.message); }
  }else{
    try{ await tg('deleteWebhook',{drop_pending_updates:false}); }catch(e){}
    setInterval(pollBot,1000);
  }
}

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>{ console.log(`Server started on :${PORT}`); configureTelegramUpdates(); });
