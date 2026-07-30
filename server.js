/* ============================================================
   CASEDROP — Express REST API Sunucusu
   
   Başlatmak için:
     npm install
     node server.js
   
   Çalışıyor: http://localhost:3000
   ============================================================ */

'use strict';

require('dotenv').config();

const express    = require('express');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const db         = require('./db');

const app        = express();
const PORT       = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN_CODE_EKSIK';

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Statik dosyaları sun (index.html, style.css, script.js vb.)
app.use(express.static(path.join(__dirname)));

// ============================================================
// VERİTABANI & OTURUM BAKIM
// ============================================================
db.initDB();

// Her 60 dakikada bir süresi dolmuş oturumları temizle
db.cleanExpiredSessions();
setInterval(() => db.cleanExpiredSessions(), 60 * 60 * 1000);

// ============================================================
// TOKEN OLUŞTUR — UUID + rastgele 32 byte
// ============================================================
function generateToken() {
    return uuidv4() + '-' + crypto.randomBytes(32).toString('hex');
}

// ============================================================
// AUTH MİDDLEWARE — Her istek için token doğrulama
// ============================================================
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    }

    const token   = authHeader.substring(7);
    const session = db.readRecord('sessions', token);

    if (!session) {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum. Lütfen tekrar giriş yapın.' });
    }

    if (new Date(session.expiresAt) < new Date()) {
        db.deleteRecord('sessions', token);
        return res.status(401).json({ error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' });
    }

    req.user  = session;
    req.token = token;
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekiyor.' });
    }
    next();
}

// ============================================================
// ─── AUTH ───────────────────────────────────────────────────
// ============================================================

// POST /api/auth/register — Kayıt ol
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, refCode } = req.body;

        if (!email || !password)    return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
        if (password.length < 6)    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
        if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });

        // E-posta zaten kayıtlı mı?
        const emailIndex = db.readIndex('email_to_userid');
        const existingId = emailIndex[email.toLowerCase()];
        if (existingId && db.readRecord('users', existingId)) {
            return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
        }

        const role         = (refCode && refCode === ADMIN_CODE) ? 'admin' : 'user';
        const passwordHash = await bcrypt.hash(password, 12);
        const userId       = uuidv4();

        // Kullanıcı kaydı oluştur
        db.writeRecord('users', userId, {
            email:        email.toLowerCase(),
            passwordHash,
            role,
            riotLinked:   null,
            createdAt:    new Date().toISOString()
        });

        // Email → userId index güncelle
        emailIndex[email.toLowerCase()] = userId;
        db.writeIndex('email_to_userid', emailIndex);

        // Oturum token'i oluştur (7 gün geçerli)
        const token     = generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.writeRecord('sessions', token, { userId, email: email.toLowerCase(), role, expiresAt });

        console.log(`✅ [AUTH] Kayıt: ${email} (${role})`);
        res.json({ token, user: { email: email.toLowerCase(), role } });

    } catch (e) {
        console.error('[AUTH] Register hatası:', e);
        res.status(500).json({ error: 'Kayıt sırasında sunucu hatası oluştu.' });
    }
});

// POST /api/auth/login — Giriş yap
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });

        // Kullanıcıyı bul
        const emailIndex = db.readIndex('email_to_userid');
        const userId     = emailIndex[email.toLowerCase()];

        // Güvenli: kullanıcı bulunsun ya da bulunmasın aynı sürede cevap ver
        const user = userId ? db.readRecord('users', userId) : null;
        const fakeHash = '$2a$12$fakefakefakefakefakefakefakefakefakefakefakefak'; // timing attack önleme
        const valid = user
            ? await bcrypt.compare(password, user.passwordHash)
            : await bcrypt.compare(password, fakeHash).then(() => false);

        if (!user || !valid) {
            return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
        }

        // Oturum token'i oluştur
        const token     = generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.writeRecord('sessions', token, { userId, email: user.email, role: user.role, expiresAt });

        console.log(`✅ [AUTH] Giriş: ${user.email}`);
        res.json({ token, user: { email: user.email, role: user.role } });

    } catch (e) {
        console.error('[AUTH] Login hatası:', e);
        res.status(500).json({ error: 'Giriş sırasında sunucu hatası oluştu.' });
    }
});

// POST /api/auth/logout — Çıkış yap
app.post('/api/auth/logout', authenticate, (req, res) => {
    db.deleteRecord('sessions', req.token);
    console.log(`👋 [AUTH] Çıkış: ${req.user.email}`);
    res.json({ success: true });
});

// GET /api/auth/me — Oturumu kontrol et
app.get('/api/auth/me', authenticate, (req, res) => {
    const user = db.readRecord('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    res.json({
        email:      user.email,
        role:       user.role,
        riotLinked: user.riotLinked || null
    });
});

// ============================================================
// ─── RIOT BAĞLAMA ───────────────────────────────────────────
// ============================================================

