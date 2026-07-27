# MoneyFlow — แผนปรับปรุงให้ตอบโจทย์ผู้ใช้จริง

> วันที่: 27 กรกฎาคม 2026 · branch `v2`
> ที่มา: ระดมสมองร่วมระหว่าง Claude (Opus 5) และ Codex (GPT-5.6-sol, xhigh) + งานวิจัยด้าน retention/behavioral finance
> ทุกข้อในหมวด "บั๊ก" ตรวจสอบยืนยันกับโค้ดจริงแล้ว

## สถานะการส่งมอบ

| ชุด | สถานะ | หมายเหตุ |
|---|---|---|
| **P0A** — trust bugs + ตัด noise | ✅ ส่งแล้ว | API 10/10 · UI 19/19 ผ่านบนเบราว์เซอร์จริง |
| **P0B** — activation + daily value | ✅ ส่งแล้ว | API 23/23 · UI 25/25 · production build 3/3 |
| **P1** — habit | ⬜ ยังไม่เริ่ม | 7-day coverage, budget rollover, weekly review, push, offline queue |
| **P2** — advanced | ⬜ ยังไม่เริ่ม | envelope mode, accounts/opening balance, ledger linking |

### การ deploy — ไม่ต้องรัน migration มืออีกแล้ว

SQL ใน `database/init/` ถูกย้ายไปเป็น TypeORM migrations ที่ `backend/src/migrations/`
และ `synchronize` ปิดทุก environment แล้ว

**สิ่งเดียวที่ต้องตั้งบน Render:** เปลี่ยน start command เป็น

```
npm run start:prod
```

(= `npm run migration:run && node dist/main` — apply migration ที่ค้างก่อนบูตทุกครั้ง)

Migration ปรับตัวเองตามสภาพฐานข้อมูล: DB เปล่าจะถูกสร้างครบ, DB เดิมที่มี schema อยู่แล้ว
จะถูก "รับเข้าระบบ" โดยไม่แตะโครงสร้าง แล้วเติมเฉพาะส่วนที่ขาด — ไม่ต้อง insert แถวลง
ตาราง `migrations` เอง ดูรายละเอียดที่ `database/README.md`

---

---

## 0. บทสรุปสำหรับผู้ตัดสินใจ

ปัญหาไม่ใช่ฟีเจอร์ไม่พอ และไม่ใช่ UI ไม่สวย

**ปัญหาคือแอปยังไม่มีคำสัญญาหนึ่งข้อที่ผู้ใช้ได้รับซ้ำทุกวัน**

ตอนนี้แอปเรียก effort ทันทีตั้งแต่นาทีแรก (ตั้ง wallet 7 ใบ → ผูก category → ตั้ง budget → เข้าใจ allocation) แต่ผลตอบแทนมาช้าและไม่แน่นอน หน้าแรกตอบได้แค่ "เดือนนี้จ่ายไปเท่าไหร่" ซึ่งเป็นข้อมูลย้อนหลังที่ไม่ช่วยตัดสินใจอะไร

ตำแหน่งใหม่ที่เสนอ:

> **"ช่วยคนไทยรู้ว่าวันนี้ยังใช้ได้อีกเท่าไหร่ตามแผน และบันทึกให้เสร็จก่อนลืม"**

**คำตัดสิน: rework core loop ก่อนเพิ่มฟีเจอร์ใดๆ**

---

## 1. หลักฐานเชิงวิจัย (ทำไมต้องเปลี่ยนแนวนี้)

| ข้อเท็จจริง | นัยต่อ MoneyFlow |
|---|---|
| Day-30 retention เฉลี่ยของแอปการเงิน = 38%; top-10 apps เสีย DAU 71% ระหว่าง D1→D30 | retention คือปัญหาเริ่มต้น ไม่ใช่ปัญหาปลายทาง |
| CFPB 2024: 67% ของคนที่ลองใช้แอป budget บอกว่า "ไม่ช่วย" หรือ "ต้องดูแลมากเกินไป" | ภาระการดูแลคือศัตรูอันดับหนึ่ง |
| แอปที่แสดงข้อมูลแต่ไม่บอก next action = ถูกลบ; แอปที่ผู้ใช้เครดิตว่าช่วยประหยัดได้จริง = อยู่รอด | Dashboard ปัจจุบันอยู่ฝั่งแรก |
| บันทึก 1 รายการ เฉลี่ย 45 วินาที; ทำวันละ 8 ครั้ง = 6 นาที/วัน → คนส่วนใหญ่เลิกภายในสัปดาห์แรก | Add flow ต้องลงมาต่ำกว่า 10 วินาที |
| Voice/NL input ลดเวลาบันทึกเหลือ ~5 วินาที | **AI chat ที่มีอยู่แล้วคือทางลัดที่ถูกซ่อนไว้** |
| Fogg Behavior Model: B = MAP — ลด Ability cost ก่อนเพิ่ม Prompt | ลด friction ก่อนค่อยทำ notification |
| Lally et al.: การพลาด 1 วันไม่ทำลาย habit formation | **ห้ามใช้ streak แบบ reset เป็นศูนย์** |
| Loss aversion: คนรู้สึกกับการเสียแรงกว่าได้ 2–2.5 เท่า | ใช้ framing แบบ recovery ไม่ใช่ shame |
| 76% ของผู้ใช้ที่ convert ทำภายใน 7 วันแรก | activation window แคบมาก |

