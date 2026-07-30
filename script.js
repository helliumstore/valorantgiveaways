/* ============================================================
   VALORANT CASEDROP — Frontend Script
   Veritabanı: Şifreli Dosya DB (Node.js backend)
   ============================================================ */

// ============================================================
// API YARDIMCISI
// ============================================================
// Sayfa ister file:// ister Live Server (5500) üzerinden açılsın,
// istekleri her zaman http://localhost:3000 sunucusuna yönlendirir.
const API_BASE = (window.location.origin.includes(':3000')) ? '' : 'http://localhost:3000';

function getToken() { return localStorage.getItem('sessionToken'); }
function setToken(t) { localStorage.setItem('sessionToken', t); }
function clearToken() { localStorage.removeItem('sessionToken'); }

async function apiCall(method, endpoint, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);

    try {
        const res  = await fetch(API_BASE + endpoint, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
        return data;
    } catch (err) {
        if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
            throw new Error('Sunucuya bağlanılamadı. Lütfen Node.js sunucusunun (node server.js) çalıştığından emin olun.');
        }
        throw err;
    }
}

// ============================================================
// DOM
// ============================================================
const track       = document.getElementById('roulette-track');
const openBtn     = document.getElementById('open-btn');
const resultDiv   = document.getElementById('result');
const resultText  = document.getElementById('result-text');
const resultImage = document.getElementById('result-image');
const resultIcon  = document.getElementById('result-icon');
const winClose    = document.getElementById('win-close');
const winSparks   = document.getElementById('win-sparks');

const btnLoginModal    = document.getElementById('btn-login-modal');
const btnRegisterModal = document.getElementById('btn-register-modal');
const btnAdminModal    = document.getElementById('btn-admin-modal');
const btnLogout        = document.getElementById('btn-logout');
const userGreetingEl   = document.getElementById('user-greeting');
const userNameEl       = document.querySelector('.user-name');
const userAvatarEl     = document.querySelector('.user-avatar');

// Profil Modal
const profileModal     = document.getElementById('profile-modal');
const closeProfile     = document.getElementById('close-profile');
const profileAvatarLg  = document.getElementById('profile-avatar-lg');
const profileUsername  = document.getElementById('profile-username');
const profileEmailDisp = document.getElementById('profile-email-display');
const profileLogoutBtn = document.getElementById('profile-logout-btn');

// Riot Bağlama
const riotConnectBtn   = document.getElementById('riot-connect-btn');
const riotBtnText      = document.getElementById('riot-btn-text');
const riotStatusText   = document.getElementById('riot-status-text');
const riotLinkedInfo   = document.getElementById('riot-linked-info');
const riotFormWrap     = document.getElementById('riot-form-wrap');
const riotLinkSave     = document.getElementById('riot-link-save');
const riotLinkCancel   = document.getElementById('riot-link-cancel');
const riotLinkError    = document.getElementById('riot-link-error');
const riotLinkedName   = document.getElementById('riot-linked-name');
const riotLinkedRegion = document.getElementById('riot-linked-region');

// Auth Modal
const authModal    = document.getElementById('auth-modal');
const closeAuth    = document.getElementById('close-auth');
const authForm     = document.getElementById('auth-form');
const authTitle    = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const toggleAuth   = document.getElementById('toggle-auth');
const regFields    = document.getElementById('register-fields');
const authError    = document.getElementById('auth-error');

// Admin Modal
const adminModal   = document.getElementById('admin-modal');
const closeAdmin   = document.getElementById('close-admin');
const adminForm    = document.getElementById('admin-form');
const adminMsg     = document.getElementById('admin-msg');
const itemsUl      = document.getElementById('items-ul');
const tabs         = document.querySelectorAll('.tab-btn');

// ============================================================
// DURUM
// ============================================================
const ITEM_W          = 190;
const POOL_SIZE       = 80;
let currentCategory   = 'vandal';
let isSpinning        = false;
let currentUser       = null;
let isLoginMode       = true;
let activeSkins       = {};

