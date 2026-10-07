# Ustabaşı

Təmir ustalarının, sahə rəislərinin və obyektlərin idarəetmə tətbiqi. BRD v0.3 əsasında, dizayn A ("Sahə").

- **Admin (müdir):** dashboard, sahə rəisləri, ustalar, müştəri və obyektlər, təsdiq mərkəzi, pul (avans, ödəniş, xərc, uyğunsuzluq), vedomost, hesabatlar (obyekt nəticəsi), kataloq (normalar), jurnal, ayarlar.
- **Sahə rəisi:** gəliş / çıxış linki, iş qeydi (foto, pay bölgüsü), avans, müştəri ödənişi, xərc (çek şəkli), obyekt (foto, GPS), ustaya ilkin hesabat.
- **Usta və müştəri:** tətbiq yoxdur. WhatsApp-da 1 dəfəlik link alırlar (`u.html`). Link yalnız ilk açılan telefonda işləyir.
  Avans və ödəniş linkində məbləğ görünmür: usta (müştəri) məbləği özü yazır. Uyğun gəlsə qeyd bağlanır və çek (PDF) yaranır, uyğun gəlməsə admin uyğunsuzluğu həll edir.
- **Dillər:** AZ, RU, EN, TR.
- **Oflayn:** internet yoxdursa sahə rəisi iş qeydi, avans sorğusu, xərc və obyekt yaza bilər. Qeydlər telefonda növbədə qalır və internet gələndə göndərilir (ən çox 3 gün). Server yoxlaması lazım olan işlər (linklər, təsdiq, GPS) oflayn işləmir.
- **Data:** Google Sheets. **Server:** Google Apps Script. **Ön tərəf:** bu repo (GitHub Pages).

## Fayllar

| Fayl | Təyinat |
| --- | --- |
| `index.html` | Admin və sahə rəisi tətbiqi |
| `u.html` | Ustanın link səhifəsi |
| `config.js` | Server ünvanı (`API_URL`). Ehtiyat nüsxə: `assets/core.js` → `DEFAULT_API` |
| `assets/` | Kod, stil, tərcümələr |
| `sw.js`, `manifest.webmanifest`, `icons/` | Chrome-da "tətbiq kimi" açılış |
| `server/Code.gs` | Server kodu (Google Apps Script) |

## Quraşdırma

### 1. Server (telefondan da olur)

