export const id=()=>crypto.randomUUID();
export const now=()=>Date.now();
export const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),b=>b.toString(16).padStart(2,'0')).join('');
export const random=(n=24)=>hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
export async function password(p:string,s:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(s),iterations:100000,hash:'SHA-256'},k,256));}
export async function sha(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
export async function hmac(secret:string,s:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(s)));}
export async function encrypt(secret:string,value:string){const k=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const b=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(value));return hex(iv.buffer)+':'+hex(b);}
export async function decrypt(secret:string,value:string){const [a,b]=value.split(':');const bytes=(s:string)=>new Uint8Array(s.match(/../g)!.map(x=>parseInt(x,16)));const k=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(a)},k,bytes(b)));}
export function invoice(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const part=()=>{const b=crypto.getRandomValues(new Uint8Array(3));return chars[b[0]%24]+String(2+b[1]%8)+chars[b[2]%chars.length];};return `FELIX${part()}-${part()}-${part()}`;}
