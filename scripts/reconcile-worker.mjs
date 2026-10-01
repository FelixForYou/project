const base=process.env.FELIX_ORIGIN;
if(!base||!process.env.WORKER_TOKEN)throw Error('Isi FELIX_ORIGIN dan WORKER_TOKEN.');
async function tick(){const headers={'Content-Type':'application/json',Authorization:'Bearer '+process.env.WORKER_TOKEN};if(process.env.OAI_SITES_SERVICE_TOKEN)headers['OAI-Sites-Authorization']='Bearer '+process.env.OAI_SITES_SERVICE_TOKEN;try{const r=await fetch(base.replace(/\/$/,'')+'/api/worker',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(55000)});if(!r.ok)console.error('Rekonsiliasi belum berhasil. HTTP '+r.status);}catch{console.error('Koneksi worker belum berhasil. Akan mencoba pada putaran berikutnya.');}}
async function loop(){await tick();setTimeout(loop,15000);}if(process.argv.includes('--once'))await tick();else await loop();
