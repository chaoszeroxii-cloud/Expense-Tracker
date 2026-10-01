# ตั้งค่าการเข้าสู่ระบบด้วย Google และ Facebook

หน้าเว็บกับ API อยู่คนละบริการ จึงต้องตั้งค่า env ทั้งสองฝั่ง การมีปุ่มให้เลือกบัญชี
แปลว่าฝั่งหน้าเว็บมี Client ID/App ID แล้ว แต่ไม่ได้ยืนยันว่า Backend ตั้งค่าครบ
ไฟล์ `.env` ในเครื่องและค่าใน Vercel จะไม่ถูกส่งไป Render โดยอัตโนมัติ

## ค่าที่ต้องตั้งตอน deploy

| ฝั่งหน้าเว็บบน Vercel | ฝั่ง Backend บน Render | เอามาจากไหน |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs ของเว็บนี้ ต้องเป็นค่าเดียวกันทั้งสองฝั่ง |
| `VITE_FACEBOOK_APP_ID` | `FACEBOOK_APP_ID` | Meta for Developers → แอปที่ใช้ล็อกอิน → Settings → Basic → App ID ต้องเป็นค่าเดียวกันทั้งสองฝั่ง |
| ไม่ใส่ในหน้าเว็บ | `FACEBOOK_APP_SECRET` | App Secret จากแอป Facebook ตัวเดียวกับ App ID |

`FACEBOOK_APP_SECRET` เก็บเฉพาะ Backend ห้ามตั้งชื่อขึ้นต้นด้วย `VITE_` เพราะจะถูกฝังลงในไฟล์ที่ส่งให้เบราว์เซอร์

สำหรับ Google ให้เลือก OAuth client ที่ตรงกับ `VITE_GOOGLE_CLIENT_ID` ของหน้าเว็บ
ชุด `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` ใช้เชื่อมกล่องจดหมาย เป็นคนละการตั้งค่ากับการล็อกอิน
การเชื่อม Gmail สำเร็จจึงไม่ได้แปลว่าล็อกอิน Google ถูกตั้งค่าแล้ว