---

## 2. บั๊กที่ทำลายความเชื่อใจ (ยืนยันกับโค้ดแล้วทุกข้อ)

### B1 — Onboarding เป็นละคร เปอร์เซ็นต์ที่โชว์ไม่ถูกใช้จริง
`frontend/src/pages/Onboarding/Onboarding.tsx:8-14` โชว์ "แนะนำ 30%" ต่อ wallet
`backend/src/modules/auth/auth.service.ts:290-297` รับไปแค่ `name`, `icon`, `color`
→ สร้าง wallet ยอด **0** และ **ไม่ผูก category ใดๆ**
ผู้ใช้ต้องไปหน้า Wallets ทำงานเพิ่มอีกชั้น ระบบ envelope ถึงเริ่มทำงาน
(การหัก/เติม wallet เกิดเมื่อ category ถูกผูกเท่านั้น — `expenses.service.ts:70-89`)

**นี่คือ effort ล้วนๆ ในนาทีที่ motivation เปราะบางที่สุด โดยไม่ได้อะไรกลับเลย**

### B2 — บันทึกยอด 0 ได้ → พังที่ DB → UI กลืนเงียบ
- `backend/src/modules/expenses/dto/expense.dto.ts:12` → `@Min(0)`
- `database/init/01-schema.sql:31` → `CHECK (amount > 0)`
- `frontend/src/pages/AddExpense/AddExpense.tsx:69` → `catch { setSubmit(false) }`

ผ่าน validation → ระเบิดที่ DB → error ถูกกลืน → ผู้ใช้กดเซฟแล้วไม่มีอะไรเกิดขึ้น
เกิดซ้ำที่ `History.tsx:72` (แก้ไขรายการ)

### B3 — วันที่เป็น UTC คนไทยลงเดือนผิดทุกเช้าวันที่ 1
`frontend/src/hooks/index.ts:11` และ `AddExpense.tsx:30`, `Budget.tsx:11-13` ใช้ `toISOString()`
ช่วง 00:00–06:59 น. เวลาไทย แอปยังคิดว่าเป็นเมื่อวาน/เดือนก่อน — กระทบ core loop โดยตรง

### B4 — ปุ่มแก้/ลบ มองไม่เห็นบนมือถือ
`frontend/src/pages/History/History.tsx:280` → `opacity-0 group-hover:opacity-100`
touch device ไม่มี hover → ปุ่มล่องหนถาวร ทั้งที่โจทย์คือ mobile-first

### B5 — PWA ติดตั้งไม่ได้
`frontend/vite.config.ts:32-35` manifest ชี้ `/icons/icon-192.png`, `/icons/icon-512.png`
`frontend/public/icons/` มีแค่ `icon.svg` + `README.md` (คำสั่ง generate ที่ไม่เคยรัน)
→ Chrome ไม่ผ่านเกณฑ์ installability → **ไม่มีปุ่ม "เพิ่มลงหน้าจอโฮม"**
แอปจดรายจ่ายที่อยู่แค่ในแท็บเบราว์เซอร์ ไม่มีวันกลายเป็นนิสัยประจำวัน

### B6 — Service worker cache ข้อมูลการเงินแบบไม่แยก user
`frontend/vite.config.ts:30-46` cache ทุก `/api/` แบบ NetworkFirst นาน 24 ชม.
cache key อิง URL ไม่ได้อิง JWT → เครื่องที่ใช้หลายบัญชีมีโอกาสเห็นข้อมูลข้ามกัน
และไม่มี "last updated" บอกว่ากำลังดูข้อมูลเก่า

### B7 — `totalBalance` ไม่ใช่เงินจริง
`backend/src/modules/users/user.entity.ts:40-60`, `database/init/03-total-balance.sql:6-18`
นิยาม = รายรับ − รายจ่าย ตลอดอายุข้อมูล เริ่มจาก **0** และ onboarding ไม่เคยถาม opening balance
→ ผู้ใช้ใหม่จดค่าข้าวรายการแรก ยอดติดลบทันที ทั้งที่บัญชีธนาคารมีเงิน
`unallocatedBalance` และ wallet capacity คำนวณต่อจากค่านี้ (`analytics.service.ts:246-266`)

**⇒ ห้ามนำ `totalBalance` ไปคำนวณ "safe to spend" เด็ดขาด**

### B8 — หน้าแรกยิง 11 request ตอน mount
- 7 จาก `Dashboard.tsx:49-55`
- 3 จาก `AllocationWallets.tsx:710-719`
- 1 จาก `ApplyLastMonthPlan.tsx:27-40`