// ============================================================
// YEDEK SKİNLER — Sunucu yokken gösterilir
// ============================================================
const mockSkins = {
    vandal: [
        { id:'m1', name:"Reaver Vandal",    rarity:"purple", icon:"🌌", image:"" },
        { id:'m2', name:"Prime Vandal",     rarity:"gold",   icon:"🐺", image:"" },
        { id:'m3', name:"Glitchpop Vandal", rarity:"gold",   icon:"⚡", image:"" },
        { id:'m4', name:"RGX 11z Pro",      rarity:"red",    icon:"💻", image:"" },
        { id:'m5', name:"Araxys Vandal",    rarity:"gold",   icon:"👽", image:"" },
        { id:'m6', name:"Kuronami Vandal",  rarity:"purple", icon:"⛓️", image:"" },
    ],
    phantom: [
        { id:'p1', name:"Oni Phantom",   rarity:"red",    icon:"👹", image:"" },
        { id:'p2', name:"Ion Phantom",   rarity:"gold",   icon:"⚡", image:"" },
        { id:'p3', name:"Recon Phantom", rarity:"purple", icon:"🪖", image:"" },
        { id:'p4', name:"Prime Phantom", rarity:"gold",   icon:"🐺", image:"" },
    ],
    operator: [
        { id:'o1', name:"Elderflame Operator", rarity:"red",    icon:"🐉", image:"" },
        { id:'o2', name:"Ion Operator",        rarity:"gold",   icon:"⚡", image:"" },
        { id:'o3', name:"Origin Operator",     rarity:"purple", icon:"🌙", image:"" },
    ],
    knife: [
        { id:'k1', name:"Reaver Karambit",   rarity:"gold", icon:"🔪", image:"" },
        { id:'k2', name:"RGX 11z Pro Blade", rarity:"red",  icon:"🗡️", image:"" },
        { id:'k3', name:"Glitchpop Dagger",  rarity:"pink", icon:"💥", image:"" },
    ]
};

// ============================================================
// KULLANICI ARAYÜZÜ
// ============================================================
function applyUserUI(user) {
    currentUser = user;
    btnLoginModal.classList.add('hidden');
    btnRegisterModal.classList.add('hidden');
    btnLogout.classList.add('hidden');
    userGreetingEl.classList.remove('hidden');

    const username = user.email.split('@')[0];
    if (userNameEl)    userNameEl.textContent    = username;
    if (userAvatarEl)  userAvatarEl.textContent  = username[0].toUpperCase();
    if (profileAvatarLg)  profileAvatarLg.textContent  = username[0].toUpperCase();
    if (profileUsername)  profileUsername.textContent  = username;
    if (profileEmailDisp) profileEmailDisp.textContent = user.email;

    if (user.role === 'admin') {
        btnAdminModal.classList.remove('hidden');
    }

    loadRiotInfo();
}

function resetAuthUI() {
    currentUser = null;
    clearToken();
    btnLoginModal.classList.remove('hidden');
    btnRegisterModal.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    btnAdminModal.classList.add('hidden');
    userGreetingEl.classList.add('hidden');
}

// ============================================================
// UYGULAMA BAŞLAT — Oturumu kontrol et
// ============================================================
async function initApp() {
    if (!getToken()) return;
    try {
        const user = await apiCall('GET', '/api/auth/me');
        applyUserUI(user);
    } catch (e) {
        // Token geçersiz veya süresi dolmuş
        clearToken();
    }
}

initApp();
loadSkinsFromDB();

// Şifre Göster/Gizle Toggle
const toggleAuthPassBtn = document.getElementById('toggle-auth-pass');
if (toggleAuthPassBtn) {
    toggleAuthPassBtn.addEventListener('click', () => {
        const passInput = document.getElementById('auth-password');
        if (passInput.type === 'password') {
            passInput.type = 'text';
            toggleAuthPassBtn.style.color = '#ff4655';
        } else {
            passInput.type = 'password';
            toggleAuthPassBtn.style.color = '#6b7280';
        }
    });
}

// ============================================================
// MODAL KONTROL
// ============================================================
btnLoginModal.addEventListener('click',    () => openAuthModal(true));
btnRegisterModal.addEventListener('click', () => openAuthModal(false));
btnAdminModal.addEventListener('click',    () => { adminModal.classList.add('show'); loadAdminItems(); });

