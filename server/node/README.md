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

## Admin şifrəsini sıfırlamaq

Apps Script-dəki `setAdminLogin` əvəzinə:

1. Render → `master-server` → **Environment**.
2. `ADMIN_PASSWORD` — yeni müvəqqəti şifrə (8+ simvol, böyük və kiçik hərf, rəqəm, işarə).
3. `ADMIN_RESET` — **yeni** istənilən söz (məs. `reset-1`, növbəti dəfə `reset-2`).
4. `ADMIN_PHONE` və `ADMIN_NAME` — admin telefonu və adı (yazılmasa: `994500000000`, `Admin`).
5. **Save, rebuild and deploy**.

Server başlayanda admin girişini bir dəfə yazır, bütün admin sessiyalarını bağlayır. İlk girişdə yeni şifrə tələb olunur.
Eyni söz ilə təkrar deploy sıfırlamanı təkrarlamır.

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
