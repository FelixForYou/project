import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(!process.env.TURSO_DATABASE_URL)throw Error('Isi TURSO_DATABASE_URL pada .env.local.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
await client.execute('CREATE TABLE IF NOT EXISTS felix_migrations (name TEXT PRIMARY KEY, digest TEXT NOT NULL, applied_at INTEGER NOT NULL)');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
 const content=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');const digest=createHash('sha256').update(content).digest('hex');const previous=await client.execute({sql:'SELECT digest FROM felix_migrations WHERE name=?',args:[name]});if(previous.rows.length){if(previous.rows[0].digest!==digest)throw Error('Migrasi yang sudah diterapkan berubah: '+name);continue;}
 // Drizzle breakpoint splitting preserves complete BEGIN ... END trigger bodies.
 const statements=content.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
 await client.batch([...statements,{sql:'INSERT INTO felix_migrations VALUES(?,?,?)',args:[name,digest,Date.now()]}],'write');
 console.log('Migrasi diterapkan: '+name);
}
client.close();
