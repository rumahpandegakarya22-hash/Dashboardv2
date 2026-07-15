/* QR code utk setup 2FA — 100% di browser, secret TOTP tidak pernah dikirim ke
   pihak ketiga. Dipisah ke file sendiri (bukan inline <script>) agar lolos CSP
   script-src tanpa 'unsafe-inline'. */
import qrcode from "https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs";
window.QRCodeGen = qrcode;
