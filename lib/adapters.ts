import {hmac} from './crypto';
export class ServiceError extends Error { constructor(message:string, public status=503){super(message);} }
export async function austin(env:any,path:string,method='GET',body?:any){
 if(!env.AUSTIN_API_KEY) throw new ServiceError('Pembayaran belum tersedia. Admin perlu mengatur koneksi AustinPay.');
 const raw=body?JSON.stringify(body):'';const stamp=String(Date.now());const headers:any={'X-API-Key':env.AUSTIN_API_KEY,'Content-Type':'application/json'};
 if(env.AUSTIN_API_SECRET){headers['X-Timestamp']=stamp;headers['X-Signature']=await hmac(env.AUSTIN_API_SECRET,`${method}\n/api${path.split('?')[0]}\n${raw}\n${stamp}`);}
 // Optional fixed-egress relay must forward byte-identical method/path/body/headers.
 const base=env.AUSTIN_RELAY_URL||'https://austinstore.id';
 let r;try{r=await fetch(base+'/api'+path,{method,headers,body:raw||undefined,signal:AbortSignal.timeout(20000)});}catch{throw new ServiceError('Koneksi pembayaran belum memberikan kepastian. Jangan membuat pembayaran baru; minta admin memeriksa transaksi.');}
 const data=await r.json() as any;if(!r.ok||!data.success)throw new ServiceError('AustinPay menolak permintaan. Admin perlu memeriksa koneksi, whitelist IP, atau batas transaksi.');return data;
}
export async function ptero(env:any,path:string,method='GET',body?:any){if(!env.PTERO_URL||!env.PTERO_KEY)throw new ServiceError('Koneksi Pterodactyl belum dikonfigurasi.');let r;try{r=await fetch(env.PTERO_URL.replace(/\/$/,'')+'/api/application'+path,{method,headers:{Authorization:`Bearer ${env.PTERO_KEY}`,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}catch{throw new ServiceError('Pterodactyl belum memberikan kepastian. Pesanan tetap tersimpan untuk rekonsiliasi.');}if(!r.ok)throw new ServiceError(`Pterodactyl menolak permintaan (${r.status}). Admin akan memeriksa pesanan.`);return r.status===204?{}:await r.json() as any;}