userGreetingEl.addEventListener('click', () => profileModal.classList.add('show'));

closeAuth.addEventListener('click',    () => authModal.classList.remove('show'));
closeAdmin.addEventListener('click',   () => adminModal.classList.remove('show'));
closeProfile.addEventListener('click', () => profileModal.classList.remove('show'));

window.addEventListener('click', (e) => {
    if (e.target === authModal)    authModal.classList.remove('show');
    if (e.target === adminModal)   adminModal.classList.remove('show');
    if (e.target === profileModal) profileModal.classList.remove('show');
});

toggleAuth.querySelector('.toggle-link').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    syncAuthUI();
});

function openAuthModal(loginMode) {
    isLoginMode = loginMode;
    syncAuthUI();
    authModal.classList.add('show');
}

function syncAuthUI() {
    authError.textContent = '';
    const submitBtn = document.getElementById('auth-submit');
    if (isLoginMode) {
        authTitle.textContent    = 'Giriş Yap';
        authSubtitle.textContent = 'Hesabına giriş yap';
        if (submitBtn) submitBtn.textContent = 'GİRİŞ YAP';
        toggleAuth.innerHTML = 'Hesabın yok mu? <span class="toggle-link">Kayıt Ol</span>';
        regFields.classList.add('hidden');
    } else {
        authTitle.textContent    = 'Kayıt Ol';
        authSubtitle.textContent = 'Yeni hesap oluştur';
        if (submitBtn) submitBtn.textContent = 'KAYIT OL';
        toggleAuth.innerHTML = 'Zaten hesabın var mı? <span class="toggle-link">Giriş Yap</span>';
        regFields.classList.remove('hidden');
    }
    toggleAuth.querySelector('.toggle-link').addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        syncAuthUI();
    });
}

// ============================================================
// AUTH FORM
// ============================================================
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const refCode  = document.getElementById('auth-refcode')?.value.trim() || '';

    authError.textContent = '';
    const submitBtn = document.getElementById('auth-submit');
    if (submitBtn) { submitBtn.textContent = '...'; submitBtn.disabled = true; }

    try {
        let result;
        if (isLoginMode) {
            result = await apiCall('POST', '/api/auth/login', { email, password });
        } else {
            result = await apiCall('POST', '/api/auth/register', { email, password, refCode });
        }
        setToken(result.token);
        authModal.classList.remove('show');
        applyUserUI(result.user);
    } catch (err) {
        authError.textContent = err.message;
    } finally {
        if (submitBtn) {
            submitBtn.textContent = isLoginMode ? 'GİRİŞ YAP' : 'KAYIT OL';
            submitBtn.disabled    = false;
        }
    }
});

// ============================================================
// ÇIKIŞ
// ============================================================
async function doLogout() {
    try { await apiCall('POST', '/api/auth/logout'); } catch (e) {}
    resetAuthUI();
}

btnLogout.addEventListener('click', doLogout);
profileLogoutBtn.addEventListener('click', () => {
    profileModal.classList.remove('show');
    doLogout();
});

// ============================================================
// RIOT BAĞLAMA — Sunucu üzerinden kalıcı
// ============================================================
async function loadRiotInfo() {
    if (!currentUser || !getToken()) return;
    try {
        const data     = await apiCall('GET', '/api/riot');
        const riotData = data.riotLinked;

        if (riotData) {
            riotBtnText.textContent    = 'BAĞLI ✔';
            riotConnectBtn.classList.add('connected');
            riotStatusText.textContent = riotData.username;
            riotLinkedName.textContent = riotData.username;
            riotLinkedRegion.textContent = riotData.region;
            riotLinkedInfo.classList.remove('hidden');
            riotFormWrap.classList.add('hidden');
        } else {
            riotBtnText.textContent    = 'BAĞLA';
            riotConnectBtn.classList.remove('connected');
            riotStatusText.textContent = 'Eşyayı içeri aktarmak için hesabını bağla';
            riotLinkedInfo.classList.add('hidden');
        }
    } catch (e) {
        console.warn('Riot bilgisi yüklenemedi:', e.message);
    }
}

