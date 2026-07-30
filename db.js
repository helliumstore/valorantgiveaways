/* ============================================================
   CASEDROP — Şifreli Dosya Veritabanı Motoru
   
   Özellikler:
   - AES-256-CBC şifreleme (her dosya şifreli .txt)
   - Otomatik klasör oluşturma (db/ altında)
   - Her kayıt ayrı .txt dosyası → kolayca genişler
   - Index dosyaları → hızlı arama (email → userId vb.)
   - bcrypt şifre hash'leme (server.js içinde kullanılır)
   ============================================================ */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ============================================================
// ŞİFRELEME — AES-256-CBC
// ============================================================
const SECRET = process.env.DB_SECRET || 'varsayilan-anahtar-LUTFEN-DEGISTIR';

// process.env.DB_SECRET'ten 32 byte'lık güçlü anahtar türet
const CIPHER_KEY = crypto.scryptSync(SECRET, 'casedrop-db-salt-v1', 32);
const ALGORITHM  = 'aes-256-cbc';

/**
 * Metni AES-256-CBC ile şifreler.
 * Çıktı: "<16byte-iv-hex>:<sifreli-hex>"
 */
function encrypt(plainText) {
    const iv      = crypto.randomBytes(16);
    const cipher  = crypto.createCipheriv(ALGORITHM, CIPHER_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted    += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * AES-256-CBC ile şifrelenmiş metni çözer.
 * Hata durumunda null döner.
 */
function decrypt(cipherText) {
    try {
        const sepIdx       = cipherText.indexOf(':');
        const ivHex        = cipherText.substring(0, sepIdx);
        const encryptedHex = cipherText.substring(sepIdx + 1);
        const iv           = Buffer.from(ivHex, 'hex');
        const decipher     = crypto.createDecipheriv(ALGORITHM, CIPHER_KEY, iv);
        let decrypted      = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted         += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[DB] Şifre çözme hatası:', e.message);
        return null;
    }
}

// ============================================================
// DOSYA SİSTEMİ — Otomatik klasör yapısı
// ============================================================
const DB_ROOT = path.join(__dirname, 'db');

// Desteklenen koleksiyonlar (yenisi eklenince otomatik oluşur)
const DEFAULT_COLLECTIONS = ['users', 'wheel_items', 'sessions', '_index'];

/**
 * Klasör yoksa oluştur (recursive).
 */
function ensureDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 [DB] Klasör oluşturuldu: ${dirPath}`);
        }
    } catch (e) {
        console.error(`[DB] Klasör oluşturma hatası (${dirPath}):`, e.message);
    }
}

/**
 * Veritabanını başlatır — klasör yapısını kurar.
 * Uygulama başlarken bir kez çağrılır.
 */
function initDB() {
    ensureDir(DB_ROOT);
    DEFAULT_COLLECTIONS.forEach(col => {
        ensureDir(path.join(DB_ROOT, col));
    });
    console.log('✅ [DB] Veritabanı başlatıldı:', DB_ROOT);
}

// ============================================================
// YARDIMCI: Güvenli dosya yolu
// ============================================================
function safeFileName(id) {
    if (!id) return 'unknown_' + Date.now();
    return id.toString().replace(/[/\\:*?"<>|.]/g, '_');
}

function getFilePath(collection, id) {
    const dir = path.join(DB_ROOT, collection);
    ensureDir(dir); // Yeni koleksiyon ise otomatik oluştur
    return path.join(dir, safeFileName(id) + '.txt');
}

// ============================================================
// CRUD — Temel veritabanı operasyonları
// ============================================================

/**
 * Kaydı şifreli .txt dosyasına yazar.
 * Koleksiyon yoksa otomatik oluşturulur.
 */
function writeRecord(collection, id, data) {
    try {
        const filePath  = getFilePath(collection, id);
        const withMeta  = {
            ...data,
            _id:         id,
            _collection: collection,
            _updatedAt:  new Date().toISOString()
        };
        const jsonStr   = JSON.stringify(withMeta);
        const encrypted = encrypt(jsonStr);
        fs.writeFileSync(filePath, encrypted, 'utf8');
        return withMeta;
    } catch (e) {
        console.error(`[DB] Kayıt yazma hatası (${collection}/${id}):`, e.message);
        return null;
    }
}

/**
 * Şifreli .txt dosyasını okur ve parse eder.
 * Kayıt bulunamazsa null döner.
 */
function readRecord(collection, id) {
    const filePath = getFilePath(collection, id);
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw       = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) return null;
        const decrypted = decrypt(raw);
        if (!decrypted) return null;
        return JSON.parse(decrypted);
    } catch (e) {
        console.error(`[DB] Kayıt okuma hatası (${collection}/${id}):`, e.message);
        return null;
    }
}

/**
 * Şifreli .txt dosyasını siler.
 * Başarı: true, bulunamazsa: false
 */
function deleteRecord(collection, id) {
    try {
        const filePath = getFilePath(collection, id);
        if (!fs.existsSync(filePath)) return false;
        fs.unlinkSync(filePath);
        return true;
    } catch (e) {
        console.error(`[DB] Kayıt silme hatası (${collection}/${id}):`, e.message);
        return false;
    }
}

/**
 * Koleksiyondaki tüm kayıtları döner.
 * Her .txt dosyasını okur ve şifresini çözer.
 */
function listRecords(collection) {
    try {
        const dir = path.join(DB_ROOT, collection);
        ensureDir(dir);
        if (!fs.existsSync(dir)) return [];
        const files   = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
        const results = [];
        for (const file of files) {
            const id     = file.replace('.txt', '');
            const record = readRecord(collection, id);
            if (record) results.push(record);
        }
        return results;
    } catch (e) {
        console.error(`[DB] Koleksiyon listeleme hatası (${collection}):`, e.message);
        return [];
    }
}

/**
 * Bir kayıt için belirli bir koleksiyonda arama yapar.
 * predicate: (record) => boolean
 */
function findRecord(collection, predicate) {
    const all = listRecords(collection);
    return all.find(predicate) || null;
}

// ============================================================
// INDEX DOSYALARI — Hızlı arama için
// Örnek: email → userId eşlemesi
// ============================================================

/**
 * Index dosyasını okur (şifreli _index/ klasöründen).
 */
function readIndex(name) {
    try {
        const filePath = path.join(DB_ROOT, '_index', safeFileName(name) + '.txt');
        if (!fs.existsSync(filePath)) return {};
        const raw       = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) return {};
        const decrypted = decrypt(raw);
        if (!decrypted) return {};
        return JSON.parse(decrypted);
    } catch (e) {
        console.error(`[DB] Index okuma hatası (${name}):`, e.message);
        return {};
    }
}

/**
 * Index dosyasını yazar (şifreli).
 */
function writeIndex(name, data) {
    try {
        ensureDir(path.join(DB_ROOT, '_index'));
        const filePath = path.join(DB_ROOT, '_index', safeFileName(name) + '.txt');
        fs.writeFileSync(filePath, encrypt(JSON.stringify(data)), 'utf8');
    } catch (e) {
        console.error(`[DB] Index yazma hatası (${name}):`, e.message);
    }
}

// ============================================================
// OTURUM TEMİZLEME — Süresi dolmuş tokenları sil
// ============================================================

/**
 * Süresi dolmuş session dosyalarını temizler.
 * Sunucu başlarken ve periyodik olarak çağrılabilir.
 */
function cleanExpiredSessions() {
    try {
        const dir = path.join(DB_ROOT, 'sessions');
        ensureDir(dir);
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
        let cleaned = 0;
        for (const file of files) {
            const id      = file.replace('.txt', '');
            const session = readRecord('sessions', id);
            if (!session || new Date(session.expiresAt) < new Date()) {
                deleteRecord('sessions', id);
                cleaned++;
            }
        }
        if (cleaned > 0) console.log(`🧹 [DB] ${cleaned} süresi dolmuş oturum temizlendi.`);
    } catch (e) {
        console.error('[DB] Oturum temizleme hatası:', e.message);
    }
}

// ============================================================
// DIŞA AKTAR
// ============================================================
module.exports = {
    initDB,
    writeRecord,
    readRecord,
    deleteRecord,
    listRecords,
    findRecord,
    readIndex,
    writeIndex,
    cleanExpiredSessions,
    // Ham şifreleme (gerekirse)
    encrypt,
    decrypt
};
