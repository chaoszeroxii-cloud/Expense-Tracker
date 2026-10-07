const test = require('node:test')
const assert = require('node:assert/strict')
const { parseBankMail, mailText, BANK_MAIL_QUERY } = require('../dist/modules/bank-mail/bank-mail.parser')
const { sealMailSecret, openMailSecret } = require('../dist/modules/bank-mail/bank-mail.crypto')
const { normalizeMemoCode, matchMemoCategory } = require('../dist/common/memo-code.util')

const codeCategories = [
  { id: 'food', type: 'expense', memoCode: 'กิน' },
  { id: 'travel', type: 'expense', memoCode: 'go' },
  { id: 'salary', type: 'income', memoCode: 'pay' },
  { id: 'number', type: 'expense', memoCode: '1' },
  { id: 'accent', type: 'expense', memoCode: 'café' },
]
test('memo codes normalize optional hashes, case and canonical Unicode without coercing JSON values', () => {
  assert.equal(normalizeMemoCode(' #GO '), 'go')
  assert.equal(normalizeMemoCode('Cafe\u0301'), 'café')
  assert.equal(normalizeMemoCode(''), null)
  assert.equal(normalizeMemoCode(null), null)
  assert.equal(normalizeMemoCode(1), 1)
  assert.equal(normalizeMemoCode(false), false)
})
test('memo codes select whole Thai, English, numeric and normalized tokens; repeated tokens agree', () => {
  for (const [memo, id] of [['ข้าว #กิน', 'food'], ['(#GO), ไปทำงาน', 'travel'], ['#1', 'number'], ['#กิน #กิน', 'food'], ['#Cafe\u0301', 'accent']]) {
    const hint = matchMemoCategory(memo, 'expense', codeCategories)
    assert.equal(hint.categoryId, id); assert.equal(hint.issue, null)
  }
  assert.equal(matchMemoCategory('#PAY', 'income', codeCategories).categoryId, 'salary')
})
test('memos without explicit codes keep defaults; prefixes and unknown codes never guess a category', () => {
  for (const memo of [undefined, '', 'อาหาร', 'กิน', 'https://example.test/#กิน', 'text#กิน']) {
    assert.equal(matchMemoCategory(memo, 'expense', codeCategories), null)
  }
  for (const memo of ['#กินเพิ่ม', '#go-extra', '#missing', '#กิน#go', '#<script>', '#' + 'a'.repeat(21)]) {
    assert.equal(matchMemoCategory(memo, 'expense', codeCategories).issue, 'memo_code_unknown')
  }
  assert.equal(matchMemoCategory('#กิน', 'expense', []).issue, 'memo_code_unknown')
})
test('multiple codes and wrong transaction types require review without changing direction', () => {
  assert.equal(matchMemoCategory('#กิน #go', 'expense', codeCategories).issue, 'memo_code_multiple')
  assert.equal(matchMemoCategory('#กิน #unknown', 'expense', codeCategories).issue, 'memo_code_multiple')
  const hint = matchMemoCategory('#pay', 'expense', codeCategories)
  assert.equal(hint.issue, 'memo_code_type_mismatch'); assert.equal(hint.categoryId, null)
})
test('memos at the storage limit cannot match a partial code or hide conflicting codes', () => {
  const memo = 'x'.repeat(395) + ' #กิน'
  assert.equal(memo.length, 400)
  assert.equal(matchMemoCategory(memo, 'expense', codeCategories).issue, 'memo_code_unknown')
  assert.equal(matchMemoCategory('#กิน ' + 'x'.repeat(395), 'expense', codeCategories).issue, 'memo_code_unknown')
  assert.equal(matchMemoCategory('#กิน ' + 'x'.repeat(394), 'expense', codeCategories).issue, 'memo_code_unknown')
})