รวมถึง AI recommendations ที่ `analytics.service.ts:311-370` ทำ 4 sub-query แล้วอาจเรียก
OpenRouter ด้วย timeout 20 วินาที — **โดยที่ผู้ใช้ยังไม่ได้กดเปิด section ด้วยซ้ำ**
บน Render (cold start) + มือถือ = ต้นทุนผิดตำแหน่งอย่างชัดเจน

`useFetch` คืน `error` มาให้ (`hooks/index.ts:14-34`) แต่ไม่มีหน้าไหนเอาไปแสดง
→ network failure หน้าตาเหมือน "ไม่มีข้อมูล" ซึ่งทำลาย trust หนักกว่า error ตรงๆ

### B9 — i18n รั่ว
`Dashboard.tsx:216, 248, 261, 272, 276, 292, 300, 308, 316, 324, 333, 339` hardcode ไทย
`Onboarding.tsx:49-52, 81-96` hardcode ไทยทั้งหน้า
default categories ถูก seed เป็นอังกฤษ (`auth.service.ts:27-40`) ทั้งที่กลุ่มหลักเป็นคนไทย
→ สลับ EN แล้วครึ่งจอยังไทย, คนไทยเจอหมวดภาษาอังกฤษ

### B10 — Empty state ไม่พาไปไหน
`SpendingPieChart.tsx:24-34` กินพื้นที่สูงเพื่อบอกแค่ "ไม่มีรายการ" ไม่มี CTA
`History.tsx:218-227` บอกให้ลอง filter ทั้งที่ผู้ใช้ใหม่ต้องการปุ่ม "บันทึกรายการแรก"
ไม่แยก no-data / filtered-empty / network-error ออกจากกัน

---

## 3. ปัญหาเชิงโครงสร้าง: มี 2 ระบบวางแผนแข่งกัน

`CONTEXT.md:31-33` flag ปัญหานี้เอง:

| | Budget | Allocation / Wallet |
|---|---|---|
| แกน | category | envelope |
| คำถามที่ตอบ | "ใช้เกินหมวดนี้ไหม?" | "แบ่งเงินเดือนยังไง?" |
| หน้า | `/budget` | `/wallets` |
| แสดงบน Dashboard | ✓ (`Dashboard.tsx:205-252`) | ✓ (`Dashboard.tsx:348-350`) |

ผู้ใช้ต้องตอบคำถามซ้ำว่า *"เงินค่าอาหารควรอยู่ budget หรือ wallet?"*

**mental accounting มีประโยชน์เมื่อช่วยลดภาระคิด ไม่ใช่เพิ่มตัวแทน 2 ชุดบน 2 แกน**

ซ้ำร้าย Budget ไม่มี rollover — `budgets.service.ts:14-26` upsert ต่อ `(user, category, month)`
และ UI ต้องเพิ่มทีละหมวดทุกเดือน (`Budget.tsx:54-83`) → cold start ทุกเดือน → ไม่มีใครใช้ต่อ

**ข้อเสนอ:** simple monthly plan เป็น default · envelope เป็น **Advanced mode**
ห้ามแสดงสองโมเดลพร้อมกันใน default experience — แต่ **ไม่ลบ** domain ทิ้ง

---

## 4. Work-Time Calculator และ AI Chat — ทำให้เข้าถึงง่ายจริง

> เจ้าของโปรเจกต์ชอบสองฟีเจอร์นี้ และอยากให้เข้าถึงง่ายขึ้น
> **ข้อเสนอนี้จึงไม่ถอดทั้งคู่ — แต่ย้ายตำแหน่งให้ถูกที่**

### 4.1 ทำไมตอนนี้ถึงเข้าถึงยาก

ทั้งคู่ซ่อนอยู่หลัง "peek strip" กว้าง 3px ที่ขอบจอ (`Layout.tsx:103-118`)
ต้องกดแถบก่อน FAB ถึงจะเลื่อนออกมา (`Layout.tsx:120-148`) — มี `animate-pulse` แค่ 6 วินาทีแรก
ผู้ใช้ที่พลาด 6 วินาทีนั้นจะไม่มีวันรู้ว่ามีฟีเจอร์นี้อยู่

### 4.2 Work-Time Calculator — เปลี่ยนจาก "เครื่องมือ" เป็น "เลนส์"

**codex เสนอให้ถอดออก โดยให้เหตุผลว่าไม่เกี่ยวกับการเงินส่วนบุคคล — ข้อนี้ผมไม่เห็นด้วย**

`WorkTimeCalculator.tsx:44-54` แปลงราคาเป็นเวลาทำงาน นี่คือเทคนิค *"ราคาในหน่วยพลังชีวิต"*
จาก *Your Money or Your Life* ซึ่งเป็นวิธีทำให้ต้นทุนรู้สึกจับต้องได้ที่มีหลักฐานรองรับ
**มันเกี่ยวกับ core loop โดยตรง — แค่วางผิดที่**

