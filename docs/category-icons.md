# ใช้ไอคอนหมวดหมู่ที่ไม่ได้อยู่ในปุ่มแนะนำ

1. ไปที่ **ตั้งค่า → หมวดหมู่** แล้วเพิ่มหรือแก้ไขหมวด
2. ในช่อง **ใช้ไอคอน MDI อื่น** วางรหัส เช่น `mdi:train`, `mdi-train`,
   `train` หรือ `mdiAccountCashOutline`
3. รอข้อความ **ใช้ไอคอนนี้ได้** พร้อมรูปตัวอย่าง แล้วกดบันทึกหมวด

เลือกชื่อได้จาก [คลัง Material Design Icons](https://pictogrammers.com/library/mdi/)
รองรับ 7,447 ไอคอนจาก `@mdi/js` เวอร์ชัน `7.4.47` ที่ติดตั้งในโปรเจกต์
บางไอคอนที่เพิ่งเพิ่มในเว็บไซต์อาจยังไม่มีในเวอร์ชันนี้ ระบบจะแจ้งเมื่อไม่พบชื่อ
ถ้าจะกลับไปใช้ไอคอนเดิม กดปุ่มไอคอนแนะนำได้เลย

ช่องนี้รับชื่อไอคอน MDI ไม่รับโค้ด HTML, SVG, URL รูป หรือรหัสของชุดไอคอนอื่น
ชื่อที่ไม่ถูกต้องจะไม่ถูกบันทึก และการโหลดไม่สำเร็จจะมีปุ่มให้ลองใหม่
ไอคอนที่บันทึกแล้วจะแสดงในรายการหมวดหมู่ หน้าจดรายการ ประวัติ และหน้าที่ใช้
`IconDisplay` โดยใช้สีที่กำหนดให้หมวดนั้น

## การโหลดและการดีพลอย

- ไอคอนแนะนำและข้อมูลเดิมยังใช้ได้เหมือนเดิม
- Vite สร้างคลังไอคอนจากแพ็กเกจที่ติดตั้ง แบ่งเป็น 26 กลุ่มตามตัวอักษรแรก
  แล้วโหลดกลุ่มที่ต้องใช้จากเว็บ MoneyFlow เอง ไม่ส่งข้อมูลผู้ใช้ไปบริการไอคอน
  และไม่ใส่คลังทั้งหมดไว้ใน JavaScript หน้าแรก
- PWA เก็บไฟล์ JSON ไอคอนที่เคยโหลดแล้วใน cache เฉพาะ สูงสุด 26 กลุ่ม อายุ 30 วัน
  ไอคอนกลุ่มที่ยังไม่เคยโหลดต้องใช้อินเทอร์เน็ตครั้งแรก
- Backend ตรวจชื่อกับคลังเดียวกัน เก็บชื่อ export เช่น `mdiTrain` ในคอลัมน์
  `categories.icon` เดิม ไม่เก็บ SVG ที่ผู้ใช้ส่งมา
- ฟีเจอร์ไอคอนไม่ต้องเพิ่ม env หรือ migration ใหม่ แต่ต้องติดตั้ง dependency
  และ build ทั้ง frontend/backend ให้เป็นรุ่นเดียวกันก่อนดีพลอย
  migration ของรหัสหมวดในบันทึกช่วยจำจากงานก่อนหน้ายังต้องรันตามปกติ

## Verification

- `npm run test:mdi-icons --workspace backend` checks every catalog export, accepted
  input formats, legacy presets/emoji, invalid names, URLs, markup and prototype keys.
- `npm run test:bank-mail:e2e --workspace backend` also covers real category APIs,
  code preview/edit/save/reload/history, stale responses, error retry, mobile/desktop,
  lazy production assets and the service-worker icon cache. Build the frontend
  first; run with the disposable database described in `gmail-bank-import.md`.
