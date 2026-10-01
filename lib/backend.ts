import {id,now,random,password,sha,invoice,encrypt,decrypt} from './crypto';
import {catalog,defaults} from './catalog';
import {austin,ptero,ServiceError} from './adapters';
export class App {
 constructor(public env:any){}
 get db(){if(!this.env.DB)throw new ServiceError('Database belum tersedia. Silakan coba lagi.');return this.env.DB;}
 q(sql:string,...v:any[]){return this.db.prepare(sql).bind(...v);}
 async one(sql:string,...v:any[]){return this.q(sql,...v).first();}
 async all(sql:string,...v:any[]){return (await this.q(sql,...v).all()).results;}
 async run(sql:string,...v:any[]){return this.q(sql,...v).run();}
 async config(){const r=await this.one('SELECT value FROM settings WHERE id=?','general');return {...defaults,...(r?JSON.parse(r.value):{})};}
 async notify(userId:string,text:string){await this.run('INSERT INTO notifications VALUES(?,?,?,?,?)',id(),userId,text,0,now());}
 async admins(text:string){for(const u of await this.all("SELECT id FROM users WHERE role='web_admin'"))await this.notify(u.id,text);}
 async audit(u:string,action:string,data:any){await this.run('INSERT INTO audit VALUES(?,?,?,?,?)',id(),u,action,JSON.stringify(data),now());}
 async rate(key:string,max=10,seconds=60){const k=key+':'+Math.floor(now()/(seconds*1000));await this.run('INSERT INTO rate_limits VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET count=count+1',k,1,now()+seconds*1000);const r=await this.one('SELECT count FROM rate_limits WHERE id=?',k);if(r.count>max)throw new ServiceError('Terlalu banyak percobaan. Coba lagi sebentar.',429);}
 async auth(req:Request){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)felix_session=([^;]+)/)?.[1];if(!token)return null;return this.one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>?',await sha(token),now());}
 async discount(user:any,p:any,code:string){if(!code)return 0;const v=await this.one('SELECT * FROM vouchers WHERE code=?',code.toUpperCase());if(!v||v.expires<now()||p.price<v.min||(v.kind!=='all'&&v.kind!==p.kind))throw new ServiceError('Voucher tidak berlaku untuk pembelian ini.',400);const c=await this.one('SELECT COUNT(*) AS n, SUM(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS own FROM voucher_uses WHERE code=?',user.id,v.code);if(c.n>=v.quota||c.own>=v.per_user)throw new ServiceError('Kuota voucher sudah habis.',400);return Math.min(p.price,v.max,v.type==='percent'?Math.floor(p.price*v.value/100):v.value);}
 async has(u:any,kind:string){return u.role==='web_admin'||!!await this.one("SELECT id FROM orders WHERE user_id=? AND kind=? AND status='complete' AND expires>?",u.id,kind,now());}
 async checkout(u:any,b:any){
 if(typeof b.key!=='string'||b.key.length<10||b.key.length>100)throw new ServiceError('Referensi checkout tidak valid.',400);
 const old=await this.one('SELECT * FROM orders WHERE user_id=? AND key=?',u.id,b.key);if(old)return old;
 const p=await this.one('SELECT * FROM packages WHERE id=? AND active=1',b.packageId);if(!p)throw new ServiceError('Paket belum tersedia untuk dibeli.',400);
 const c=await this.config();if(!this.env.PTERO_KEY||!this.env.PTERO_URL||!this.env.DATA_KEY)throw new ServiceError('Layanan panel belum diaktifkan. Hubungi admin.');
 const data={server:String(b.server||'').trim(),username:String(b.username||'').trim(),egg:b.egg||'node',method:b.method,renew:b.renew||null};
 if(!/^[a-zA-Z0-9_-]{3,24}$/.test(data.username)||data.server.length<3||data.server.length>50||!['node','python'].includes(data.egg))throw new ServiceError('Isi nama server dan username 3–24 karakter (huruf, angka, garis bawah).',400);
 if(b.renew){const own=await this.one("SELECT * FROM orders WHERE id=? AND user_id=? AND kind='panel' AND status IN ('complete','expired')",b.renew,u.id);if(!own||!c.renewal||own.server_id==null)throw new ServiceError('Panel tidak dapat diperpanjang.',400);}
 const off=await this.discount(u,p,String(b.voucher||''));const orderId=id();const t=now();const total=p.price-off;
 const statements=[this.q('INSERT INTO orders(id,user_id,invoice,key,kind,total,discount,snapshot,data,created) VALUES(?,?,?,?,?,?,?,?,?,?)',orderId,u.id,invoice(),b.key,p.kind,total,off,JSON.stringify({...p,spec:JSON.parse(p.spec)}),JSON.stringify(data),t)];
 if(off)statements.push(this.q('INSERT INTO voucher_uses VALUES(?,?,?)',orderId,u.id,String(b.voucher).toUpperCase()));
 if(b.method==='balance'){statements.push(this.q('INSERT INTO ledger VALUES(?,?,?,?,?,?)',id(),u.id,-total,'order:'+orderId,'Pembelian panel',t));statements.push(this.q("UPDATE orders SET payment='paid', status=? WHERE id=?",c.approval||p.kind==='ptero_admin'?'approval':'ready',orderId));}
 else if(b.method!=='qris')throw new ServiceError('Pilih QRIS atau saldo.',400);
 await this.db.batch(statements);
 if(b.method==='qris')await this.createPayment(u,total,orderId);
 else if(!c.approval&&p.kind!=='ptero_admin')await this.provision(orderId);
 return this.one('SELECT * FROM orders WHERE id=?',orderId);
 }
 async createPayment(u:any,amount:number,orderId:string|null=null){
 if(!Number.isSafeInteger(amount)||amount<1)throw new ServiceError('Nominal tidak valid.',400);
 if(orderId){const old=await this.one('SELECT * FROM payments WHERE order_id=?',orderId);if(old)return old;}
 await this.rate('austin:create',5,60);const paymentId=id();await this.run('INSERT INTO payments(id,user_id,order_id,amount,created) VALUES(?,?,?,?,?)',paymentId,u.id,orderId,amount,now());
 try{const r=await austin(this.env,'/deposit/create','POST',{amount});const d=r.deposit;if(!d?.transaction_id||!d.expired_at||!Number.isSafeInteger(d.amount)||!d.qr_image?.startsWith('data:image/png;base64,'))throw new ServiceError('Respons QRIS tidak lengkap; admin perlu melakukan rekonsiliasi.');await this.run("UPDATE payments SET provider=?,details=?,status='pending' WHERE id=?",d.transaction_id,JSON.stringify(d),paymentId);}
 catch{await this.run("UPDATE payments SET status='unknown' WHERE id=?",paymentId);await this.admins('Pembayaran '+paymentId+' memerlukan rekonsiliasi. Jangan membuat ulang transaksi provider.');throw new ServiceError('Pembuatan QRIS belum terkonfirmasi. Transaksi tersimpan; hubungi admin untuk pemeriksaan.');}
 return this.one('SELECT * FROM payments WHERE id=?',paymentId);
 }
 async check(paymentId:string){const p=await this.one('SELECT * FROM payments WHERE id=?',paymentId);if(!p?.provider||p.status==='paid')return p;
 const lock=await this.run('UPDATE payments SET checked=? WHERE id=? AND checked<? AND status=?',now(),p.id,now()-5000,'pending');if(!lock.meta.changes)return p;
 const r=await austin(this.env,'/deposit/check/'+encodeURIComponent(p.provider));if(r.status==='paid'){
 // Trigger settlement is transactional and runs only for pending -> paid.
 await this.run("UPDATE payments SET status='paid' WHERE id=? AND status='pending'",p.id);
 const c=await this.config();if(p.order_id){await this.run("UPDATE orders SET status=? WHERE id=? AND status='settled'",c.approval?'approval':'ready',p.order_id);const o=await this.one('SELECT * FROM orders WHERE id=?',p.order_id);if(o.kind==='ptero_admin')await this.run("UPDATE orders SET status='approval' WHERE id=? AND status='ready'",o.id);else if(o.status==='ready')await this.provision(o.id);}
 await this.notify(p.user_id,p.order_id?'Pembayaran diterima. Pesanan sedang diproses.':'Deposit berhasil. Saldo sudah ditambahkan.');await this.admins('Pembayaran diterima: '+p.id);
 }else if(r.status==='expired')await this.run("UPDATE payments SET status='expired' WHERE id=? AND status='pending'",p.id);
 return this.one('SELECT * FROM payments WHERE id=?',p.id);
 }
 async provision(orderId:string){let o=await this.one('SELECT * FROM orders WHERE id=?',orderId);if(o?.status==='provisioning'&&o.updated<now()-120000){await this.run("UPDATE orders SET status='failed',reason=? WHERE id=? AND status='provisioning' AND updated<?",'Memulihkan proses terputus; rekonsiliasi external_id diperlukan.',o.id,now()-120000);o=await this.one('SELECT * FROM orders WHERE id=?',orderId);}if(!o||o.payment!=='paid'||!['ready','failed'].includes(o.status))return;
 const claim=await this.run("UPDATE orders SET status='provisioning', reason=NULL,updated=? WHERE id=? AND status IN ('ready','failed')",now(),o.id);if(!claim.meta.changes)return;
 let u=await this.one('SELECT * FROM users WHERE id=?',o.user_id);const snap=JSON.parse(o.snapshot);const d=JSON.parse(o.data);const spec=snap.spec;if(d.customerEmail){if(d.customerUserId){u=await this.one('SELECT * FROM users WHERE id=? AND verified=1',d.customerUserId);if(!u)throw new ServiceError('Akun pelanggan belum terverifikasi.');}else{u={id:'customer-'+await sha(d.customerEmail),email:d.customerEmail,name:d.customerName||d.username};}}
 try{
 if(d.renew){const base=await this.one('SELECT * FROM orders WHERE id=? AND user_id=?',d.renew,u.id);if(!base||!base.server_id)throw new ServiceError('Panel asal tidak ditemukan.');await ptero(this.env,`/servers/${base.server_id}/unsuspend`,'POST');const until=Math.max(now(),base.expires||0)+spec.days*86400000;await this.db.batch([this.q("UPDATE orders SET expires=?,status='complete' WHERE id=?",until,base.id),this.q("UPDATE orders SET status='complete',server_id=?,panel_user=?,expires=? WHERE id=?",base.server_id,base.panel_user,until,o.id)]);return;}
 if(o.kind==='reseller'){await this.run("UPDATE orders SET status='complete',expires=? WHERE id=?",now()+spec.days*86400000,o.id);await this.notify(u.id,'Akses reseller aktif. Menu reseller sudah tersedia.');return;}
 // Resolve by stable external_id; reconcile before every create, including retries.
 let panelUser;try{panelUser=(await ptero(this.env,'/users/external/felix-'+u.id)).attributes;}catch(e:any){if(!e.message.includes('(404)'))throw e;}
 if(!panelUser){const found=await ptero(this.env,'/users?filter[email]='+encodeURIComponent(u.email));if(found.data?.length)throw new ServiceError('Email sudah ada pada panel. Admin perlu memverifikasi dan menautkan akun; akun tidak digandakan.');const pw=random(18);await this.run('UPDATE orders SET secret=? WHERE id=?',await encrypt(this.env.DATA_KEY,pw),o.id);panelUser=(await ptero(this.env,'/users','POST',{external_id:'felix-'+u.id,email:u.email,username:d.username,first_name:u.name,last_name:u.name,password:pw,root_admin:false})).attributes;}
 await this.run('UPDATE orders SET panel_user=? WHERE id=?',panelUser.id,o.id);
 if(o.kind==='ptero_admin'){await ptero(this.env,`/users/${panelUser.id}`,'PATCH',{email:panelUser.email,username:panelUser.username,first_name:panelUser.first_name,last_name:panelUser.last_name,root_admin:true});await this.run("UPDATE orders SET status='complete',expires=? WHERE id=?",now()+spec.days*86400000,o.id);}
 else{let server;try{server=(await ptero(this.env,'/servers/external/felix-'+o.id)).attributes;}catch(e:any){if(!e.message.includes('(404)'))throw e;}
 if(!server){const pc=await this.one('SELECT value FROM settings WHERE id=?','ptero');const pcfg=pc?JSON.parse(pc.value):{};const configs=pcfg.eggs||JSON.parse(this.env.PTERO_EGGS||'{}');const location=Number(pcfg.location||this.env.PTERO_LOCATION);const egg=configs[d.egg];if(!egg?.id||!egg?.docker_image||!egg?.startup||!location)throw new ServiceError('Pengaturan egg atau lokasi belum lengkap.');server=(await ptero(this.env,'/servers','POST',{external_id:'felix-'+o.id,name:d.server,user:panelUser.id,egg:Number(egg.id),docker_image:egg.docker_image,startup:egg.startup,environment:egg.environment||{},limits:{memory:spec.ram,swap:0,disk:spec.disk,io:500,cpu:spec.cpu},feature_limits:{databases:1,allocations:1,backups:1},deploy:{locations:[location],dedicated_ip:false,port_range:[]}})).attributes;}
 await this.run("UPDATE orders SET status='complete',server_id=?,expires=? WHERE id=?",server.id,now()+spec.days*86400000,o.id);}
 await this.notify(o.user_id,'Pesanan '+o.invoice+' selesai. Buka Panel Saya.');
 }catch(e:any){await this.run("UPDATE orders SET status='failed',reason=? WHERE id=?",e instanceof ServiceError?e.message:'Pembuatan panel belum berhasil. Admin akan memeriksa.',o.id);await this.admins('Provisioning gagal: '+o.invoice+'. Retry akan merekonsiliasi external_id terlebih dahulu.');}
 }
 async safeOrder(o:any,u:any){const p=await this.one('SELECT * FROM payments WHERE order_id=?',o.id);const result={...o,snapshot:JSON.parse(o.snapshot),data:JSON.parse(o.data),secret:undefined,panelUrl:this.env.PTERO_URL||null,pay:p?{...p,details:p.details?JSON.parse(p.details):null}:null};if(o.status==='complete'&&(o.user_id===u.id||await this.one('SELECT id FROM panel_links WHERE order_id=? AND user_id=?',o.id,u.id))&&o.secret&&this.env.DATA_KEY)result.initialPassword=await decrypt(this.env.DATA_KEY,o.secret);return result;}
}