ปัญหาจริงของมันคือ:
1. เป็น modal แยก ต้องนึกได้เองว่า "น่าจะเช็ค" แล้วเปิด แล้ว**พิมพ์ราคาซ้ำอีกรอบ**
2. ผลลัพธ์ไม่เชื่อมกับ ledger เลย — คำนวณเสร็จแล้วจบ
3. เงินเดือน/ชั่วโมงเก็บใน `localStorage` เท่านั้น (`WorkTimeCalculator.tsx:12-26`) — ย้ายเครื่องแล้วหาย
   และ**ซ้ำซ้อนกับ `expectedMonthlyIncome` ที่มีอยู่แล้วใน user profile**

**ข้อเสนอ — ทำให้มันอยู่ทุกที่แทนที่จะอยู่หลังแถบซ่อน:**

| ตำแหน่ง | สิ่งที่แสดง |
|---|---|
| **หน้า Add ใต้ช่องจำนวนเงิน** | พิมพ์ `120` → ขึ้นทันที "≈ 1 ชม. 45 นาที ของการทำงาน" (ไม่ต้องพิมพ์ซ้ำ, ปรากฏตอนกำลังตัดสินใจพอดี) |
| **การ์ด safe-to-spend บน Home** | "วันนี้ใช้ได้ ฿680 · ≈ 4 ชม." |
| **แถวรายการใน History** | badge เวลาเล็กๆ (เปิด/ปิดได้) |
| **Settings** | สวิตช์ "แสดงเป็นเวลาทำงาน" สลับทั้งแอประหว่าง ฿ กับเวลา |
| **More → เครื่องคิดเลขเวลาทำงาน** | คงตัวเต็มไว้สำหรับ what-if ก่อนซื้อของใหญ่ ("จะซื้อ 15,000 คุ้มไหม") — เป็น use case จริง แค่ไม่ใช่รายวัน |

**เปลี่ยนที่เก็บข้อมูล:** ย้าย `salary` / `hoursPerDay` / `workDaysPerMonth` จาก localStorage
ไปเป็นคอลัมน์ใน `users` แล้ว prefill `salary` จาก `expectedMonthlyIncome` ที่มีอยู่แล้ว
→ sync ข้ามเครื่อง, ตั้งครั้งเดียว, ไม่ถามซ้ำ

**ผลลัพธ์: จากฟีเจอร์ที่ต้องหาให้เจอ กลายเป็นฟีเจอร์ที่หนีไม่พ้น**

### 4.3 AI Chat — มันคือเส้นทางบันทึกที่เร็วที่สุด และถูกซ่อนไว้

**ข้อค้นพบสำคัญที่สุดของการรีวิวครั้งนี้:**

`backend/src/modules/chat/chat.service.ts:141` มี tool ชื่อ **`create_transaction`** อยู่แล้ว
พร้อมกับ `create_loan`, `create_category`, `create_allocation`, `add_investment`,
`add_tax_deduction` และอีกหลายตัว (บรรทัด 141–390)

แปลว่า **ผู้ใช้พิมพ์ "กาแฟ 45 ข้าวเที่ยง 80" แล้วระบบสร้างรายการให้ได้ตั้งแต่วันนี้**

งานวิจัยบอกว่า NL input ลดเวลาบันทึกจาก ~45 วินาที เหลือ ~5 วินาที
นั่นคือ **ทางลัดที่เร็วที่สุดในแอป ซ่อนอยู่หลังแถบ 3px ที่ไม่มีใครหาเจอ**

**ข้อเสนอ — เลื่อนขั้นจาก "ของเล่นข้างๆ" เป็น "ทางด่วนของ core loop":**

1. **แถบพิมพ์บน Home** แทน FAB ที่ซ่อน — placeholder: *"กาแฟ 45 · ค่าวิน 30 · ถามอะไรก็ได้"*
   พิมพ์แล้วเข้า chat พร้อมข้อความนั้นเลย
2. **โหมดยืนยันเร็ว** — เมื่อ AI เรียก `create_transaction` ให้แสดง chip ยืนยัน
   `[🍜 อาหาร ฿45] [✓ บันทึก] [✎ แก้]` แทนที่จะเป็นข้อความยาว
   → ผิดพลาดแก้ได้ทันที ไม่ต้องเชื่อ AI ตาบอด
3. **ปุ่มไมค์** ต่อ Web Speech API เข้าช่องเดียวกัน → ใกล้เคียง 5 วินาทีจริง
4. **แยก "chat" ออกจาก "auto-fetch recommendations"** — สองอย่างนี้คนละเรื่อง
   ตัวที่ต้องเลิกคือ auto-fetch ตอน Home mount (B8) ไม่ใช่ตัว chat
   ย้าย AI insights เป็น on-demand: ผู้ใช้กด "วิเคราะห์" เอง + cache ผลรายสัปดาห์
5. **คงเพดานค่าใช้จ่ายต่อ user ที่มีอยู่แล้ว** (`ai-usage-log.entity.ts`) และแสดงโควต้าคงเหลือให้เห็น