// Entirely synthetic templates: never copy private mail into the repository.
const ktb = `<p>คุณได้ทำรายการโอนเงินผ่าน Krungthai NEXT สำเร็จ</p>
<p>วันที่ทำรายการ : 30/09/2569 12:34:56</p><p>หมายเลขอ้างอิง : SYNTHETICREF0001</p>
<p>จากบัญชี : นายผู้ทดสอบ ก</p><p>เลขบัญชี : กรุงไทย XXX-X-XX111-1</p>
<p>ไปยังบัญชี : นางผู้รับ ข</p><p>เลขบัญชี : ไทยพาณิชย์ XXX-X-XX222-2</p>
<p>จำนวนเงิน : 1,234.50 บาท</p><p>ค่าธรรมเนียม : 0.00 บาท</p>`
const incoming = 'จาก: KTB / xxxxxx1111<BR>จำนวน (บาท): 80.25<BR>เข้าบัญชี: xxxxxx2222<BR>วัน/เวลา: 30 ก.ย. 2569 - 12:34'
// Same field structure as the observed bill-payment template; all values are synthetic.
const bill = '<p>เรียน คุณ ผู้ทดสอบ</p><p>คุณได้จ่ายบิลผ่าน Krungthai NEXT สำเร็จ</p>'
  + '<dl><dd>วันที่ทำรายการ : 30/09/2569 12:34:56</dd><dd>หมายเลขอ้างอิง : SYNTHETICBILL0001</dd>'
  + '<dd>จากบัญชี : นายผู้ทดสอบ ก</dd><dd>เลขบัญชี : กรุงไทย XXX-X-XX111-1</dd>'
  + '<dd>ไปยังผู้ให้บริการ : EXAMPLE BILLER CO., LTD.</dd>'
  + '<dd>จำนวนเงินที่ชำระ : 123.45 บาท</dd><dd>ค่าธรรมเนียม : 0.00 บาท</dd></dl>'
const outgoing = '<table><tr><td>ประเภทของรายการ:</td><td>โอนเงินพร้อมเพย์</td></tr>'
  + '<tr><td>รายละเอียด:</td><td>จาก ธนาคารไทยพาณิชย์ เบอร์บัญชี</td><td>xxxxxx2222</td></tr>'
  + '<tr><td></td><td>ไปยัง หมายเลขพร้อมเพย์ผู้รับเงิน</td><td>0000000003333</td></tr>'
  + '<tr><td></td><td>จำนวนเงิน</td><td>80.25 บาท</td></tr>'
  + '<tr><td>วันและเวลาการทำรายการ:</td><td>30 ก.ย. 2569 ณ 12:34:56</td></tr></table>'
