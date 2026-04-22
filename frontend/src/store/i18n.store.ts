import { create } from 'zustand'

export type Lang = 'en' | 'th'

// ─────────────────────────────────────────────────────────────
// Translation dictionary
// ─────────────────────────────────────────────────────────────
const dict = {
  en: {
    // Nav
    nav_dashboard:  'Dashboard',
    nav_history:    'History',
    nav_wallets:    'Wallets',
    nav_settings:   'Settings',

    // Dashboard
    total_expenses:    'Total Expenses',
    income:            'Income',
    avg_per_day:       'Avg/day',
    transactions:      'Transactions',
    spending_category: 'Spending by Category',
    this_month:        'This month',
    trend_12m:         '12-Month Trend',
    net_balance:       'Net Balance',
    wallets:           'Wallets',
    no_wallets:        'No wallets yet — create one in Settings first.',
    settings_wallets:  'Settings → Wallets',
    spent:             'Spent',
    used:              'used',
    balance:           'Balance · Spent this month',

    // Add Expense
    add_transaction:   'Add Transaction',
    expense:           'Expense',
    income_tab:        'Income',
    amount:            'Amount (฿)',
    into_wallet:       'Into Wallet',
    no_wallets_warn:   '⚠️ No wallets yet — create one in Settings first.',
    category:          'Category',
    will_deduct:       'Will deduct from:',
    current_balance:   'Current balance:',
    after:             'after',
    no_wallet_linked:  "This category isn't linked to any wallet.",
    date:              'Date',
    note_optional:     'Note (optional)',
    note_placeholder:  'What was this for?',
    save_expense:      'Save Expense',
    save_income:       'Save Income',
    saving:            'Saving…',
    saved:             'Saved!',

    // History
    history:           'History',
    all:               'All',
    no_transactions:   'No transactions',
    try_filter:        'Try a different month or filter',
    item:              'item',
    items:             'items',
    delete_confirm:    'Delete this transaction?',

    // Auth
    sign_in:           'Sign In',
    create_account:    'Create Account',
    full_name:         'Full Name',
    email:             'Email',
    password:          'Password',
    min_chars:         '(min 8 chars)',
    please_wait:       'Please wait…',
    tagline:           'Track every baht, effortlessly',
    privacy_note:      'Your data stays private and secure.',

    // Settings
    settings:          'Settings',
    display_name:      'Display Name',
    save_changes:      'Save Changes',
    saving_:           'Saving…',
    saved_:            '✓ Saved',
    categories:        'Categories',
    expenses_tab:      'Expenses',
    income_tab2:       'Income',
    add:               'Add',
    new_category:      'New Category',
    edit_category:     'Edit Category',
    cat_name_ph:       'Category name',
    icon:              'Icon',
    color:             'Color',
    preview:           'Preview',
    default_label:     'default',
    sign_out:          'Sign Out',
    appearance:        'Appearance',
    dark_mode:         'Dark Mode',
    language:          'Language',
    theme_light:       'Light',
    theme_dark:        'Dark',

    // Wallets
    wallets_title:     'Wallets',
    new_wallet:        'New Wallet',
    edit_wallet:       'Edit Wallet',
    wallet_name_ph:    'e.g. Food budget, Savings',
    linked_cats:       'Linked Expense Categories',
    linked_cats_desc:  'Expenses in these categories will auto-deduct from this wallet.',
    no_wallet_items:   'No wallets yet — add one above',
    delete_wallet:     'Delete this wallet? The balance will be lost.',
    categorys:         'category',
    categorys_pl:      'categories',
  },
  th: {
    // Nav
    nav_dashboard:  'ภาพรวม',
    nav_history:    'ประวัติ',
    nav_wallets:    'ซองเงิน',
    nav_settings:   'ตั้งค่า',

    // Dashboard
    total_expenses:    'รายจ่ายรวม',
    income:            'รายรับ',
    avg_per_day:       'เฉลี่ย/วัน',
    transactions:      'รายการ',
    spending_category: 'รายจ่ายตามหมวดหมู่',
    this_month:        'เดือนนี้',
    trend_12m:         'แนวโน้ม 12 เดือน',
    net_balance:       'ยอดคงเหลือสุทธิ',
    wallets:           'ซองเงิน',
    no_wallets:        'ยังไม่มีซองเงิน — สร้างในตั้งค่าก่อน',
    settings_wallets:  'ตั้งค่า → ซองเงิน',
    spent:             'ใช้ไป',
    used:              'ใช้แล้ว',
    balance:           'ยอดเงิน · ใช้ไปเดือนนี้',

    // Add Expense
    add_transaction:   'เพิ่มรายการ',
    expense:           'รายจ่าย',
    income_tab:        'รายรับ',
    amount:            'จำนวนเงิน (฿)',
    into_wallet:       'เข้าซองเงิน',
    no_wallets_warn:   '⚠️ ยังไม่มีซองเงิน — สร้างในตั้งค่าก่อน',
    category:          'หมวดหมู่',
    will_deduct:       'จะหักจาก:',
    current_balance:   'ยอดปัจจุบัน:',
    after:             'หลังหัก',
    no_wallet_linked:  'หมวดหมู่นี้ยังไม่ได้ผูกกับซองเงินใด',
    date:              'วันที่',
    note_optional:     'หมายเหตุ (ไม่บังคับ)',
    note_placeholder:  'ใช้ทำอะไร?',
    save_expense:      'บันทึกรายจ่าย',
    save_income:       'บันทึกรายรับ',
    saving:            'กำลังบันทึก…',
    saved:             'บันทึกแล้ว!',

    // History
    history:           'ประวัติ',
    all:               'ทั้งหมด',
    no_transactions:   'ไม่มีรายการ',
    try_filter:        'ลองเปลี่ยนเดือนหรือตัวกรอง',
    item:              'รายการ',
    items:             'รายการ',
    delete_confirm:    'ลบรายการนี้?',

    // Auth
    sign_in:           'เข้าสู่ระบบ',
    create_account:    'สร้างบัญชี',
    full_name:         'ชื่อ-นามสกุล',
    email:             'อีเมล',
    password:          'รหัสผ่าน',
    min_chars:         '(อย่างน้อย 8 ตัว)',
    please_wait:       'กรุณารอสักครู่…',
    tagline:           'ติดตามทุกบาท ง่ายๆ',
    privacy_note:      'ข้อมูลของคุณปลอดภัยและเป็นส่วนตัว',

    // Settings
    settings:          'ตั้งค่า',
    display_name:      'ชื่อที่แสดง',
    save_changes:      'บันทึก',
    saving_:           'กำลังบันทึก…',
    saved_:            '✓ บันทึกแล้ว',
    categories:        'หมวดหมู่',
    expenses_tab:      'รายจ่าย',
    income_tab2:       'รายรับ',
    add:               'เพิ่ม',
    new_category:      'หมวดหมู่ใหม่',
    edit_category:     'แก้ไขหมวดหมู่',
    cat_name_ph:       'ชื่อหมวดหมู่',
    icon:              'ไอคอน',
    color:             'สี',
    preview:           'ตัวอย่าง',
    default_label:     'ค่าเริ่มต้น',
    sign_out:          'ออกจากระบบ',
    appearance:        'หน้าตาแอป',
    dark_mode:         'โหมดมืด',
    language:          'ภาษา',
    theme_light:       'สว่าง',
    theme_dark:        'มืด',

    // Wallets
    wallets_title:     'ซองเงิน',
    new_wallet:        'ซองเงินใหม่',
    edit_wallet:       'แก้ไขซองเงิน',
    wallet_name_ph:    'เช่น เงินกิน, เงินออม',
    linked_cats:       'หมวดหมู่รายจ่ายที่ผูก',
    linked_cats_desc:  'รายจ่ายในหมวดเหล่านี้จะหักจากซองเงินนี้อัตโนมัติ',
    no_wallet_items:   'ยังไม่มีซองเงิน — เพิ่มด้านบน',
    delete_wallet:     'ลบซองเงินนี้? ยอดเงินจะหายไป',
    categorys:         'หมวด',
    categorys_pl:      'หมวด',
  },
} as const

export type TKey = keyof typeof dict['en']

// ─────────────────────────────────────────────────────────────
interface I18nState {
  lang: Lang
  t: (key: TKey) => string
  setLang: (l: Lang) => void
}

const storedLang = (localStorage.getItem('flo_lang') as Lang) || 'th'

export const useI18n = create<I18nState>((set, get) => ({
  lang: storedLang,

  t: (key: TKey) => dict[get().lang][key] ?? dict['en'][key] ?? key,

  setLang: (lang) => {
    localStorage.setItem('flo_lang', lang)
    set({ lang })
  },
}))

/** Shorthand hook — returns translator function only */
export const useT = () => useI18n((s) => s.t)