**ผลลัพธ์: AI ไม่ได้แย่ง attention จากปุ่ม Add อีกต่อไป — มันกลายเป็นปุ่ม Add ที่เร็วกว่า**

---

## 5. Core loop ใหม่

```
Prompt ตามบริบท → บันทึกเร็ว → เห็นผลต่อวันนี้ทันที → Undo ได้ → กลับมาเช็กเย็นนี้
```

| เวลา | สิ่งที่เกิดขึ้น |
|---|---|
| 0–1.5 วิ | เปิด PWA จากหน้าจอโฮม (ต้องแก้ B5 ก่อน) |
| 1.5–4 วิ | ช่องจำนวนเงิน focus อัตโนมัติ พิมพ์เลข · เห็นเวลาทำงานทันที |
| 4–6 วิ | แตะ 1 ใน 4 หมวดที่ใช้บ่อยล่าสุด |
| 6–8 วิ | กดบันทึก (วันที่ = วันนี้ตาม Asia/Bangkok, note ซ่อนอยู่ใน "เพิ่มเติม") |
| < 9 วิ | "บันทึกแล้ว · วันนี้เหลือตามแผน ฿680" + Undo 5 วินาที + "เพิ่มอีก" |

**หรือ:** พิมพ์ `กาแฟ 45` ที่แถบบน Home → chip ยืนยัน → เสร็จใน ~4 วินาที

### Home ใหม่

**เหนือ fold (จาก 1 request):**
1. **วันนี้ใช้ได้ตามแผน ฿X** (หรือ "ยังไม่ได้ตั้งแผน" + CTA) · ≈ เวลาทำงาน
2. วันนี้ใช้ไป ฿Y + progress bar (ไม่ใช่ pie chart)
3. แถบพิมพ์เร็ว / ปุ่ม + บันทึกรายจ่าย
4. 3 รายการล่าสุด + Undo/แก้ไข

**ใต้ fold:** แผนเดือนนี้ (ใช้แล้ว/เหลือ/pace) · หมวดที่ต้องระวัง 1–2 หมวด (deterministic) · ลิงก์ "ดูรายงาน"

**ย้ายออกจาก Home:** pie chart, 12-month trend, bar comparison, emergency fund, loan list,
wallet transfer, AI auto-insights → ไปหน้า Reports / Advanced ที่โหลดเมื่อเปิด

### สูตร "วันนี้ใช้ได้ตามแผน"

```
remainingBeforeToday = monthlySpendingLimit − expenseBeforeTodayInMonth
baseToday            = max(0, remainingBeforeToday / daysRemainingIncludingToday)
safeToday            = max(0, baseToday − expenseToday)
```

**กติกาบังคับ:**
- ต้องเขียนคำว่า **"ตามแผน"** เสมอ ห้ามสื่อว่าเป็นเงินจริงในบัญชี (เพราะ B7)
- ถ้าไม่มี limit → แสดงแค่ "วันนี้ใช้ไป ฿Y" **ห้ามเดาจาก `totalBalance`**
- `monthlyLimit` / `safeToday` ต้องเป็น `null` ไม่ใช่ `0` (0 แปลว่า "ใช้ไม่ได้แล้ว" ไม่ใช่ "ไม่มีข้อมูล")

---

## 6. Onboarding ใหม่ — 3 จอ ภายใน 2 นาที

| จอ | เนื้อหา |
|---|---|
| **1. อยากให้แอปช่วยอะไร** | ค่าเริ่มต้น "คุมรายจ่ายรายวัน" / ทางเลือก "จดอย่างเดียว" — ไม่ถามเรื่อง loan, investment, tax, wallet |
| **2. ตั้งวงเงินเดือนนี้ค่าเดียว** | "เดือนนี้อยากใช้ไม่เกินเท่าไหร่?" มีปุ่ม "ยังไม่แน่ใจ ข้ามก่อน" → เข้า track-only mode |
| **3. บันทึกรายการแรก** | amount autofocus + 4 หมวดไทย (อาหาร/เดินทาง/ช้อปปิ้ง/บิล) ข้ามได้ · ถ้าบันทึก → โชว์ผลทันที "วันนี้ใช้ไป ฿120 · ตามแผนยังใช้ได้ ฿680" |

**เลิกสร้าง wallet 7 ใบเป็น default** — ผู้ใช้ที่เปิด Advanced envelopes ทีหลังค่อยเลือก template 3 ใบ
**seed default categories เป็นภาษาไทย** เมื่อ `lang = 'th'` (แก้ B9)

---

## 7. อะไรทำให้กลับมาใช้ทุกวัน

### 7.1 ห้ามใช้ expense streak

**วันที่ไม่ใช้เงินคือพฤติกรรมที่ดี ไม่ควรถูกนับว่า "ขาด streak"**

