-- =========================================================================
-- 003 — Relasi penuh antar tabel (Turso/libSQL) — dijalankan 2026-07-16
--
-- Menambah:
--   • booking.id_penghuni  -> occupancy_history.id_penghuni
--       DEFERRABLE INITIALLY DEFERRED — trigger check-in membuat baris parent
--       occupancy_history DALAM TRANSAKSI YANG SAMA, jadi FK lolos saat commit.
--       Konsekuensi: booking berstatus selain Check-in/Check-out TIDAK BOLEH
--       diisi id_penghuni manual (ditolak DB). Biarkan NULL — id dibuat
--       OTOMATIS oleh trigger saat status jadi 'Check-in' (format KTD-YYMM-NNN).
--   • active_tenant.kamar_id -> kamar.id_kamar
--   • feedback.no_kamar (jadi INTEGER) -> kamar.no_kamar
--   • rooms_transfer.no_kamar_lama/baru (jadi INTEGER) -> kamar.no_kamar
--
-- Teknik rebuild TANPA RENAME (hindari gotcha 002: RENAME menulis-ulang isi
-- trigger & FK anak): CREATE TABLE <t>_backup AS SELECT; DROP <t>;
-- CREATE <t> (DDL baru, NAMA SAMA — FK anak spt survey.no_booking tetap valid);
-- INSERT dari backup. Semua dalam SATU BATCH atomik, trigger di-create paling akhir.
--
-- Data: 2 booking 'Konfirmasi' yg punya id pra-assign di-NULL-kan (sesuai alur:
-- id didapat saat check-in); nilai lama disimpan ke kolom catatan
-- ("id pra-assign: KTD-..."). BK-2604-005 (Ulum) & BK-2604-011 (Mutiara).
-- =========================================================================

-- ---- DDL BARU (hasil akhir; lihat scratchpad relasi_all.js utk urutan penuh) ----

-- booking
--   id_penghuni TEXT REFERENCES occupancy_history(id_penghuni) DEFERRABLE INITIALLY DEFERRED
--   kamar_no    INTEGER REFERENCES kamar(no_kamar)          (sudah ada sejak awal)

-- active_tenant
--   kamar_id    text PRIMARY KEY REFERENCES kamar(id_kamar)  (baru)
--   id_penghuni text UNIQUE, FK -> occupancy_history          (dari 002)

-- feedback:       no_kamar INTEGER NOT NULL REFERENCES kamar(no_kamar)  (dulu TEXT tanpa FK)
-- rooms_transfer: no_kamar_lama/baru INTEGER NOT NULL REFERENCES kamar(no_kamar)

-- ---- TRIGGER (menggantikan versi 001; kini WAJIB versi ini karena FK) ----
-- Perubahan vs 001: id_penghuni AUTO-GENERATE saat Check-in bila NULL/kosong.
-- Sequence NNN = MAX(occupancy_history ∪ booking) utk bulan YYMM tsb + 1.

DROP TRIGGER IF EXISTS trg_booking_checkin_ins;
CREATE TRIGGER trg_booking_checkin_ins
AFTER INSERT ON booking WHEN NEW.status_booking = 'Check-in'
BEGIN
  UPDATE booking SET id_penghuni = printf('KTD-%s-%03d',
      substr(strftime('%Y%m', COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, 'now')), 3),
      COALESCE((SELECT MAX(CAST(substr(id_penghuni, -3) AS INTEGER)) FROM (
          SELECT id_penghuni FROM occupancy_history
          UNION ALL SELECT id_penghuni FROM booking WHERE id_penghuni IS NOT NULL
        ) WHERE substr(id_penghuni, 5, 4) =
          substr(strftime('%Y%m', COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, 'now')), 3)), 0) + 1)
   WHERE no_booking = NEW.no_booking AND (NEW.id_penghuni IS NULL OR NEW.id_penghuni = '');
  INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
  SELECT b.id_penghuni, NEW.nama_penyewa, CAST(NEW.kamar_no AS TEXT),
         COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, date('now')), NULL, 'Check-in'
    FROM booking b WHERE b.no_booking = NEW.no_booking
  ON CONFLICT(id_penghuni) DO UPDATE SET
    status='Check-in', tanggal_selesasi=NULL, nama=excluded.nama,
    no_kamar=excluded.no_kamar, tanggal_mulai=excluded.tanggal_mulai;
  INSERT INTO active_tenant (kamar_id, no_kamar, nama_lengkap, no_hp, tanggal_masuk, id_penghuni)
  SELECT 'KTD-'||NEW.kamar_no, CAST(NEW.kamar_no AS TEXT), NEW.nama_penyewa, NEW.no_hp,
         COALESCE(NEW.tgl_masuk, NEW.tanggal_booking), b.id_penghuni
    FROM booking b WHERE b.no_booking = NEW.no_booking
  ON CONFLICT(kamar_id) DO UPDATE SET
    nama_lengkap=excluded.nama_lengkap, no_hp=excluded.no_hp,
    tanggal_masuk=excluded.tanggal_masuk, id_penghuni=excluded.id_penghuni,
    updated_at=CURRENT_TIMESTAMP;