function message(bank, html, subject) {
  const domain = bank === 'ktb' ? 'krungthai.com' : 'scb.co.th'
  return { id: 'synthetic-message', internalDate: String(Date.parse('2026-09-30T14:40:00+07:00')),
    payload: { mimeType: 'text/html', headers: [
      { name: 'From', value: bank === 'ktb' ? 'Bank <noreply@krungthai.com>' : 'Bank <scbeasynet@scb.co.th>' },
      { name: 'Subject', value: subject ?? 'แจ้งผลการโอนเงินสำเร็จ' },
      { name: 'Authentication-Results', value: `mx.google.com; dkim=pass header.i=@${domain}; dmarc=pass header.from=${domain}` },
    ], body: { data: Buffer.from(html).toString('base64url') } } }
}
test('KTB amounts, separate fees, Buddhist date and masked suffixes', () => {
  const t = parseBankMail(message('ktb', ktb)).transaction
  assert.equal(t.amount, 1234.50)
  assert.equal(t.fee, 0)
  assert.equal(t.type, 'expense')
  assert.equal(t.occurredAt, '2026-09-30T05:34:56.000Z')
  assert.equal(t.accountSuffix, '1111')
  assert.equal(t.counterpartyBank, 'scb')
  assert.equal(t.counterpartySuffix, '2222')
  assert.equal(t.possibleOwnTransfer, false)
  assert.ok(!JSON.stringify(t).includes('ผู้ทดสอบ'))
  assert.ok(!JSON.stringify(t).includes('SYNTHETICREF'))
})
test('KTB bill payments are searched and parsed without inventing a recipient account', () => {
  assert.ok(BANK_MAIL_QUERY.includes('subject:"แจ้งผลการจ่ายบิลสำเร็จ"'))
  const t = parseBankMail(message('ktb', bill, 'แจ้งผลการจ่ายบิลสำเร็จ')).transaction
  assert.ok(t)
  assert.equal(t.kind, 'bill_payment')
  assert.equal(t.type, 'expense')
  assert.equal(t.amount, 123.45)
  assert.equal(t.fee, 0)
  assert.equal(t.accountSuffix, '1111')
  assert.equal(t.counterpartySuffix, '')
  assert.equal(t.possibleOwnTransfer, false)
  assert.equal(t.occurredAt, '2026-09-30T05:34:56.000Z')
  assert.ok(t.referenceHash)
  for (const privateValue of ['ผู้ทดสอบ', 'EXAMPLE BILLER', 'SYNTHETICBILL']) assert.ok(!JSON.stringify(t).includes(privateValue))
  assert.equal(parseBankMail(message('ktb', bill.replace('ค่าธรรมเนียม : 0.00', 'ค่าธรรมเนียม : 2.50'), 'แจ้งผลการจ่ายบิลสำเร็จ')).transaction.fee, 2.50)
})
test('bill payment status, payer, biller, amount and sender must be verifiable', () => {
  for (const content of [bill.replace('จ่ายบิลผ่าน', 'โอนเงินผ่าน'), bill.replace('สำเร็จ', 'ไม่สำเร็จ'),
    bill.replace('<dd>ไปยังผู้ให้บริการ : EXAMPLE BILLER CO., LTD.</dd>', ''),
    bill.replace('XXX-X-XX111-1', ''), bill.replace('123.45', '123,45'),
    bill + '<dd>จำนวนเงินที่ชำระ : 10.00 บาท</dd>']) {
    assert.equal(parseBankMail(message('ktb', content, 'แจ้งผลการจ่ายบิลสำเร็จ')).transaction, undefined)
  }
  assert.equal(parseBankMail(message('ktb', bill, 'แจ้งผลการจ่ายบิลไม่สำเร็จ')).transaction, undefined)
  const spoofed = message('ktb', bill, 'แจ้งผลการจ่ายบิลสำเร็จ')
  spoofed.payload.headers[2].value = 'mx.google.com; dkim=fail; dmarc=fail'
  assert.equal(parseBankMail(spoofed).reason, 'unverified_sender')
})

test('KTB goods/services subject and account label variants preserve bill identity', () => {
  const subject = 'แจ้งผลการชำระค่าสินค้าและบริการสำเร็จ'
  assert.ok(BANK_MAIL_QUERY.includes(`subject:"${subject}"`))
  const original = parseBankMail(message('ktb', bill, 'แจ้งผลการจ่ายบิลสำเร็จ')).transaction
  const html = bill.replace('เลขบัญชี :', 'เลขที่บัญชี :')
  for (const mimeType of ['text/html', 'text/plain']) {
    const m = message('ktb', html, subject)
    if (mimeType === 'text/plain') m.payload.body.data = Buffer.from(mailText(m.payload)).toString('base64url')
    m.payload.mimeType = mimeType
    assert.deepEqual(parseBankMail(m).transaction, original)
  }
  for (const content of [html.replace('สำเร็จ', 'ไม่สำเร็จ'), html.replace('XXX-X-XX111-1', ''),
    html.replace('123.45', '123,45'), html.replace('EXAMPLE BILLER CO., LTD.', ''),
    html + '<dd>จำนวนเงินที่ชำระ : 10.00 บาท</dd>']) {
    assert.equal(parseBankMail(message('ktb', content, subject)).transaction, undefined)
  }
  assert.equal(parseBankMail(message('ktb', html, subject.replace('สำเร็จ', 'ไม่สำเร็จ'))).reason, 'unsupported_template')
  const spoofed = message('ktb', html, subject)
  spoofed.payload.headers[2].value = 'mx.google.com; dkim=fail; dmarc=fail'
  assert.equal(parseBankMail(spoofed).reason, 'unverified_sender')
})

