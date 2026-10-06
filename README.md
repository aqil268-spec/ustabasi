# Ustabaşı

Təmir ustalarının, prarabların və obyektlərin idarəetmə tətbiqi. BRD v0.2 əsasında, dizayn A ("Sahə").

- **Admin (müdir):** dashboard, prarablar, ustalar, müştəri və obyektlər, təsdiq mərkəzi, vedomost, hesabatlar, kataloq, ayarlar.
- **Prarab:** gəliş / çıxış linki, iş qeydi (foto, pay bölgüsü), avans sorğusu və çek, ustaya ilkin hesabat, obyekt.
- **Usta:** tətbiq yoxdur. WhatsApp-da 1 dəfəlik link alır (`u.html`), GPS ilə təsdiq edir.
- **Dillər:** AZ, RU, EN.
- **Data:** Google Sheets. **Server:** Google Apps Script. **Ön tərəf:** bu repo (GitHub Pages).

## Fayllar

| Fayl | Təyinat |
| --- | --- |
| `index.html` | Admin və prarab tətbiqi |
| `u.html` | Ustanın link səhifəsi |
| `config.js` | Server ünvanı (`API_URL`) |
| `assets/` | Kod, stil, tərcümələr |
| `sw.js`, `manifest.webmanifest`, `icons/` | Chrome-da "tətbiq kimi" açılış |
| `server/Code.gs` | Server kodu (Google Apps Script) |

## Quraşdırma

### 1. Server (telefondan da olur)

1. Chrome-da [script.google.com](https://script.google.com) açın → **New project** (və ya yaratdığınız layihəni açın).
   Redaktor telefonda düzgün açılmırsa: Chrome menyusu → **Desktop site** (Kompüter versiyası).
2. Kodu kopyalayın: [server/Code.gs (raw)](https://raw.githubusercontent.com/aqil268-spec/ustabasi/main/server/Code.gs) → səhifəyə uzun basın → **Hamısını seç** → **Kopyala**.
3. Redaktorda `Code.gs` içindəki hər şeyi silin, kodu yapışdırın.
4. Kodun əvvəlində 3 sətri dəyişin: `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PIN`. **Save** basın.
5. Yuxarıda funksiya siyahısında `setup` seçin → **Run**.
   İcazə pəncərəsi: **Review permissions** → hesabınız → **Advanced** → **Go to … (unsafe)** → **Allow**.
   `setup` "Ustabaşı — data" adlı Google Sheet-i özü yaradır. Linki **Execution log**-da görünür.
6. **Deploy → New deployment** → ⚙ → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. **Deploy** basın və **Web app URL**-ni kopyalayın (`…/exec` ilə bitir).

`appsscript.json` lazım deyil. Saat qurşağı kodun içindədir (Asia/Baku).
Kod Sheet-ə bağlı layihədə (Sheet → Extensions → Apps Script) də işləyir.

### 2. Tətbiq

1. `config.js` faylında `API_URL` sahəsinə Web app URL-ni yazın. Alternativ: giriş ekranında "Server ünvanı" sahəsinə yazın.
2. Repo → **Settings → Pages → Deploy from a branch → `main` / root**.
3. Link: `https://aqil268-spec.github.io/ustabasi/`
4. Telefonda Chrome-da açın → menyu → **Ana ekrana əlavə et**.

### 3. İlk addımlar

1. Admin telefonu və PIN ilə daxil olun. **Ayarlar**-da PIN-i dəyişin.
2. **Kataloq**: iş növlərinin tariflərini yazın.
3. **Prarablar**, **Ustalar**, **Müştərilər və obyektlər** əlavə edin.
4. Prarab obyektin içində "Mənim yerim" basaraq koordinatı yazır. Admin obyekti təsdiq edir.

### 4. Gündəlik avtomatika (məsləhətdir)

Apps Script → **Triggers → Add trigger**:

- `dailyBackup` — hər gün, gecə. Sheet-in surətini Drive qovluğuna çıxarır.
- `cleanup` — həftədə 1 dəfə. Köhnə sessiyaları silir.

## Kodu dəyişəndə

- Ön tərəf: faylları dəyişin, `index.html`-də `?v=` versiyasını və `sw.js`-də `CACHE` adını artırın.
- Server: `server/Code.gs`-i Apps Script-ə yenidən köçürün → **Deploy → Manage deployments → Edit (qələm) → Version: New version → Deploy**. URL dəyişmir.

## Hesablama qaydaları (qısa)

- Aylıq: `standart / plan iş günü × işlənmiş gün`. Plan günü admin ay sonunda yazır.
- Günlük: `günlük məbləğ × sayılan gün`. Gün = gəliş və çıxış təsdiqlidir.
- Bonus: sabit ₼ (dərəcəyə görə) və ya smetadakı müştəri qiymətinin faizi; pay bölgüsü ilə.
- Model 3: bütün həcm və ya normadan artıq hissə.
- Ödəniləcək = standart + bonus − avans − cərimə ± korreksiya.