END;

DROP TRIGGER IF EXISTS trg_booking_checkin_upd;
CREATE TRIGGER trg_booking_checkin_upd
AFTER UPDATE OF status_booking ON booking
WHEN NEW.status_booking = 'Check-in' AND (OLD.status_booking IS NULL OR OLD.status_booking <> 'Check-in')
BEGIN
  -- (body identik dgn trg_booking_checkin_ins — lihat di atas)
  UPDATE booking SET id_penghuni = printf('KTD-%s-%03d',
      substr(strftime('%Y%m', COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, 'now')), 3),
      COALESCE((SELECT MAX(CAST(substr(id_penghuni, -3) AS INTEGER)) FROM (
          SELECT id_penghuni FROM occupancy_history
          UNION ALL SELECT id_penghuni FROM booking WHERE id_penghuni IS NOT NULL
        ) WHERE substr(id_penghuni, 5, 4) =
          substr(strftime('%Y%m', COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, 'now')), 3)), 0) + 1)
   WHERE no_booking = NEW.no_booking AND (NEW.id_penghuni IS NULL OR NEW.id_penghuni = '');
  INSERT INTO occupancy_history (id_penghuni, nama, no_kamar, tanggal_mulai, tanggal_selesasi, status)
  SELECT b.id_penghuni, NEW.nama_penyewa, CAST(NEW.kamar_no AS TEXT),
         COALESCE(NEW.tgl_masuk, NEW.tanggal_booking, date('now')), NULL, 'Check-in'
    FROM booking b WHERE b.no_booking = NEW.no_booking
  ON CONFLICT(id_penghuni) DO UPDATE SET
    status='Check-in', tanggal_selesasi=NULL, nama=excluded.nama,
    no_kamar=excluded.no_kamar, tanggal_mulai=excluded.tanggal_mulai;
  INSERT INTO active_tenant (kamar_id, no_kamar, nama_lengkap, no_hp, tanggal_masuk, id_penghuni)
  SELECT 'KTD-'||NEW.kamar_no, CAST(NEW.kamar_no AS TEXT), NEW.nama_penyewa, NEW.no_hp,
         COALESCE(NEW.tgl_masuk, NEW.tanggal_booking), b.id_penghuni
    FROM booking b WHERE b.no_booking = NEW.no_booking
  ON CONFLICT(kamar_id) DO UPDATE SET
    nama_lengkap=excluded.nama_lengkap, no_hp=excluded.no_hp,
    tanggal_masuk=excluded.tanggal_masuk, id_penghuni=excluded.id_penghuni,
    updated_at=CURRENT_TIMESTAMP;
END;

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

-- ---- PETA RELASI FINAL ---------------------------------------------------
-- active_tenant.id_penghuni    -> occupancy_history.id_penghuni
-- active_tenant.kamar_id       -> kamar.id_kamar
-- booking.id_penghuni          -> occupancy_history.id_penghuni  (DEFERRED)
-- booking.kamar_no             -> kamar.no_kamar
-- feedback.id_penghuni         -> occupancy_history.id_penghuni
-- feedback.no_kamar            -> kamar.no_kamar
-- jurnal_transaksi.akun_debit_kode / akun_kredit_kode -> coa.kode
-- payment.id_penghuni          -> occupancy_history.id_penghuni
-- rooms_transfer.id_penghuni   -> occupancy_history.id_penghuni
-- rooms_transfer.no_kamar_lama / no_kamar_baru -> kamar.no_kamar
-- survey.no_booking            -> booking.no_booking
-- tenant_complain.id_penghuni  -> occupancy_history.id_penghuni
-- tenant_docs.id_penghuni      -> occupancy_history.id_penghuni
--
-- SENGAJA TANPA FK (dilewati, alasan):
--   maintenance_cm/pm.vendor -> vendor.nama_vendor : freetext, nama tak unik.
--   occupancy_history.no_kamar -> kamar            : rebuild hub ber-5 anak FK,
--     risiko >> manfaat; integritas kamar sudah dijaga lewat booking.kamar_no.
--   work_orders, daily_tasks, leads, content, promotion, dokumen, logbook_divisi:
--     tak punya kolom kunci relasional.
--
-- Tabel backup (hapus manual kalau sudah yakin):
--   booking_pre_fk_backup, active_tenant_pre_kamarfk_backup,
--   active_tenant_pre_fk_2026-07-16T11-42-23-959Z (dari 002)
