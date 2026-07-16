-- =========================================================================
-- 002 — Tambah FOREIGN KEY nyata: active_tenant.id_penghuni -> occupancy_history.id_penghuni
--
-- SQLite tak bisa ALTER TABLE ADD FOREIGN KEY ke tabel yg sudah ada — harus
-- rebuild tabel (create baru dgn FK, copy data, swap nama).
--
-- ⚠️ GOTCHA PENTING: `ALTER TABLE x RENAME TO y` di SQLite otomatis MENULIS
-- ULANG isi trigger/view yang mereferensikan `x`, supaya tetap "menempel" ke
-- objek yang sama. Kalau alurnya "rename tabel lama ke nama backup" lalu
-- "rename tabel baru ke nama asli", trigger yg tadinya nunjuk ke nama asli
-- ikut ke-rewrite mengikuti tabel LAMA (yg sudah jadi nama backup) — bukan ke
-- tabel BARU. Trigger jadi diam-diam nulis ke tabel backup yg mati.
-- FIX: `PRAGMA legacy_alter_table=ON` sebelum RENAME (mencegah auto-rewrite),
-- ATAU (yg dipakai di sini) DROP+CREATE ULANG semua trigger SETELAH proses
-- rename selesai, supaya teksnya pasti literal nama tabel yg benar.
-- =========================================================================

-- ---- BAGIAN A: REBUILD active_tenant DENGAN FK --------------------------
-- (Idempotent kasar: cek dulu FK sudah ada blm via `PRAGMA foreign_key_list(active_tenant)`
--  sebelum jalankan bagian ini ulang — kalau sudah ada FK, skip.)

PRAGMA legacy_alter_table = ON;  -- cegah SQLite nulis ulang trigger saat RENAME

CREATE TABLE "active_tenant_new_fk" (
	"kamar_id" text PRIMARY KEY,
	`email` text UNIQUE,
	`nama_lengkap` text NOT NULL,
	`nama_panggilan` text,
	`no_kamar` text,
	`pekerjaan` text,
	`instansi` text,
	`no_hp` text,
	`nomor_darurat_1` text,
	`hubungan_kontak_darurat_1` text,
	`nama_kontak_darurat_1` text,
	`nomor_darurat_2` text,
	`hubungan_kontak_darurat_2` text,
	`nama_kontak_darurat_2` text,
	`tanggal_lahir` text,
	`link_identitas` text,
	`asal_daerah` text,
	`tanggal_masuk` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP,
	`updated_at` numeric DEFAULT CURRENT_TIMESTAMP,
	"id_penghuni" text UNIQUE,
	FOREIGN KEY("id_penghuni") REFERENCES "occupancy_history"("id_penghuni")
);

INSERT INTO "active_tenant_new_fk" SELECT * FROM active_tenant;

ALTER TABLE active_tenant RENAME TO "active_tenant_pre_fk_backup";
ALTER TABLE "active_tenant_new_fk" RENAME TO active_tenant;

PRAGMA legacy_alter_table = OFF;

-- ---- VERIFIKASI (jalankan manual, bandingkan count harus sama) ---------
-- SELECT COUNT(*) FROM active_tenant;                 -- harus sama dgn sebelum
-- SELECT COUNT(*) FROM active_tenant_pre_fk_backup;    -- backup, sama juga
-- SELECT * FROM active_tenant EXCEPT SELECT * FROM active_tenant_pre_fk_backup; -- harus 0 baris
-- PRAGMA foreign_key_list(active_tenant);              -- harus muncul FK id_penghuni->occupancy_history

-- ---- BAGIAN B: RECREATE TRIGGER (WAJIB kalau tidak pakai legacy_alter_table
--      atau untuk memastikan teksnya benar — lihat gotcha di atas) --------
-- Jalankan ulang 3 CREATE TRIGGER dari 001_booking_tenant_sync.sql persis
-- sama (DROP TRIGGER IF EXISTS dulu). Tidak diulang di sini demi DRY —
-- lihat file 001 utk teks lengkapnya.

-- ---- ROLLBACK -------------------------------------------------------------
-- ALTER TABLE active_tenant RENAME TO active_tenant_with_fk;
-- ALTER TABLE active_tenant_pre_fk_backup RENAME TO active_tenant;
-- DROP TABLE active_tenant_with_fk;
-- (lalu recreate trigger lagi dari 001, karena rename di atas akan corrupt lagi)

-- Setelah yakin semua lancar cukup lama, boleh hapus tabel backup:
-- DROP TABLE active_tenant_pre_fk_backup;