1. เปิด Render Dashboard แล้วเลือก **Web Service ของ Backend** → **Environment**
2. เพิ่มหรือแก้ `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
3. เลือก **Save and deploy** หรือ **Save, rebuild, and deploy** แล้วรอ deploy สำเร็จ
   การเลือก Save only ยังไม่ทำให้บริการที่กำลังรันใช้ค่าใหม่
4. ถ้าแก้ `VITE_*` บน Vercel ต้อง redeploy หน้าเว็บด้วย เพราะ Vite อ่านค่าตอน build
5. ลองเข้าสู่ระบบ Google และ Facebook อีกครั้ง ตรวจสอบคำตอบของ
   `POST /api/auth/google/verify` และ `POST /api/auth/facebook/verify` ใน Network
   โดยไม่คัดลอก access token หรือ App Secret ลงในรายงานปัญหา

ดู [เอกสารการตั้งค่า Environment Variables ของ Render](https://render.com/docs/configure-environment-variables)

## ข้อผิดพลาดแต่ละแบบหมายถึงอะไร

| ข้อความจาก API | สิ่งที่ต้องตรวจ |
|---|---|
| `Google sign-in is not configured` | Backend ไม่มี `GOOGLE_CLIENT_ID` |
| `Facebook sign-in is not configured` | Backend ขาด `FACEBOOK_APP_ID` หรือ `FACEBOOK_APP_SECRET` อย่างน้อยหนึ่งค่า |
| `Google token audience mismatch` | Google Client ID ของหน้าเว็บกับ Backend ไม่ตรงกัน |
| `Facebook token was not issued for this app` | การตรวจ token ไม่ผ่าน หรือ token ไม่ได้ออกให้ Facebook App ID ที่ Backend ใช้ |
| `Invalid Google token` / `Invalid Facebook token` | token ใช้ไม่ได้ หรือการติดต่อผู้ให้บริการเพื่อตรวจสอบไม่สำเร็จ; ตรวจค่าและการเชื่อมต่อ Backend ก่อนลองล็อกอินใหม่ |
| HTTP 409 พร้อมคำแนะนำให้ใช้วิธีเดิม | อีเมลมีบัญชีอยู่แล้วด้วยวิธีอื่น ใช้วิธีเดิมหรือ “ลืมรหัสผ่าน?” ระบบไม่ผูกบัญชีเข้าด้วยกันโดยอัตโนมัติ |

หน้าเว็บแสดงคำอธิบายภาษาไทย/อังกฤษสำหรับข้อผิดพลาดที่รู้จัก และเก็บฟอร์มไว้เมื่อ
public auth API ตอบ 401 ส่วน 401 จาก API ที่ต้องมีเซสชัน เช่น `/auth/me` ยังล้างเซสชัน
แล้วกลับไปหน้าล็อกอินตามเดิม

## ข้อความใน Console ที่ต้องแยกจากคำตอบ API

- `ERR_BLOCKED_BY_CLIENT` ที่ `/_vercel/speed-insights/script.js` หมายถึงตัวบล็อกฝั่ง
  เบราว์เซอร์ขัดขวางสคริปต์วัดประสิทธิภาพ สคริปต์นี้ไม่ได้ตรวจบัญชีล็อกอิน
  ดู [Vercel troubleshooting](https://vercel.com/docs/speed-insights/troubleshooting)
- ข้อความเดียวกันที่ Facebook `platform/impression.php` เป็นคำขอรายงานเหตุการณ์ของ SDK
  เพียงบรรทัดนี้ยังบอกไม่ได้ว่าการรับ token สำเร็จหรือไม่ ต้องดูคำขอ `/api/auth/facebook/verify` ด้วย
- `beforeinstallprompt.preventDefault()` เป็นผลจากการเก็บ event ไว้ใช้กับปุ่มติดตั้งของเรา
  `requestAppInstallation()` เรียก `prompt()` เมื่อผู้ใช้กดปุ่ม ไม่ใช่ข้อผิดพลาดการล็อกอิน
- คำเตือน COOP เรื่อง `window.closed` เกี่ยวกับการสื่อสารกับ popup; อย่าสรุปจากข้อความนี้
  เพียงอย่างเดียวว่าเป็นสาเหตุที่ API ปฏิเสธบัญชี ตอนตรวจ production วันที่ 30 กันยายน 2026
  หน้า `/login` ไม่ได้ส่ง COOP หรือ COOP-Report-Only header แต่ API ทั้งสองยังตอบว่าขาดการตั้งค่า
  ถ้าเติม env แล้วไม่เกิดคำขอ verify ให้ตรวจ popup และนโยบายหน้าต่างต่อ ตาม
  [เอกสาร Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#cross_origin_opener_policy)

## บันทึกปัญหาและการทดสอบ

วันที่ 30 กันยายน 2026 ตรวจเว็บ production แล้วพบว่าปุ่มทั้งสองเปิด SDK ได้ แต่ API
ตอบ `sign-in is not configured` ทั้งสอง provider ก่อนเรียกผู้ให้บริการ ข้อความถูก
ซ่อนด้วยข้อความผิดพลาดรวม และตัวจัดการ 401 ฝั่งหน้าเว็บสั่งโหลดหน้าล็อกอินใหม่แม้เป็น
คำขอ public การแก้โค้ดช่วยแสดงสาเหตุและเก็บฟอร์ม ส่วนการเปิดใช้จริงต้องเติม env บน Render

ทดสอบด้วย PostgreSQL แยก, Nest API จริง และ Playwright; จำลองเฉพาะ SDK และ HTTP
ของ Google/Facebook จึงไม่ใช่การยืนยันว่าบัญชีผู้ให้บริการจริงหรือ production ตั้งค่าครบแล้ว

```powershell
docker run --name moneyflow_social_db --rm -d -p 127.0.0.1:15437:5432 -e POSTGRES_USER=expense_user -e POSTGRES_PASSWORD=social-local-only -e POSTGRES_DB=moneyflow_social_test postgres:16-alpine
# รอให้ pg_isready ตอบ accepting connections
docker exec moneyflow_social_db pg_isready -U expense_user -d moneyflow_social_test
npm run test:social-login:e2e --workspace backend
docker stop moneyflow_social_db
```

ชุดทดสอบใช้เฉพาะฐานข้อมูล `moneyflow_social_test` บน loopback port 15437 และไม่อ่าน
`.env` ของโปรเจกต์ ครอบคลุม env ไม่ครบ, รหัสผ่านผิด, token ของแอปอื่น, อีเมลซ้ำ,
provider ไม่ส่งอีเมล, ล็อกอินสำเร็จ/กลับมาใช้ซ้ำ และเซสชันหมดอายุ
