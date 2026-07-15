/* =========================================================================
   Jalankan SEKALI SAJA saat akun pertama Anda ter-ban otomatis oleh webhook
   Clerk (versi lama server.js masih memanggil banUser — fitur itu ternyata
   Pro-only di Clerk, jadi akun baru langsung terkunci dan tombol "Unban"
   di Clerk Dashboard juga minta upgrade Pro).

   Script ini memakai CLERK_SECRET_KEY (Backend API) untuk:
     1. Coba unban akun (best-effort — abaikan kalau API menolak).
     2. Set publicMetadata { role: "owner", status: "active" } supaya akun
        ini langsung bisa login sebagai Owner.

   server.js versi terbaru SUDAH TIDAK memanggil banUser lagi, jadi akun BARU
   yang daftar setelah ini tidak akan ter-ban — script ini hanya untuk
   membereskan akun yang terlanjur ter-ban oleh versi lama.

   Cara pakai:
     node server/bootstrap-owner.js <username>
   ========================================================================= */
try { require("dotenv").config(); } catch (_) { /* dotenv opsional */ }
const { createClerkClient } = require("@clerk/express");

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("Pemakaian: node server/bootstrap-owner.js <username>");
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.error("CLERK_SECRET_KEY belum di-set di .env — isi dulu (lihat README bagian Setup Clerk).");
    process.exit(1);
  }
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  const list = await clerkClient.users.getUserList({ username: [username] });
  const u = (list.data || [])[0];
  if (!u) {
    console.error(`Akun dengan username "${username}" tidak ditemukan di Clerk.`);
    process.exit(1);
  }

  try {
    await clerkClient.users.unbanUser(u.id);
    console.log("Unban berhasil.");
  } catch (e) {
    console.warn("Unban gagal (kemungkinan fitur ban/unban Pro-only di paket Anda) — dilanjutkan tanpa unban:", e.message);
    console.warn("Kalau akun masih tidak bisa login setelah ini, hapus akun via Clerk Dashboard → Users → ⋯ → Delete, lalu daftar ulang (akun baru TIDAK akan ter-ban lagi).");
  }

  await clerkClient.users.updateUserMetadata(u.id, { publicMetadata: { role: "owner", status: "active" } });
  console.log(`Akun "${username}" sekarang berstatus active dengan role owner. Coba login lagi.`);
}

main().catch((e) => { console.error("Gagal:", e.message); process.exit(1); });