test('G-Wallet funding requires transfer review without storing the biller name', () => {
  const html = bill.replace('เลขบัญชี :', 'เลขที่บัญชี :').replace('EXAMPLE BILLER CO., LTD.', 'เติมเงิน G-Wallet')
  for (const subject of ['แจ้งผลการจ่ายบิลสำเร็จ', 'แจ้งผลการชำระค่าสินค้าและบริการสำเร็จ']) {
    const t = parseBankMail(message('ktb', html, subject)).transaction
    assert.ok(t)
    assert.equal(t.kind, 'bill_payment')
    assert.equal(t.amount, 123.45)
    assert.equal(t.possibleOwnTransfer, true)
    for (const privateValue of ['ผู้ทดสอบ', 'G-Wallet', 'SYNTHETICBILL']) assert.ok(!JSON.stringify(t).includes(privateValue))
  }
})

test('optional KTB memos are plain text and do not change transaction identity', () => {
  for (const [body, subject] of [[ktb, 'แจ้งผลการโอนเงินสำเร็จ'], [bill, 'แจ้งผลการจ่ายบิลสำเร็จ'], [bill, 'แจ้งผลการชำระค่าสินค้าและบริการสำเร็จ']]) {
    const original = parseBankMail(message('ktb', body, subject)).transaction
    const withMemo = message('ktb', body + '<dd>บันทึกช่วยจำ : ค่าเดินทาง &amp; อาหาร</dd><p>Unrelated footer</p>', subject)
    for (const mimeType of ['text/html', 'text/plain']) {
      if (mimeType === 'text/plain') withMemo.payload.body.data = Buffer.from(mailText(withMemo.payload)).toString('base64url')
      withMemo.payload.mimeType = mimeType
      assert.deepEqual(parseBankMail(withMemo).transaction, { ...original, memo: 'ค่าเดินทาง & อาหาร' })
    }
    for (const optional of ['', '<dd>บันทึกช่วยจำ : </dd><p>Unrelated footer</p>']) {
      assert.deepEqual(parseBankMail(message('ktb', body + optional, subject)).transaction, original)
    }
  }
})

