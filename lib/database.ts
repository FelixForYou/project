import {createClient} from '@libsql/client/web';
import type {Client, InStatement} from '@libsql/client';
import {ServiceError} from './adapters';
let client:Client|undefined;
function getClient(){if(!process.env.TURSO_DATABASE_URL)throw new ServiceError('Database belum dikonfigurasi. Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di Vercel.');return client??=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});}
export function databaseAdapter(get:()=>Client=getClient){
 function prepare(sql:string,args:any[]=[]):any{return {sql,args,bind(...values:any[]){return prepare(sql,values);},async first(){const r=await get().execute({sql,args});return r.rows[0]?{...r.rows[0]}:null;},async all(){const r=await get().execute({sql,args});return {results:r.rows.map(row=>({...row}))};},async run(){const r=await get().execute({sql,args});return {meta:{changes:r.rowsAffected}};}};}
 return {prepare,async batch(statements:any[]){const r=await get().batch(statements.map(s=>({sql:s.sql,args:s.args} as InStatement)),'write');return r.map(result=>({meta:{changes:result.rowsAffected},results:result.rows.map(row=>({...row}))}));}};
}
