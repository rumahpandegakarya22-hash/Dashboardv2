/* =========================================================================
   Kost Tiga Dara — Peta Tabel Turso → Tab Spreadsheet

   Frontend (public/app.js) mengonsumsi data sebagai array-2D per tab dan
   mendeteksi tab lewat KATA KUNCI HEADER (fuzzy). Label header di bawah
   sengaja disusun agar cocok dengan detektor frontend (loadLiveData).
   ========================================================================= */
"use strict";

const c = (col, header) => ({ col, header });

const SHEET_MAP = {
  kamar: {
    title: "KAMAR",
    columns: [
      c("id_kamar", "ID Kamar"), c("no_kamar", "No Kamar"), c("tipe_kamar", "Tipe Kamar"),
      c("luas_m2", "Luas (m2)"), c("lantai", "Lantai"), c("fasilitas", "Fasilitas"),
      c("harga_bulan", "Harga Bulanan"), c("harga_3bulan", "Harga 3 Bulan"),
      c("harga_6bulan", "Harga 6 Bulan"), c("harga_9bulan", "Harga 9 Bulan"),
      c("harga_tahun", "Harga Tahunan"), c("status", "Status"), c("catatan", "Catatan"),
    ],
  },
  booking: {
    title: "BOOKING",
    columns: [
      c("no_booking", "No Booking"), c("id_penghuni", "ID Penghuni"),
      c("tanggal_booking", "Tanggal Booking"), c("nama_penyewa", "Nama Penyewa"),
      c("no_hp", "No HP"), c("kamar_no", "Kamar"), c("tgl_masuk", "Tanggal Masuk"),
      c("durasi_bulan", "Durasi"), c("tgl_keluar_est", "Tanggal Keluar (Est)"),
      c("harga_disepakati", "Harga"), c("status_booking", "Status Booking"),
      c("alasan_cancel", "Alasan Cancel"), c("sumber_leads", "Sumber Leads"),
      c("catatan", "Catatan"),
    ],
  },
  leads: {
    title: "LEADS",
    columns: [
      c("id", "ID"), c("tanggal", "Tanggal"), c("nama_leads", "Nama Leads"),
      c("no_hp_wa", "No HP/WA"), c("sumber_leads", "Sumber Leads"), c("platform", "Platform"),
      c("kamar_dicari", "Kamar Dicari"), c("budget", "Budget"),
      c("checkin_rencana", "Rencana Check-in"), c("status_leads", "Status Leads"),
      c("tindak_lanjut", "Tindak Lanjut"), c("pic", "PIC"), c("tanggal_fu", "Tanggal FU"),
      c("keterangan", "Keterangan"),
    ],
  },
  survey: {
    title: "SURVEY",
    columns: [
      c("id", "ID"), c("id_survey", "ID Survey"), c("tanggal_survey", "Tanggal Survey"),
      c("nama_calon_penyewa", "Nama Calon Penyewa"), c("no_hp", "No HP"), c("sumber", "Sumber"),
      c("kamar_ditinjau", "Kamar Ditinjau"), c("jam_survey", "Jam Survey"),
      c("durasi_menit", "Durasi (Menit)"), c("feedback", "Feedback"),
      c("keberatan_kendala", "Keberatan/Kendala"), c("hasil_survey", "Hasil Survey"),
      c("tindak_lanjut", "Tindak Lanjut"), c("pic", "PIC"),
      c("tanggal_fu_survey", "Tanggal FU"), c("no_booking", "No Booking"),
    ],
  },
  coa: {
    title: "COA (Akun)",
    columns: [
      c("kode", "Kode"), c("nama_akun", "Nama Akun"), c("tipe_akun", "Tipe Akun"),
      c("saldo_normal", "Saldo Normal"), c("kategori_arus_kas", "Kategori Arus Kas"),
      c("grup_laporan", "Grup Laporan"),
    ],
  },
  jurnal_transaksi: {
    title: "JURNAL TRANSAKSI (Keuangan)",
    columns: [
      c("id", "ID"), c("tanggal", "Tanggal"),
      c("akun_debit_nama", "Akun Debit"), c("akun_kredit_nama", "Akun Kredit"),
      c("nominal", "Nominal"), c("dampak_laba", "Dampak Laba"), c("arus_kas", "Arus Kas"),
      c("keterangan", "Keterangan"), c("kategori", "Kategori"),
    ],
  },
  maintenance_cm: {
    title: "MAINTENANCE CORRECTIVE (Tiket)",
    columns: [
      c("id_tiket", "ID Tiket"), c("no_urut", "No Urut"),
      c("tanggal_kerusakan", "Tanggal Kerusakan"), c("tanggal_lapor", "Tanggal Lapor"),
      c("tanggal_selesai", "Tanggal Selesai"), c("sumber_laporan", "Sumber Laporan"),
      c("lokasi_item", "Lokasi / Item Rusak"), c("kategori", "Kategori"), c("penyebab", "Penyebab"),
      c("kode", "Kode"), c("deskripsi_kerusakan", "Deskripsi Kerusakan"),
      c("prioritas", "Prioritas"), c("pelaksana", "Pelaksana"), c("vendor", "Vendor"),
      c("biaya", "Biaya"), c("status", "Status"),
      c("catatan_dokumentasi", "Catatan/Dokumentasi"),
      c("durasi_perbaikan_hari", "Durasi Perbaikan (Hari)"), c("sla", "SLA"),
    ],
  },
  maintenance_pm: {
    title: "MAINTENANCE PREVENTIVE (Perawatan)",
    columns: [
      c("id_tiket", "ID Tiket"), c("no_urut", "No Urut"),
      c("tanggal_lapor", "Tanggal Lapor"), c("tanggal_selesai", "Tanggal Selesai"),
      c("sumber_laporan", "Sumber Laporan"), c("lokasi_item", "Lokasi / Item Rusak"),
      c("kategori", "Kategori"), c("penyebab", "Penyebab"), c("kode", "Kode"),
      c("deskripsi_kerusakan", "Deskripsi Kerusakan"), c("prioritas", "Prioritas"),
      c("pelaksana", "Pelaksana"), c("vendor", "Vendor"), c("biaya", "Biaya"),
      c("status", "Status"), c("catatan_dokumentasi", "Catatan/Dokumentasi"),
      c("durasi_perbaikan_hari", "Durasi Perbaikan (Hari)"), c("sla", "SLA"),
    ],
  },
  vendor: {
    title: "VENDOR",
    columns: [
      c("id", "ID"), c("nama_vendor", "Nama Vendor"), c("kategori", "Kategori"),
      c("nomor_telp", "Nomor Telp"), c("hasil", "Hasil/Rating"),
    ],
  },
  content: {
    title: "POST MARKETING (Content)",
    columns: [
      c("id", "ID"), c("tgl_post", "Tanggal Post"), c("platform", "Platform"),
      c("tipe_konten", "Tipe Konten"), c("judul_caption", "Judul/Caption"),
      c("jam_tayang", "Aset (Foto/Video)"), c("link_post", "Link Post"), c("jam", "Jam Tayang"),
      c("status", "Status"), c("likes", "Likes"), c("komentar", "Komentar"),
      c("share_saves", "Share/Saves"), c("reach", "Reach"), c("catatan", "Catatan"),
      c("engagement", "Engagement"), c("er_persen", "ER (%)"),
    ],
  },
  promotion: {
    title: "PROMOSI (Ads)",
    columns: [
      c("id", "ID"), c("tgl_mulai", "Tanggal Mulai"), c("tgl_selesai", "Tanggal Selesai"),
      c("nama_promosi", "Nama Promosi"), c("platform", "Platform"), c("tipe", "Tipe"),
      c("budget", "Budget"), c("spend_aktual", "Spend Aktual"),
      c("target_leads", "Target Leads"), c("leads_aktual", "Leads Aktual"),
      c("booking_dr_promo", "Booking dari Promo"), c("roi_persen", "ROI (%)"),
      c("status", "Status"), c("cpl", "CPL"), c("conv_lead_booking", "Konversi Lead-Booking"),
      c("roi_kotor", "ROI Kotor (%)"),
    ],
  },
  dokumen: {
    title: "DOKUMEN",
    columns: [
      c("id_dokumen", "ID Dokumen"), c("judul", "Judul"), c("role", "Role"),
      c("link_drive", "Link Drive"),
    ],
  },
  logbook_divisi: {
    title: "LOGBOOK DIVISI",
    columns: [
      c("id", "ID"), c("tanggal", "Tanggal"), c("task", "Task"), c("pic", "PIC"),
      c("divisi", "Divisi"), c("deadline", "Deadline"), c("status", "Status"),
    ],
  },
  // Header cocok dgn detektor Retention Rate di app.js (loadLiveData):
  // butuh "nama lengkap" + "tanggal masuk" + "tanggal keluar" di header.
  occupancy_history: {
    title: "HISTORICAL CUSTOMER (Retensi)",
    columns: [
      c("nama", "Nama Lengkap"), c("no_kamar", "No Kamar"),
      c("tanggal_mulai", "Tanggal Masuk"), c("tanggal_selesasi", "Tanggal Keluar"),
    ],
  },
};

module.exports = { SHEET_MAP };