riotConnectBtn.addEventListener('click', async () => {
    if (riotConnectBtn.classList.contains('connected')) {
        if (confirm('Riot Games hesabını çözmek istiyor musunuz?')) {
            try {
                await apiCall('DELETE', '/api/riot/unlink');
                loadRiotInfo();
            } catch (e) { alert('Hata: ' + e.message); }
        }
    } else {
        window.open('riot-login.html', '_blank');
    }
});

// riot-login.html'den gelen PostMessage → sunucuya kaydet
window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'RIOT_LOGIN') {
        const { riotUsername, region } = event.data.data;
        try {
            await apiCall('POST', '/api/riot/link', { username: riotUsername, region });
            loadRiotInfo();
            profileModal.classList.add('show');
        } catch (e) {
            alert('Riot bağlama hatası: ' + e.message);
        }
    }
});

riotLinkCancel.addEventListener('click', () => riotFormWrap.classList.add('hidden'));

riotLinkSave.addEventListener('click', async () => {
    const username = document.getElementById('riot-username-input').value.trim();
    const region   = document.getElementById('riot-region-input').value;

    if (!username) {
        riotLinkError.textContent = 'Lütfen Riot kullanıcı adınızı girin.';
        return;
    }
    riotLinkError.textContent = '';

    try {
        await apiCall('POST', '/api/riot/link', { username, region });
        riotFormWrap.classList.add('hidden');
        loadRiotInfo();
    } catch (e) {
        riotLinkError.textContent = e.message;
    }
});

// ============================================================
// SKİN LİSTESİ — Sunucudan çek
// ============================================================
async function loadSkinsFromDB() {
    try {
        const items = await apiCall('GET', '/api/items');
        if (items && items.length > 0) {
            const grouped = { vandal: [], phantom: [], operator: [], knife: [] };
            items.forEach(item => {
                if (grouped[item.category]) {
                    grouped[item.category].push({
                        id:     item._id,
                        name:   item.name,
                        rarity: item.rarity,
                        image:  item.image || '',
                        icon:   item.icon  || '✨'
                    });
                }
            });
            activeSkins = grouped;
        } else {
            activeSkins = mockSkins;
        }
    } catch (e) {
        console.warn('Skin listesi alınamadı, yerel liste kullanılıyor. (Sunucu çalışıyor mu?)');
        activeSkins = mockSkins;
    }
    generateTrack(currentCategory);
}

// ============================================================
// ADMIN PANELİ
// ============================================================
adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('admin-category').value;
    const name     = document.getElementById('admin-name').value.trim();
    const rarity   = document.getElementById('admin-rarity').value;
    const image    = document.getElementById('admin-image').value.trim();

    try {
        await apiCall('POST', '/api/items', { category, name, rarity, image });
        showAdminMsg('Veritabanına kaydedildi!', true);
        adminForm.reset();
        loadSkinsFromDB();
        loadAdminItems();
    } catch (err) {
        showAdminMsg('Hata: ' + err.message, false);
    }
});

function showAdminMsg(msg, ok) {
    adminMsg.textContent = msg;
    adminMsg.style.color = ok ? '#2cb67d' : '#ff4655';
    setTimeout(() => adminMsg.textContent = '', 3000);
}

async function loadAdminItems() {
    itemsUl.innerHTML = '<li style="color:#555; text-align:center; padding:.8rem;">Yükleniyor...</li>';
    try {
        const items = await apiCall('GET', '/api/items');
        itemsUl.innerHTML = '';
        if (items.length === 0) {
            itemsUl.innerHTML = '<li style="color:#555; text-align:center; padding:1rem;">Henüz eşya eklenmemiş.</li>';
            return;
        }
        items.forEach(item => {
            const li  = document.createElement('li');
            li.innerHTML = `<span>${item.name} <small style="color:#555;">[${item.category}]</small></span>`;
            const btn = document.createElement('button');
            btn.className   = 'delete-item-btn';
            btn.textContent = 'SİL';
            btn.addEventListener('click', async () => {
                try {
                    await apiCall('DELETE', '/api/items/' + item._id);
                    loadAdminItems();
                    loadSkinsFromDB();
                } catch (err) { alert('Silme hatası: ' + err.message); }
            });
            li.appendChild(btn);
            itemsUl.appendChild(li);
        });
    } catch (err) {
        itemsUl.innerHTML = `<li style="color:#ff4655;">Yüklenemedi: ${err.message}</li>`;
    }
}