test('memos are bounded, control-free and ambiguous fields fail closed', () => {
  const parse = memo => parseBankMail(message('ktb', bill + memo, 'แจ้งผลการจ่ายบิลสำเร็จ'))
  assert.equal(parse('<dd>บันทึกช่วยจำ : ' + 'ก'.repeat(600) + '</dd>').transaction.memo.length, 400)
  assert.equal(parse('<dd>บันทึกช่วยจำ : ' + 'ก'.repeat(399) + '🙂</dd>').transaction.memo.length, 399)
  assert.equal(parse('<dd>บันทึกช่วยจำ : ค่า\u0000เดินทาง</dd>').transaction.memo, 'ค่าเดินทาง')
  assert.equal(parse('<dd>บันทึกช่วยจำ : &lt;img src=x onerror=alert(1)&gt;</dd>').transaction.memo, '<img src=x onerror=alert(1)>')
  assert.equal(parse('<dd>บันทึกช่วยจำ : A</dd><dd>บันทึกช่วยจำ : B</dd>').reason, 'ambiguous_template')
})
test('SCB incoming uses transaction time even when email is two hours late', () => {
  const m = message('scb', incoming, ' SCB Easy App:  คุณได้รับเงินผ่านรายการพร้อมเพย์')
  const content = { mimeType: 'text/html', body: m.payload.body }
  m.payload = { ...m.payload, mimeType: 'multipart/mixed', body: {}, parts: [
    { mimeType: 'multipart/related', parts: [content] },
    { filename: 'never-read.html', mimeType: 'text/html', body: { data: Buffer.from('fake').toString('base64url') } },
  ] }
  const t = parseBankMail(m).transaction
  assert.equal(t.type, 'income')
  assert.equal(t.amount, 80.25)
  assert.equal(t.occurredAt, '2026-09-30T05:34:00.000Z')
  assert.notEqual(t.occurredAt, t.receivedAt)
})
test('SCB outgoing table preserves field boundaries', () => {
  const t = parseBankMail(message('scb', outgoing, 'แจ้งเตือนจากแอป SCB Easy: บริการอัตโนมัติแจ้งเตือนการทำธุรกรรม')).transaction
  assert.equal(t.type, 'expense')
  assert.equal(t.amount, 80.25)
  assert.equal(t.counterpartySuffix, '3333')
})
test('SCB fees are explicit and unverified transfer templates are rejected', () => {
  const subject = 'แจ้งเตือนจากแอป SCB Easy: บริการอัตโนมัติแจ้งเตือนการทำธุรกรรม'
  const withFee = outgoing.replace('</table>', '<tr><td>ค่าธรรมเนียม</td><td>5.00 บาท</td></tr></table>')
  assert.equal(parseBankMail(message('scb', withFee, subject)).transaction.fee, 5)
  assert.equal(parseBankMail(message('scb', withFee.replace('5.00 บาท', 'ไม่ทราบ'), subject)).transaction, undefined)
  assert.equal(parseBankMail(message('scb', outgoing.replace('โอนเงินพร้อมเพย์', 'โอนเงิน'), subject)).transaction, undefined)
})
test('matched sender/receiver names flag possible own-account transfer', () => {
  assert.equal(parseBankMail(message('ktb', ktb.replace('นางผู้รับ ข', 'นายผู้ทดสอบ ก'))).transaction.possibleOwnTransfer, true)
})
test('bank display name does not authenticate sender; failed/spoofed auth rejected', () => {
  const m = message('ktb', ktb)
  m.payload.headers[0].value = 'Krungthai <attacker@example.org>'
  assert.equal(parseBankMail(m).reason, 'unsupported_sender')
  m.payload.headers[0].value = 'noreply@krungthai.com'
  for (const auth of ['mx.google.com; dkim=fail; dmarc=pass header.from=krungthai.com',
    'mx.google.com; dkim=pass header.i=@krungthai.com.evil; dmarc=pass header.from=krungthai.com',
    'evil; dkim=pass header.i=@krungthai.com; dmarc=pass header.from=krungthai.com']) {
    m.payload.headers[2].value = auth
    assert.equal(parseBankMail(m).reason, 'unverified_sender')
  }
})
test('statements, OTP and failed transfers are not inferred as money movements', () => {
  for (const subject of ['รหัส OTP', 'e-Statement', 'แจ้งผลการโอนเงินไม่สำเร็จ'])
    assert.equal(parseBankMail(message('ktb', ktb, subject)).reason, 'unsupported_template')
})
test('invalid dates, malformed money and multiple amounts fail closed', () => {
  for (const html of [ktb.replace('30/09', '31/09'), ktb.replace('1,234.50', '1,23.50'), ktb + '<p>จำนวนเงิน : 5.00 บาท</p>'])
    assert.equal(parseBankMail(message('ktb', html)).transaction, undefined)
})
test('oversized MIME is bounded; alternative bodies do not double-count', () => {
  assert.equal(parseBankMail(message('ktb', 'x'.repeat(300_000))).reason, 'mail_too_large')
  const part = { mimeType: 'text/plain', body: { data: Buffer.from('one').toString('base64url') } }
  assert.equal(mailText({ mimeType: 'multipart/alternative', parts: [part, part] }), 'one')
})
test('token encryption binds ciphertext to owner and detects tampering', () => {
  const before = process.env.BANK_MAIL_ENCRYPTION_KEY
  process.env.BANK_MAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  try {
    const sealed = sealMailSecret('synthetic-refresh-token', 'user-a:refresh')
    assert.equal(openMailSecret(sealed, 'user-a:refresh'), 'synthetic-refresh-token')
    assert.throws(() => openMailSecret(sealed, 'user-b:refresh'))
    const parts = sealed.split('.'); parts[2] = Buffer.alloc(16).toString('base64url')
    assert.throws(() => openMailSecret(parts.join('.'), 'user-a:refresh'))
    assert.ok(!sealed.includes('synthetic-refresh-token'))
  } finally { if (before === undefined) delete process.env.BANK_MAIL_ENCRYPTION_KEY; else process.env.BANK_MAIL_ENCRYPTION_KEY = before }
})
