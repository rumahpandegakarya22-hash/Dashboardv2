-- =========================================================================
-- 001 — Relasi booking → active_tenant + occupancy_history (Turso/libSQL)
--
-- Alur: booking (dapat No Booking) → status 'Check-in' → tenant otomatis
-- masuk ke 2 tabel:
--   • active_tenant     : HANYA tenant yang sedang aktif.
--   • occupancy_history : SEMUA tenant yg pernah tinggal (registry induk).
--       status = 'Check-in' | 'Check-out'; tanggal_selesasi NULL sampai Check-out.
--
-- occupancy_history.id_penghuni = KUNCI INDUK (FK dari payment, rooms_transfer,
-- tenant_complain, tenant_docs, feedback). Karena itu Check-out TIDAK menghapus
-- baris occupancy_history — hanya set status='Check-out' + isi tanggal_selesasi.
--
-- Idempotent: bagian A aman diulang. Bagian B (backfill) sekali jalan.
-- Jalankan di Turso web console → SQL editor, atau `turso db shell <db> < file`.
-- =========================================================================

-- ---- BAGIAN A: SKEMA + TRIGGER (aman diulang) ---------------------------

-- SQLite tak punya "ADD COLUMN IF NOT EXISTS". Abaikan error "duplicate column"
-- bila dijalankan ulang.
ALTER TABLE occupancy_history ADD COLUMN status TEXT;

-- Bersihkan \r\n + spasi di id_penghuni active_tenant (perbaiki join ke booking).
UPDATE active_tenant
   SET id_penghuni = TRIM(REPLACE(REPLACE(id_penghuni, char(13), ''), char(10), ''));

-- Trigger 1: booking dibuat langsung 'Check-in'
DROP TRIGGER IF EXISTS trg_booking_checkin_ins;
CREATE TRIGGER trg_booking_checkin_ins
AFTER INSERT ON booking
WHEN NEW.status_booking = 'Check-in' AND NEW.id_penghuni IS NOT NULL AND NEW.id_penghuni <> ''
BEGIN
  INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
  VALUES (NEW.id_penghuni, NEW.nama_penyewa, CAST(NEW.kamar_no AS TEXT),
          COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, date('now')), NULL, 'Check-in')
  ON CONFLICT(id_penghuni) DO UPDATE SET
    status='Check-in', tanggal_selesasi=NULL, nama=excluded.nama,
    no_kamar=excluded.no_kamar, tanggal_mulai=excluded.tanggal_mulai;
  INSERT INTO active_tenant (kamar_id, no_kamar, nama_lengkap, no_hp, tanggal_masuk, id_penghuni)
  VALUES ('KTD-'||NEW.kamar_no, CAST(NEW.kamar_no AS TEXT), NEW.nama_penyewa, NEW.no_hp,
          COALESCE(NEW.tgl_masuk, NEW.tanggal_booking), NEW.id_penghuni)
  ON CONFLICT(kamar_id) DO UPDATE SET
    nama_lengkap=excluded.nama_lengkap, no_hp=excluded.no_hp,
    tanggal_masuk=excluded.tanggal_masuk, id_penghuni=excluded.id_penghuni,
    updated_at=CURRENT_TIMESTAMP;
END;

-- Trigger 2: booking BERUBAH status jadi 'Check-in'
DROP TRIGGER IF EXISTS trg_booking_checkin_upd;
CREATE TRIGGER trg_booking_checkin_upd
AFTER UPDATE OF status_booking ON booking
WHEN NEW.status_booking = 'Check-in' AND (OLD.status_booking IS NULL OR OLD.status_booking <> 'Check-in')
 AND NEW.id_penghuni IS NOT NULL AND NEW.id_penghuni <> ''
