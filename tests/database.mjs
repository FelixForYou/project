import {registerHooks} from 'node:module';
import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
registerHooks({resolve(s,c,next){if(s.startsWith('./')&&c.parentURL?.includes('/lib/')&&!s.endsWith('.ts'))return next(s+'.ts',c);return next(s,c);}});
const {databaseAdapter}=await import('../lib/database.ts');
const client=createClient({url:'file:/tmp/felix-vercel-test-'+randomUUID()+'.db'});const db=databaseAdapter(()=>client);
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
 const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');await client.batch(sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean),'write');
}
await db.prepare('INSERT INTO users(id,name,username,email,hash,salt,created) VALUES(?,?,?,?,?,?,?)').bind('test','Tes Adapter','test','test@example.test','hash','salt',Date.now()).run();
await db.batch([db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?)').bind('fund','test',10000,'fund','Dana test',Date.now())]);assert.equal((await db.prepare('SELECT balance FROM users WHERE id=?').bind('test').first()).balance,10000);
await assert.rejects(db.batch([db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?)').bind('bad','test',-20000,'bad','Debit berlebih',Date.now())]));assert.equal((await db.prepare('SELECT balance FROM users WHERE id=?').bind('test').first()).balance,10000);
assert.equal((await db.prepare('SELECT * FROM ledger WHERE id=?').bind('bad').first()),null);
await db.prepare('INSERT INTO payments(id,user_id,amount,provider,status,created) VALUES(?,?,?,?,?,?)').bind('pay','test',5000,'APG-TEST','pending',Date.now()).run();await db.prepare("UPDATE payments SET status='paid' WHERE id=?").bind('pay').run();await db.prepare("UPDATE payments SET status='paid' WHERE id=?").bind('pay').run();assert.equal((await db.prepare('SELECT balance FROM users WHERE id=?').bind('test').first()).balance,15000);
client.close();console.log('PASS libSQL migration, prepared queries, batch rollback, balance triggers, repeat settlement');
