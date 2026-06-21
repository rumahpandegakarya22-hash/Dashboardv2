// Entry-point serverless untuk Vercel.
// Meng-import aplikasi Express dari server/server.js (yang meng-export `app`
// dan TIDAK memanggil listen saat di-import). Vercel memakai `app` sebagai handler.
module.exports = require("../server/server.js");
