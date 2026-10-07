# Master — Node.js + PostgreSQL server

Bu qovluq `server/Code.gs`-i Google-dan kənarda işə salır. Biznes məntiqi dəyişmir: eyni `Code.gs` faylı işləyir.

- **Data:** PostgreSQL. Hər vərəq üçün `app` sxemində SQL görünüşü (view) var: `app."Users"`, `app."Sites"`, `app."Advances"` və s.
- **Fotolar və PDF:** PostgreSQL-də (`gas_files`). Link: `<server>/files/<id>/<ad>`.
- **Ehtiyat surəti:** hər gecə 02:00 (Bakı vaxtı), son 14 gün saxlanır (`gas_files`, `application/json`). Linki yoxdur — yalnız SQL ilə.
- **Avtomatik işlər:** `hourly` (hər saat), `dailyBackup` (02:00), `cleanup` (03:00).
- **Həftəlik e-poçt (`weeklyMail`) işləmir.** Google-un Excel eksportu yoxdur.
- **API:** Apps Script ilə eyni. `POST /` (JSON mətn) → JSON cavab. `GET /` → versiya. `GET /health` → yoxlama.

## Mühit dəyişənləri

| Ad | Təyinat |
| --- | --- |
| `DATABASE_URL` | PostgreSQL ünvanı (məcburi) |
| `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ADMIN_NAME` | İlk admin (yalnız ilk başlanğıcda istifadə olunur) |
| `PUBLIC_URL` | Serverin ünvanı. Render-də avtomatik təyin olunur (`RENDER_EXTERNAL_URL`) |
| `ADMIN_RESET` | Admin şifrəsini sıfırlamaq üçün istənilən söz (aşağıya bax) |
| `ADMIN_EMAIL` | İstəyə görə |

## Xidmət funksiyaları (`/admin`)

Apps Script redaktorundakı "Run" əvəzinə: `<server>/admin` səhifəsini açın, admin kimi daxil olun.

| Düymə | Funksiya |
| --- | --- |
| Test data yaz | `seedTestData` |
| Test datanı sil | `removeTestData` |
| Keşi sıfırla | `clearCache` |
| Vaxtı keçən linklər | `hourly` |
| Təmizləmə | `cleanup` |
| Ehtiyat surəti | `dailyBackup` |

Yalnız admin işə sala bilər, şifrəni dəyişməmiş admin isə yox. `setup` və `setAdminLogin` bu siyahıda yoxdur: `setup` server başlayanda özü işləyir, admin şifrəsi aşağıdakı yolla sıfırlanır.

## Admin şifrəsini sıfırlamaq

Apps Script-dəki `setAdminLogin` əvəzinə:

1. Render → `master-server` → **Environment**.
2. `ADMIN_PASSWORD` — yeni müvəqqəti şifrə (8+ simvol, böyük və kiçik hərf, rəqəm, işarə).
3. `ADMIN_RESET` — **yeni** istənilən söz (məs. `reset-1`, növbəti dəfə `reset-2`).
4. `ADMIN_PHONE` və `ADMIN_NAME` — admin telefonu və adı (yazılmasa: `994500000000`, `Admin`).
5. **Save, rebuild and deploy**.

Server başlayanda admin girişini bir dəfə yazır, bütün admin sessiyalarını bağlayır. İlk girişdə yeni şifrə tələb olunur.
Eyni söz ilə təkrar deploy sıfırlamanı təkrarlamır.

## Superadmin paneli (`/super`) — çox şirkət

Yalnız `SUPERADMIN_PASSWORD` olan serverdə işləyir (idarəetmə serveri). Şirkət serverlərində bu dəyişən yoxdur — onlarda `/super` 404 verir və superadmin haqqında heç nə yoxdur.

| Dəyişən | Təyinat |
| --- | --- |
| `SUPERADMIN_PASSWORD` | Panel şifrəsi |
| `RENDER_API_KEY` | Render → Account Settings → API Keys |
| `RENDER_OWNER_ID` | Render workspace id (`tea-…`) |
| `COMPANY_BRANCH` | Şirkət serverlərinin branch-ı (standart: `node-server`) |

"Şirkət yarat" hər şirkət üçün Render-də 1 PostgreSQL və 1 server yaradır. Server tətbiqi özü verir (`SERVE_APP=1`): tətbiq `https://<server>/`, API `https://<server>/api`, xidmət səhifəsi `/admin`.
Panel: şirkətin admin girişi, baza URL-ləri, deploy statusu, admin şifrəsini sıfırlamaq, domen bağlamaq, bütün şirkətləri yeniləmək.
Şirkətlərin siyahısı idarəetmə serverinin bazasında (`ctl_companies`) saxlanır.

## Lokal işə salmaq

```
cd server/node
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/master npm start
```

## Test

```
cd server/node
node test.js                                   # yalnız yaddaşda
TEST_DATABASE_URL=postgres://... node test.js  # PostgreSQL-ə yazır və geri oxuyur
```

`tests/` qovluğundakı server testləri (`flow`, `payroll`, `sec`, `seed`) bu runtime-da işləyir.

## Render

- Build: `cd server/node && npm install --omit=dev`
- Start: `node server/node/index.js`
- Yalnız **1 instansiya** işləməlidir (sorğular növbə ilə işləyir, data yaddaşda saxlanır).

Tətbiqi yeni serverə keçirmək üçün `config.js` → `API_URL` sahəsinə server ünvanını yazın.