// ============================================================
// ROULETTE — TRACK OLUŞTUR
// ============================================================
function generateTrack(cat) {
    track.innerHTML         = '';
    track.style.transition  = 'none';
    track.style.transform   = 'translateX(0px)';

    const pool = (activeSkins[cat] && activeSkins[cat].length) ? activeSkins[cat] : mockSkins[cat];

    for (let i = 0; i < POOL_SIZE; i++) {
        const skin = pool[Math.floor(Math.random() * pool.length)];
        const item = document.createElement('div');
        item.className = `roulette-item ${skin.rarity}`;

        const visual = skin.image
            ? `<img src="${skin.image}" class="item-image" alt="${skin.name}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="item-icon" style="display:none">${skin.icon || '✨'}</div>`
            : `<div class="item-icon">${skin.icon || '✨'}</div>`;

        item.innerHTML = `
            <div class="item-image-container">${visual}</div>
            <div class="item-name">${skin.name}</div>`;

        item.dataset.skinImage = skin.image || '';
        item.dataset.skinIcon  = skin.icon  || '✨';
        track.appendChild(item);
    }
}

// --- TABS ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        if (isSpinning) return;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        generateTrack(currentCategory);
    });
});

// ============================================================
// SPİN
// ============================================================
openBtn.addEventListener('click', () => {
    if (isSpinning) return;
    isSpinning       = true;
    openBtn.disabled = true;

    track.style.transition = 'none';
    track.style.transform  = 'translateX(0px)';
    track.offsetHeight; // reflow

    const container    = document.querySelector('.roulette-frame');
    const containerMid = container.offsetWidth / 2;
    const winIndex     = Math.floor(Math.random() * 15) + 55;
    const randOff      = (Math.random() - 0.5) * (ITEM_W * 0.6);
    const finalX       = -((winIndex * ITEM_W) + ITEM_W / 2 - containerMid + randOff);

    track.style.transition = 'transform 7s cubic-bezier(0.05, 0.95, 0.2, 1)';
    track.style.transform  = `translateX(${finalX}px)`;

    setTimeout(() => {
        const items      = track.querySelectorAll('.roulette-item');
        const winner     = items[winIndex];
        const winName    = winner.querySelector('.item-name').innerText;
        const winImgSrc  = winner.dataset.skinImage;
        const winIconTxt = winner.dataset.skinIcon;
        showWin(winName, winImgSrc, winIconTxt);
    }, 7100);
});

function showWin(name, imgSrc, icon) {
    resultText.textContent = name;

    if (imgSrc) {
        resultImage.src           = imgSrc;
        resultImage.style.display = 'block';
        resultIcon.style.display  = 'none';
    } else {
        resultImage.style.display = 'none';
        resultIcon.style.display  = 'flex';
        resultIcon.textContent    = icon || '🏆';
    }

    winSparks.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const s     = document.createElement('div');
        s.className = 'win-spark';
        const angle = Math.random() * 360;
        const dist  = 100 + Math.random() * 200;
        s.style.cssText = `
            --tx: ${Math.cos(angle) * dist}px;
            --ty: ${Math.sin(angle) * dist}px;
            --dur: ${0.6 + Math.random() * 0.8}s;
            left: 50%; top: 50%;
            background: ${['#ffd700','#ff4655','#7f5af0','#2cb67d'][Math.floor(Math.random() * 4)]};
            animation-delay: ${Math.random() * 0.3}s;
        `;
        winSparks.appendChild(s);
    }

    resultDiv.classList.remove('overlay-hidden');
    resultDiv.classList.add('overlay-show');
}

winClose.addEventListener('click', () => {
    resultDiv.classList.remove('overlay-show');
    resultDiv.classList.add('overlay-hidden');
    isSpinning       = false;
    openBtn.disabled = false;
    generateTrack(currentCategory);
});