ใช้ **7-day coverage** แทน:
- วันไหนมีรายการ = เช็กแล้ว
- หรือกด "วันนี้ไม่มีรายจ่าย" เพื่อ check-in
- แสดง "เช็กแล้ว 5/7 วัน" — **ไม่ reset เป็นศูนย์**
- เติมย้อนหลังเมื่อวานได้ 1 วัน

(Lally et al. — การพลาดครั้งหนึ่งไม่ทำลาย automaticity อย่างมีนัยสำคัญ)

### 7.2 Prompt ต้องมาตอนผู้ใช้มี ability

- ขอสิทธิ์ notification **หลัง**บันทึกครั้งที่ 3 หรือใช้ครบ 3 วัน — **ไม่ใช่ตอน onboarding**
- ให้เลือกเวลาเอง เช่น 20:30
- ข้อความ: *"วันนี้มีรายการที่ยังไม่ได้จดไหม?"* ไม่ใช่ *"คุณกำลังจะเสีย streak"*
- ถ้าบันทึกหรือ check-in แล้ว → ยกเลิก prompt วันนั้น

### 7.3 Reward ต้องทันทีและเกี่ยวกับการตัดสินใจ

หลังบันทึกทุกครั้ง: safe-today ลดลงเท่าไหร่ · หมวดนี้เหลือเท่าไหร่ · Undo ชัดเจน
สัปดาห์ละครั้ง: "สัปดาห์นี้ใช้ลดลง ฿X" · "วันที่ใช้สูงสุดคือวันศุกร์" · action เดียว

**ใช้ SQL query ธรรมดา ไม่ต้องใช้ LLM** — เร็วกว่า ถูกกว่า อธิบายได้ และไม่พังตอน API ล่ม

---

## 8. UI direction

1. **หนึ่งหน้า หนึ่งคำถามหลัก** — Home = วันนี้ · Plan = เดือนนี้ · Transactions = เกิดอะไรขึ้น
2. **ตัวเลขใหญ่ต้อง actionable** — hero เปลี่ยนจาก total expense เป็น safe-today
3. **สีมี semantic คงที่** — เขียว = ตามแผน · amber = ใกล้ limit · แดง = เกิน
   brand purple ไม่ควรกลบสถานะ (ตอนนี้ hero การ์ดเป็นม่วงล้วนตลอดเวลา)
4. **copy แบบ recovery ไม่ใช่ shame** — เลิกใช้อิโมจิหน้ายิ้ม/หน้าเศร้า (`Dashboard.tsx:156`)
   ใช้ "เกินแผน ฿X — ปรับวันถัดไปเป็น ฿Y" แทน
5. **progress bar + ตัวเลขจริง** ดีกว่า pie chart สำหรับการตัดสินใจรายวัน
6. **mobile action ต้องเห็นเสมอ** — swipe หรือ overflow menu ห้ามพึ่ง hover (B4)
7. **progressive disclosure** — date/note/หมวดทั้งหมด/reports เปิดเมื่อต้องการ
8. **i18n จาก key เดียว** — หยุด hardcode ทั้งไทยและอังกฤษใน page

### Navigation ใหม่

```
Home  |  Transactions  |  (+)  |  Plan  |  More
```

**More:**
- เครื่องคิดเลขเวลาทำงาน ← เข้าถึงได้จริง ไม่ต้องหาแถบ 3px
- ผู้ช่วย AI ← เข้าถึงได้จริง (และมีแถบพิมพ์บน Home อีกทาง)
- รายงาน (pie / trend / 12 เดือน)
- Advanced: Envelope wallets · หนี้สิน · การลงทุน · ภาษี
- ตั้งค่า · ส่งออกข้อมูล

**ทุก route เดิมยังอยู่** — แค่ย้ายตำแหน่งใน nav ไม่ลบข้อมูลหรือ URL

---

## 9. แผน implementation

**นิยาม effort** (นักพัฒนา 1 คน รวมทดสอบ): **S** = 1–2 วัน · **M** = 3–5 วัน · **L** = 1–2 สัปดาห์

### P0A — Trust + Focus  ·  ประมาณ 1 สัปดาห์  ·  *ไม่แตะ schema*

