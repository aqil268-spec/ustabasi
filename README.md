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

Server kodu (`Code.gs`, `appsscript.json`) bu repo-da saxlanmır. Onu Apps Script redaktoruna əl ilə köçürün.

## Quraşdırma

### 1. Google Sheet və server

1. Google Drive-da boş Google Sheet yaradın. Adı: `Ustabaşı`.
2. **Extensions → Apps Script** açın.
3. `Code.gs` faylının bütün məzmununu redaktora yapışdırın.
4. **Project Settings → Show "appsscript.json"** seçin. `appsscript.json` məzmununu yapışdırın.
5. `Code.gs`-in əvvəlində `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PIN` dəyərlərini yazın.
6. Funksiya siyahısında `setup` seçin, **Run** basın, icazələri verin.
7. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. **Web app URL**-ni kopyalayın (`…/exec` ilə bitir).

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
- Server: `Code.gs`-i dəyişin → **Deploy → Manage deployments → Edit → New version**. URL dəyişmir.

## Hesablama qaydaları (qısa)

- Aylıq: `standart / plan iş günü × işlənmiş gün`. Plan günü admin ay sonunda yazır.
- Günlük: `günlük məbləğ × sayılan gün`. Gün = gəliş və çıxış təsdiqlidir.
- Bonus: sabit ₼ (dərəcəyə görə) və ya smetadakı müştəri qiymətinin faizi; pay bölgüsü ilə.
- Model 3: bütün həcm və ya normadan artıq hissə.
- Ödəniləcək = standart + bonus − avans − cərimə ± korreksiya.
