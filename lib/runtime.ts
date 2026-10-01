import {databaseAdapter} from './database';
import {put,get} from '@vercel/blob';
const bucket={async put(key:string,bytes:Uint8Array,options:any){return put('proofs/'+key,Buffer.from(bytes),{access:'private',addRandomSuffix:false,contentType:options?.httpMetadata?.contentType,token:process.env.BLOB_READ_WRITE_TOKEN});},async get(key:string){const result=await get('proofs/'+key,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN});if(!result||result.statusCode!==200)return null;return {body:result.stream};}};
export function getRuntimeEnv(){return {...process.env,DB:process.env.TURSO_DATABASE_URL?databaseAdapter():undefined,BUCKET:process.env.BLOB_READ_WRITE_TOKEN?bucket:undefined};}