| # | งาน | ไฟล์ | Effort |
|---|---|---|---|
| A1 | amount ≥ 0.01 ให้ DTO ตรงกับ schema | `expenses/dto/expense.dto.ts`, `AddExpense.tsx`, `History.tsx` | S |
| A2 | แสดง error ตอน save/edit ล้มเหลว + ปุ่มลองใหม่ | `AddExpense.tsx:58-69`, `History.tsx:60-73`, เพิ่ม `components/ui/Toast.tsx` | S |
| A3 | `utils/localDate.ts` แทน `toISOString()` ทุกจุด | `hooks/index.ts:11`, `AddExpense.tsx:30`, `Budget.tsx:11`, `Dashboard.tsx` | S |
| A4 | edit/delete เห็นได้บนมือถือ | `History.tsx:280` | S |
| A5 | generate PWA icons 192/512 จาก `icon.svg` | `frontend/public/icons/` + เพิ่ม script ใน `package.json` | S |
| A6 | เอา authenticated API ออกจาก SW cache (NetworkOnly) | `vite.config.ts:30-46` | S |
| A7 | หยุด auto-fetch AI recommendations ตอน Home mount | `Dashboard.tsx:55`, `AiInsightsSection.tsx` | S |
| A8 | nav ใหม่ 5 ช่อง + More · **เลิกใช้ peek strip** · WorkTime + AI ย้ายเข้า More | `Layout.tsx:14-20, 100-178`, `Finance.tsx` → More | M |
| A9 | แสดง error state จาก `useFetch` แทนหน้าว่าง | `hooks/index.ts`, `Dashboard.tsx`, `History.tsx` | S |
| A10 | empty state แยก no-data / filtered / error + CTA | `SpendingPieChart.tsx`, `History.tsx`, `Budget.tsx` | S |
| A11 | เก็บ i18n ที่รั่วใน Dashboard + Onboarding | `Dashboard.tsx`, `Onboarding.tsx`, `i18n.store.ts` | S |

**หลัง P0A: ของเดิมไม่พัง แต่เชื่อถือได้ ติดตั้งลงมือถือได้ และเลิกยิง 11 request**

---

### P0B — Activation + Daily Value  ·  ประมาณ 1.5–2 สัปดาห์  ·  *มี migration*

| # | งาน | รายละเอียด | Effort |
|---|---|---|---|
| B1 | Migration | `database/init/07-user-spending-plan.sql`: `monthly_spending_limit NUMERIC(14,2)`, `tracking_mode VARCHAR(20) DEFAULT 'plan'`, `timezone VARCHAR(64) DEFAULT 'Asia/Bangkok'`, `work_hours_per_day`, `work_days_per_month` | S |
| B2 | `GET /api/analytics/daily-brief` | `analytics.controller.ts` + `analytics.service.ts` — 1 request แทน 11 | M |
| B3 | Home ใหม่ | `Dashboard.tsx` เขียนใหม่เหนือ fold · ย้ายกราฟไป `pages/Reports/` lazy | M |
| B4 | Quick Add <10 วิ | `AddExpense.tsx`: autofocus, recent 4 หมวด, ซ่อน date/note, Undo, "เพิ่มอีก" | M |
| B5 | Onboarding 3 จอ | `Onboarding.tsx`, `auth.dto.ts`, `auth.service.ts:281-300` — เลิกสร้าง wallet 7 ใบ, seed หมวดไทย | M |
| B6 | Work-time เป็น inline lens | badge ใต้ช่องจำนวนเงิน + safe-to-spend · ย้าย settings ขึ้น server | M |
| B7 | แถบพิมพ์ AI บน Home + chip ยืนยัน | `ChatPanel.tsx` + component ใหม่บน Home | M |
| B8 | Telemetry ขั้นต่ำ | `onboarding_completed`, `add_opened`, `expense_created`, `add_failed`, `daily_brief_viewed` — เก็บแค่ duration/version/platform **ไม่เก็บจำนวนเงินหรือ note** | M |

#### Contract: `GET /api/analytics/daily-brief?date=YYYY-MM-DD&tz=Asia/Bangkok`

```json
{
  "date": "2026-07-27",
  "timezone": "Asia/Bangkok",
  "mode": "plan",
  "spentToday": 320,
  "monthSpent": 12450,
  "monthlyLimit": 20000,
  "safeToday": 510,
  "daysRemaining": 5,
  "planStatus": "on_track",
  "recentCategoryIds": ["uuid-food", "uuid-transport"],
  "recentTransactions": []
}
```

`mode: "track_only"` หรือไม่มี limit → `monthlyLimit` และ `safeToday` = `null`

---

### P1 — สร้าง habit

| # | งาน | Effort |
|---|---|---|
| P1.1 | 7-day coverage check-in — `daily_checkins(user_id, local_date, status)` + `PUT /api/check-ins/:date` | M |
| P1.2 | Budget rollover — `POST /api/budgets/copy-previous` + `PUT /api/budgets/batch` + suggest จากค่าเฉลี่ยจริง | M |
| P1.3 | Weekly review แบบ deterministic — `GET /api/analytics/weekly-review` ไม่ใช้ LLM | M |
| P1.4 | Web Push opt-in หลังผู้ใช้เห็น value แล้ว | L |
| P1.5 | Offline-safe capture — IndexedDB queue แยกตาม user + pending state | L |
| P1.6 | ปุ่มไมค์ (Web Speech API) ต่อเข้าแถบพิมพ์ | S |

### P2 — Advanced (ต้องพิสูจน์คุณค่าก่อน)

| # | งาน | Effort |
|---|---|---|
| P2.1 | Envelope เป็น mode จริง + wizard ผูก category อัตโนมัติ | L |
| P2.2 | `accounts` + opening balance + reconciliation (จำเป็นถ้าจะอ้างว่าเป็นเงินจริง) | XL |
| P2.3 | เชื่อม Loans/Investments เข้ากับ ledger แบบ idempotent | L/domain |
| P2.4 | AI insights on-demand + consent + cache รายสัปดาห์ | M |