BEGIN
  INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
  VALUES (NEW.id_penghuni, NEW.nama_penyewa, CAST(NEW.kamar_no AS TEXT),
          COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, date('now')), NULL, 'Check-in')
  ON CONFLICT(id_penghuni) DO UPDATE SET
    status='Check-in', tanggal_selesasi=NULL, nama=excluded.nama,
    no_kamar=excluded.no_kamar, tanggal_mulai=excluded.tanggal_mulai;
  INSERT INTO active_tenant (kamar_id, no_kamar, nama_lengkap, no_hp, tanggal_masuk, id_penghuni)
  VALUES ('KTD-'||NEW.kamar_no, CAST(NEW.kamar_no AS TEXT), NEW.nama_penyewa, NEW.no_hp,
          COALESCE(NEW.tgl_masuk, NEW.tanggal_booking), NEW.id_penghuni)
  ON CONFLICT(kamar_id) DO UPDATE SET
    nama_lengkap=excluded.nama_lengkap, no_hp=excluded.no_hp,
    tanggal_masuk=excluded.tanggal_masuk, id_penghuni=excluded.id_penghuni,
    updated_at=CURRENT_TIMESTAMP;
END;

-- Trigger 3: booking BERUBAH status jadi 'Check-out'
DROP TRIGGER IF EXISTS trg_booking_checkout_upd;
CREATE TRIGGER trg_booking_checkout_upd
AFTER UPDATE OF status_booking ON booking
WHEN NEW.status_booking = 'Check-out' AND (OLD.status_booking IS NULL OR OLD.status_booking <> 'Check-out')
 AND NEW.id_penghuni IS NOT NULL AND NEW.id_penghuni <> ''
BEGIN
  UPDATE occupancy_history SET status='Check-out',
    tanggal_selesasi = COALESCE(NEW.tgl_keluar_est, date('now'))
  WHERE id_penghuni = NEW.id_penghuni;
  DELETE FROM active_tenant WHERE id_penghuni = NEW.id_penghuni;
END;

-- ---- BAGIAN B: BACKFILL DATA (sekali jalan) -----------------------------

-- occupancy_history dari booking yg sudah Check-in/Check-out.
INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
SELECT id_penghuni, nama_penyewa, CAST(kamar_no AS TEXT),
  COALESCE(tgl_masuk, tanggal_booking, '20'||substr(id_penghuni,5,2)||'-'||substr(id_penghuni,7,2)||'-01'),
  CASE WHEN status_booking='Check-out' THEN COALESCE(tgl_keluar_est, date('now')) END,
  status_booking
FROM booking
WHERE status_booking IN ('Check-in','Check-out') AND id_penghuni IS NOT NULL AND id_penghuni <> ''
ON CONFLICT(id_penghuni) DO NOTHING;

-- occupancy_history dari active_tenant legacy (tak punya baris booking).
INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
SELECT id_penghuni, nama_lengkap, no_kamar,
  '20'||substr(id_penghuni,5,2)||'-'||substr(id_penghuni,7,2)||'-01', NULL, 'Check-in'
FROM active_tenant
WHERE id_penghuni IS NOT NULL AND id_penghuni <> ''
ON CONFLICT(id_penghuni) DO NOTHING;

-- Reconcile: buang dari active_tenant yg sudah Check-out di booking.
DELETE FROM active_tenant
WHERE id_penghuni IN (SELECT id_penghuni FROM booking WHERE status_booking='Check-out');

-- Isi active_tenant utk booking Check-in yg belum punya profil (sparse; profil
-- lengkap menyusul dari form onboarding). Konflik kamar (2 orang 1 kamar) dilewati.
INSERT INTO active_tenant (kamar_id, no_kamar, nama_lengkap, no_hp, tanggal_masuk, id_penghuni)
SELECT 'KTD-'||b.kamar_no, CAST(b.kamar_no AS TEXT), b.nama_penyewa, b.no_hp,
       COALESCE(b.tgl_masuk, b.tanggal_booking), b.id_penghuni
FROM booking b
WHERE b.status_booking='Check-in' AND b.id_penghuni IS NOT NULL AND b.id_penghuni <> ''
  AND b.id_penghuni NOT IN (SELECT id_penghuni FROM active_tenant)
ON CONFLICT(kamar_id) DO NOTHING;

-- ---- ROLLBACK (kalau perlu balikkan) ------------------------------------
-- DROP TRIGGER IF EXISTS trg_booking_checkin_ins;
-- DROP TRIGGER IF EXISTS trg_booking_checkin_upd;
-- DROP TRIGGER IF EXISTS trg_booking_checkout_upd;
-- (data booking/active_tenant/occupancy_history bisa dipulihkan dari file backup JSON)