// GET /api/riot — Riot bağlama bilgisi
app.get('/api/riot', authenticate, (req, res) => {
    const user = db.readRecord('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    res.json({ riotLinked: user.riotLinked || null });
});

// POST /api/riot/link — Riot hesabı bağla
app.post('/api/riot/link', authenticate, (req, res) => {
    try {
        const { username, region } = req.body || {};

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Riot kullanıcı adı zorunludur.' });
        }

        const user = db.readRecord('users', req.user.userId);
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        user.riotLinked = {
            username: username.trim(),
            region: (typeof region === 'string' && region.trim()) ? region.trim() : 'TR'
        };
        db.writeRecord('users', req.user.userId, user);

        console.log(`🎮 [RIOT] Bağlandı: ${req.user.email} → ${username}`);
        res.json({ success: true, riotLinked: user.riotLinked });
    } catch (e) {
        console.error('[RIOT] Link hatası:', e);
        res.status(500).json({ error: 'Riot hesabı bağlanırken bir hata oluştu.' });
    }
});

// DELETE /api/riot/unlink — Riot bağlantısını kaldır
app.delete('/api/riot/unlink', authenticate, (req, res) => {
    try {
        const user = db.readRecord('users', req.user.userId);
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        user.riotLinked = null;
        db.writeRecord('users', req.user.userId, user);

        console.log(`🔗 [RIOT] Bağlantı kaldırıldı: ${req.user.email}`);
        res.json({ success: true });
    } catch (e) {
        console.error('[RIOT] Unlink hatası:', e);
        res.status(500).json({ error: 'Riot bağlantısı kaldırılırken bir hata oluştu.' });
    }
});

// ============================================================
// ─── WHEEL ITEMS ─────────────────────────────────────────────
// ============================================================

// GET /api/items — Tüm skinleri getir (opsiyonel: ?category=vandal)
app.get('/api/items', (req, res) => {
    try {
        let items = db.listRecords('wheel_items');
        if (req.query.category) {
            items = items.filter(i => i.category === req.query.category);
        }
        // Hassas alanları temizle
        items = items.map(({ _id, name, category, rarity, image, icon }) =>
            ({ _id, name, category, rarity, image: image || '', icon: icon || '✨' })
        );
        res.json(items);
    } catch (e) {
        console.error('[ITEMS] Get hatası:', e);
        res.status(500).json({ error: 'Skin listesi alınamadı.' });
    }
});

// POST /api/items — Skin ekle (sadece admin)
app.post('/api/items', authenticate, requireAdmin, (req, res) => {
    try {
        const { category, name, rarity, image } = req.body || {};

        if (!category || !name || !rarity) {
            return res.status(400).json({ error: 'Kategori, ad ve nadirlik zorunludur.' });
        }

        const validCategories = ['vandal', 'phantom', 'operator', 'knife'];
        const validRarities   = ['gold', 'red', 'purple', 'pink'];

        if (!validCategories.includes(category)) return res.status(400).json({ error: 'Geçersiz kategori.' });
        if (!validRarities.includes(rarity))     return res.status(400).json({ error: 'Geçersiz nadirlik.' });

        const itemId = uuidv4();
        const item   = {
            category,
            name:      name.toString().trim(),
            rarity,
            image:     image || '',
            icon:      image ? '' : '✨',
            createdAt: new Date().toISOString()
        };

        db.writeRecord('wheel_items', itemId, item);

        console.log(`➕ [ITEMS] Eklendi: ${name} [${category}/${rarity}] by ${req.user.email}`);
        res.json({ _id: itemId, ...item });
    } catch (e) {
        console.error('[ITEMS] Add hatası:', e);
        res.status(500).json({ error: 'Skin eklenirken bir hata oluştu.' });
    }
});

// DELETE /api/items/:id — Skin sil (sadece admin)
app.delete('/api/items/:id', authenticate, requireAdmin, (req, res) => {
    try {
        const deleted = db.deleteRecord('wheel_items', req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Eşya bulunamadı.' });

        console.log(`🗑️ [ITEMS] Silindi: ${req.params.id} by ${req.user.email}`);
        res.json({ success: true });
    } catch (e) {
        console.error('[ITEMS] Delete hatası:', e);
        res.status(500).json({ error: 'Skin silinirken bir hata oluştu.' });
    }
});

// ============================================================
// ─── HATA YAKALAMA ───────────────────────────────────────────
// ============================================================
app.use((err, req, res, next) => {
    console.error('[SERVER] Beklenmeyen hata:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
});

// 404
app.use((req, res) => {
    // Sadece API istekleri için 404 JSON döndür, diğerleri için index.html
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint bulunamadı.' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Global Hata Koruyucuları (Sunucunun çökmesini engeller)
process.on('uncaughtException', (err) => {
    console.error('🔥 [KRİTİK HATA] Yakalanmamış İstisna (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [KRİTİK HATA] Yakalanmamış Rejection (unhandledRejection):', reason);
});

// ============================================================
// ─── SUNUCU BAŞLAT ───────────────────────────────────────────
// ============================================================
const server = app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║      CASEDROP Sunucu Başlatıldı          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  URL  : http://localhost:${PORT}             ║`);
    console.log(`║  DB   : ${path.join(__dirname, 'db')}  ║`);
    console.log('╚══════════════════════════════════════════╝\n');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ [HATA] Port ${PORT} şu an zaten kullanımda!`);
        console.error(`   Açık kalan eski 'node server.js' sürecini kapatın veya Görev Yöneticisinden node.exe sonlandırın.\n`);
    } else {
        console.error('[SERVER ERROR]', err);
    }
});