1. Chrome-da [script.google.com](https://script.google.com) açın → **New project** (və ya yaratdığınız layihəni açın).
   Redaktor telefonda düzgün açılmırsa: Chrome menyusu → **Desktop site** (Kompüter versiyası).
2. Kodu kopyalayın: [server/Code.gs (raw)](https://raw.githubusercontent.com/aqil268-spec/ustabasi/main/server/Code.gs) → səhifəyə uzun basın → **Hamısını seç** → **Kopyala**.
3. Redaktorda `Code.gs` içindəki hər şeyi silin, kodu yapışdırın.
4. Kodun əvvəlində 3 sətri dəyişin: `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD`. **Save** basın.
5. Yuxarıda funksiya siyahısında `setup` seçin → **Run**.
   İcazə pəncərəsi: **Review permissions** → hesabınız → **Advanced** → **Go to … (unsafe)** → **Allow**.
   `setup` "Ustabaşı — data" adlı Google Sheet-i özü yaradır. Linki **Execution log**-da görünür.
   `setup` 5 avtomatik işi (trigger) də qurur — bax "Avtomatik işlər".
6. **Deploy → New deployment** → ⚙ → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. **Deploy** basın və **Web app URL**-ni kopyalayın (`…/exec` ilə bitir).

`appsscript.json` lazım deyil. Saat qurşağı kodun içindədir (Asia/Baku).
Kod Sheet-ə bağlı layihədə (Sheet → Extensions → Apps Script) də işləyir.

### 2. Tətbiq

1. `config.js` faylında `API_URL` sahəsinə Web app URL-ni yazın. Giriş ekranında server ünvanı soruşulmur.
2. Repo → **Settings → Pages → Deploy from a branch → `main` / root**.
3. Link: `https://aqil268-spec.github.io/ustabasi/`
4. Telefonda Chrome-da açın → menyu → **Ana ekrana əlavə et**.

### 3. İlk addımlar

1. Admin telefonu və `ADMIN_PASSWORD` ilə daxil olun. Tətbiq dərhal yeni şifrə tələb edir.
2. **Kataloq**: iş növlərinin tariflərini və **normalarını** (aylıq və ya günlük norma, həcm) yazın. Bonus normaya görə hesablanır.
3. **Sahə rəisləri**, **Ustalar**, **Müştərilər və obyektlər** əlavə edin. Sahə rəisinə müvəqqəti şifrə verin: ilk girişdə o, yeni şifrə yaradır.
4. Sahə rəisi obyektin şəklini çəkir və koordinatı yazır. Admin obyekti təsdiq edir.

### Şifrə qaydaları

- Ən azı 8 simvol: 1 böyük hərf, 1 kiçik hərf, 1 rəqəm, 1 işarə (məs. `#`, `!`).
- 5 səhv cəhddən sonra hesab 15 dəqiqə bağlanır. Admin **Ayarlar → Kilidi aç** ilə aça bilər.
- Şifrə dəyişəndə və ya sıfırlananda bütün açıq sessiyalar bağlanır.

### 4. Admin girişi (telefon və şifrə)

İlk admin `setup` zamanı kodun əvvəlindəki `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD` dəyərləri ilə yaradılır.
`ADMIN_PASSWORD` müvəqqəti şifrədir: ilk girişdə yenisi yaradılır.
Telefonu dəyişmək üçün (və ya şifrə unudulanda):

1. Kodun əvvəlində `ADMIN_PHONE` və `ADMIN_PASSWORD`-u yazın → **Save**.
2. Funksiya siyahısında `setAdminLogin` seçin → **Run**.

`setAdminLogin` nümunə dəyərlərlə (`994500000000` / `Ustabasi#2026`) işləmir — səhvən sıfırlanmasın deyə.

### 5. Avtomatik işlər

`setup` bunları özü qurur (Apps Script → **Triggers** ⏰ bölməsində görünür):

| Funksiya | Nə vaxt | Nə edir |
| --- | --- | --- |
| `onSheetChange` | Sheet əl ilə dəyişəndə | Keşi yeniləyir — tətbiq dəyişikliyi dərhal görür |
| `dailyBackup` | Hər gecə 02:00 | Sheet-in surəti "Ustabaşı — ehtiyat surətləri" qovluğuna; son 14 surət qalır |
| `cleanup` | Hər gecə 03:00 | Köhnə sessiya və linkləri silir; köhnə qeydləri "Ustabaşı — arxiv" Sheet-inə köçürür |
| `hourly` | Hər saat | Vaxtı bitən linkləri bağlayır (avans və ödəniş linkləri "Link vaxtı bitdi" olur) |
| `weeklyMail` | 7 gündən bir, 04:00 | Sheet-in Excel surətini e-poçta göndərir (Ayarlar-dakı ehtiyat e-poçtu və ya sizin hesab) |

`weeklyMail` üçün Google 2 yeni icazə soruşur: xarici sorğu (UrlFetch) və e-poçt (Mail). **Allow** basın.

Arxivə köçən: davamiyyət 150 gündən köhnə, GPS rədd cəhdləri 90 gündən, audit 60 gündən köhnə.
Vedomost üçün lazım olan qeydlər (iş, avans, vedomost) silinmir.

## Sürət

- Server hər vərəqi Google keşində (CacheService) saxlayır. Təkrar sorğularda Sheet oxunmur: serverdəki iş ~2 san-dan ~0.1 san-a düşür.
  Üstəgəl Google-un öz yolu (yönləndirmə, internet) — adətən 0.5–1.5 san.
- Tətbiq son datanı telefonda saxlayır: dərhal açılır, təzə data arxa planda gəlir ("Yenilənir…"). Çıxışda silinir.
- Telefona yalnız lazım olan data gedir: davamiyyət 3 gün, iş qeydləri 14 gün, avanslar 40 gün + açıq qeydlər.
  Ayın cəmləri serverdə hesablanır.
- Google serveri bir müddət istifadə olunmayanda "soyuq" başlayır: ilk sorğu 1–3 san. Bu Google-un xüsusiyyətidir.
  Giriş ekranı açılan kimi server "oyadılır".
- **Ayarlar → Sürət yoxlaması**: vaxtın harada getdiyini göstərir (server, internet, keş).
- Sheet-də əl ilə dəyişiklik edəndən sonra tətbiq köhnə datanı göstərirsə: Apps Script-də `clearCache` → **Run**.

## Kodu dəyişəndə

- Ön tərəf: faylları dəyişin; `index.html` və `u.html`-də `?v=` versiyasını, `sw.js`-də `V`-ni artırın.
- Server: `server/Code.gs`-i Apps Script-ə yenidən köçürün → **Save** → `ADMIN_*` dəyərlərini yoxlayın →
  `setup` → **Run** (yeni icazələr soruşula bilər) → **Deploy → Manage deployments → Edit (qələm) → Version: New version → Deploy**.
  URL dəyişmir. Yoxlama: `…/exec` linkini açın — `"version":"0.3.0"` görünməlidir.

### v0.2 → v0.3 keçidi

- `setup` köhnə datanı özü çevirir (bir dəfə): verilmiş avanslar və statussuz ödənişlər "Bağlandı" olur. Sütunlar yalnız sona əlavə olunur.
- Köhnə PIN ilə giriş bir dəfə işləyir, sonra tətbiq yeni şifrə tələb edir.
- Ustanın köhnə bonus sahələri (₼ və %) artıq istifadə olunmur. **Kataloq**-da hər iş növü üçün norma yazın.

## Hesablama qaydaları (qısa)

- Aylıq: `standart / plan iş günü × işlənmiş gün`. Plan günü admin ay sonunda yazır.
- Günlük: `günlük məbləğ × sayılan gün`. Gün = gəliş və çıxış təsdiqlidir.
- Bonus (hər iş növü üçün ayrıca, sonra cəmlənir): `baza × (fakt − norma) / norma`. Nümunə: norma 230, fakt 340 → bazanın 47,83%-i.
  Aylıq norma: baza = aylıq standart. Günlük norma: baza = günlük məbləğ, norma = günlük norma × işlənmiş gün.
- Sahə rəisinin bonusu: ustalarının bonusunun faizi.
- Gecikmə: tam gün, yarım gün və ya saata görə tutulur (Ayarlar).
- Ay bağlananda açıq pul sənədləri (avans, ödəniş, uyğunsuzluq) varsa, bağlanmır: siyahı göstərilir.
- Ödəniləcək = standart + bonus − avans − cərimə ± korreksiya.