---

## 10. ตัววัดผล

**North-star:** *Weekly reviewed days per activated user* — จำนวนวันที่มีรายการหรือ no-spend check-in
ต่อผู้ใช้ที่เคยบันทึกอย่างน้อย 1 ครั้ง (ไม่ใช้ "จำนวนครั้งที่เปิดแอป" — เปิดแล้วไม่ได้อะไรไม่มีค่า)

**Funnel:** สมัคร → onboarding เสร็จ → รายการแรก → เห็น daily brief หลังบันทึก → กลับมาวันถัดไป

**เป้าหลัง rollout 4 สัปดาห์:**
- บันทึกรายการแรกภายใน 5 นาทีหลังสมัคร ≥ 60%
- median add time < 7 วิ · p75 < 10 วิ
- save error < 1%
- D1 reviewed-day retention +20% · D7 +10% เทียบ baseline

**Kill criteria:**
- Loans/Investments/Tax: MAU < 3% และไม่เชื่อม ledger → ซ่อนต่อ ไม่ลงทุน polish เพิ่ม
- Notification: opt-out > 30% → ลดความถี่
- Envelope: setup completion < 30% → คง simple plan เป็น default

---

## 11. ข้อโต้แย้งและความเสี่ยง

1. **safe-today อาจง่ายเกินไป** สำหรับฟรีแลนซ์ / รายได้หลายรอบ / บัตรเครดิต / ค่าใช้จ่ายร่วมครอบครัว
   → P0 จึงต้องใช้คำว่า "ตามแผน" เสมอ, มี track-only mode, P1 ค่อยรองรับ pay cycle

2. **การซ่อนฟีเจอร์กระทบ power user เดิม** → ซ่อนใน More > Advanced ไม่ลบ route/ข้อมูล และวัด usage ก่อนตัดสินใจอะไรต่อ

3. **ผู้ใช้อาจไม่อยากบอกรายได้** → ทุกฟิลด์ optional, เริ่มจดอย่างเดียวได้, ค่อยเสนอ plan หลังมีข้อมูล 7 วัน

4. **AI สร้างรายการผิด** → chip ยืนยันก่อนเสมอ ห้าม auto-commit · มี Undo · แสดงหมวด+ยอดที่ parse ได้ให้เห็นชัด

5. **Work-time badge อาจสร้างความรู้สึกผิดทุกครั้งที่ใช้เงิน** → ต้องปิดได้ และ default = ปิด
   สำหรับผู้ใช้ที่ยังไม่ได้ตั้งเงินเดือน (เปิดเองเมื่ออยากได้ ไม่ยัดเยียด)

6. **recent categories อาจทำให้เลือกผิดเร็วขึ้น** → icon/label ชัด, มี Undo, มีปุ่ม "หมวดอื่น", ไม่ auto-submit เมื่อแตะหมวด

7. **P0 ยัง scope ใหญ่** → ถ้าเวลาน้อยที่สุด ส่ง P0A อย่างเดียวก่อน มันแก้ของที่พังอยู่โดยไม่เปลี่ยน mental model

8. **ถ้าเป้าหมายจริงคือ net-worth app** ข้อเสนอนี้แคบเกินไป — แต่ในกรณีนั้นต้องยอมรับว่า
   accounts / opening balance / reconciliation คืองานฐานที่ยังขาด และ `totalBalance` ปัจจุบันใช้แทนไม่ได้

9. **ข้อที่ผมกับ codex เห็นไม่ตรงกัน:** codex เสนอให้ **ถอด Work-time Calculator ออกจากแอป**
   ผมไม่เห็นด้วย — มันคือเทคนิคทำให้ต้นทุนจับต้องได้ที่ตรงกับ core loop มาก ปัญหาคือวางผิดที่ ไม่ใช่ผิดฟีเจอร์
   ข้อ 4.2 คือทางออกที่เสนอแทน **ถ้าหลัง P0B ยังไม่มีคนเปิดใช้ badge เลย ค่อยกลับมาคุยเรื่องถอด**

---

## 12. คำถามที่ต้องตัดสินใจก่อนเริ่ม

1. เริ่มจาก **P0A อย่างเดียว** หรือ **P0A → P0B ต่อเนื่อง**?
2. `monthly_spending_limit` — ให้ผู้ใช้ตั้งเอง หรือให้ระบบเสนอจากค่าเฉลี่ย 3 เดือนย้อนหลัง (ถ้ามีข้อมูล)?
3. Work-time badge — default เปิดหรือปิด?
4. รองรับผู้ใช้เดิมที่มี wallet 7 ใบอยู่แล้วอย่างไร — คงไว้แล้วเปิด Advanced mode ให้อัตโนมัติ?
5. ต้องการ telemetry (P0B-B8) ไหม หรือข้ามไปก่อน?
