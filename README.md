# FELIX PANEL — Versi Vercel

Versi ini memakai Next.js dengan Node.js, Turso/libSQL untuk database SQL persisten, dan Vercel Blob PRIVATE untuk bukti transaksi. Semua UI dan alur bisnis FELIX PANEL tetap dipertahankan. Tidak memerlukan Cloudflare Worker, D1, R2, Vinext, Wrangler, atau manifest Sites.

## Deploy ke Vercel

1. Ekstrak ZIP. Upload isi folder `felix-panel-vercel` ke GitHub, bukan ZIP-nya. `package.json` harus berada pada Root Directory project Vercel.
2. Framework Preset: **Next.js**. Node.js: **24.x**. Build: `npm run build`. Install: `npm ci`. Output Directory: default/kosong, jangan `dist`.
3. Buat database Turso atau hubungkan integrasi Turso dari Storage/Marketplace Vercel. Tambahkan environment `TURSO_DATABASE_URL` (`libsql://...`) dan `TURSO_AUTH_TOKEN` (token database). Jangan memakai file SQLite lokal sebagai database produksi Vercel.
4. Buat Vercel Blob store dengan akses **Private**, hubungkan ke project, lalu pastikan `BLOB_READ_WRITE_TOKEN` tersedia pada environment Vercel.
5. Salin `.env.example` menjadi `.env.local` di komputer/VPS dan isi koneksi database yang sama. Jalankan:

```bash
npm ci
npm run db:migrate
npm run typecheck
npm test
npm run build
```

6. Tambahkan secret backend lainnya di Vercel → Settings → Environment Variables, lalu Redeploy. Build tidak memerlukan secret/database. Bila database belum dikonfigurasi, halaman publik menampilkan pratinjau dengan status konfigurasi yang jujur; akun/transaksi belum diaktifkan.

Jangan menjalankan migrasi otomatis pada setiap build Vercel karena preview deployment bisa memakai database produksi. Script migrasi bersifat transaksional per file, mencatat checksum, dan menolak perubahan pada migrasi yang sudah diterapkan. Migrasi memisahkan statement berdasarkan breakpoint Drizzle sehingga trigger `BEGIN...END` tetap utuh.

## Environment

| Variabel | Isi |
|---|---|
| TURSO_DATABASE_URL | URL database Turso, bukan URL website |
| TURSO_AUTH_TOKEN | Token akses database Turso |
| BLOB_READ_WRITE_TOKEN | Token PRIVATE Blob store yang terhubung ke project |
| ADMIN_EMAIL | Email pemilik website |
| ADMIN_SETUP_TOKEN | Kode acak panjang untuk aktivasi admin pertama |
| DATA_KEY | Secret acak panjang untuk AES-GCM password panel |
| WORKER_TOKEN | Secret worker rekonsiliasi |
| AUSTIN_API_KEY | API key AustinPay |
| AUSTIN_API_SECRET | API secret jika HMAC diaktifkan pada AustinPay |
| AUSTIN_WEBHOOK_SECRET | Webhook secret AustinPay |
| AUSTIN_RELAY_URL | Opsional: origin relay HTTPS dengan IP keluar tetap |
| PTERO_URL | Origin HTTPS panel Pterodactyl |
| PTERO_KEY | Pterodactyl Application API key |
| PTERO_LOCATION | ID lokasi panel |
| PTERO_EGGS | JSON ID egg, docker image, startup, dan environment |
| EMAIL_RELAY_URL / EMAIL_RELAY_TOKEN | Relay email opsional |

Aktivasi admin: daftar dengan ADMIN_EMAIL, buka Akun Saya, masukkan ADMIN_SETUP_TOKEN, lalu hapus token setup dari konfigurasi setelah berhasil. Siapkan katalog di Admin Website → Paket. Paket awal nonaktif; pengunjung tidak melihat saldo/statistik palsu.

## Pembayaran dan worker

AustinPay memerlukan IP whitelist. Bila deployment Anda tidak memiliki IP keluar tetap, gunakan relay HTTPS di VPS ber-IP tetap untuk AustinPay. Source relay dan worker tersedia dalam `scripts/`. Konfigurasi relay menggunakan key backend yang sama. Jangan menaruh key atau token pada variabel NEXT_PUBLIC.

Webhook: `https://domain/api/webhook/austinpay`, HMAC-SHA256 raw body dengan webhook secret. Callback mengantrekan pemeriksaan, worker melakukan konfirmasi provider dan provisioning. Loop worker menggunakan Node.js 22/24 di VPS/PM2/systemd dengan FELIX_ORIGIN dan WORKER_TOKEN. Worker tidak dijalankan otomatis oleh Vercel. Pembayaran/provisioning live belum diuji tanpa credentials.

Konfigurasi lama Cloudflare diganti khusus pada versi ini. Database D1 lama tidak otomatis dipindahkan; jika sudah memiliki data, ekspor dan migrasikan ke Turso sebelum produksi.

## Penyebab error ZIP sebelumnya

Source sebelumnya memakai `cloudflare:workers`, binding D1/R2, Vinext/Vite, dan build Cloudflare. Vercel memerlukan output Next.js yang sesuai. Versi ini mengganti runtime dan storage adapter, tidak hanya mengganti Build Command.
