import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TaxDeduction } from './tax-deduction.entity'
import { UpsertTaxDeductionDto } from './dto/tax.dto'

// Thai personal income tax brackets 2568 (2025)
const TAX_BRACKETS = [
  { min: 0, max: 150000, rate: 0 },
  { min: 150000, max: 300000, rate: 0.05 },
  { min: 300000, max: 500000, rate: 0.10 },
  { min: 500000, max: 750000, rate: 0.15 },
  { min: 750000, max: 1000000, rate: 0.20 },
  { min: 1000000, max: 2000000, rate: 0.25 },
  { min: 2000000, max: 5000000, rate: 0.30 },
  { min: 5000000, max: Infinity, rate: 0.35 },
]

// Standard deduction limits for common types
export const DEDUCTION_LIMITS: Record<string, { name: string; max: number; description: string }> = {
  personal_allowance:   { name: 'ค่าลดหย่อนส่วนตัว', max: 60000, description: 'ลดหย่อนส่วนตัว 60,000 บาท' },
  employment_income:    { name: 'ค่าใช้จ่ายเงินเดือน', max: 100000, description: '50% ของเงินได้ ไม่เกิน 100,000 บาท' },
  spouse_allowance:     { name: 'ค่าลดหย่อนคู่สมรส', max: 60000, description: 'คู่สมรสไม่มีรายได้' },
  child_allowance:      { name: 'ค่าลดหย่อนบุตร', max: 180000, description: 'บุตรคนละ 30,000 บาท สูงสุด 3 คน' },
  parent_allowance:     { name: 'ค่าลดหย่อนบิดามารดา', max: 120000, description: 'บิดา/มารดาคนละ 30,000 บาท' },
  life_insurance:       { name: 'ประกันชีวิต', max: 100000, description: 'เบี้ยประกันชีวิตทั่วไป' },
  health_insurance:     { name: 'ประกันสุขภาพ', max: 25000, description: 'เบี้ยประกันสุขภาพตัวเอง' },
  parent_health_ins:    { name: 'ประกันสุขภาพบิดามารดา', max: 15000, description: 'เบี้ยประกันสุขภาพบิดามารดา' },
  ssf:                  { name: 'กองทุน SSF', max: 200000, description: 'ซื้อ SSF สูงสุด 30% ของเงินได้ ไม่เกิน 200,000 บาท' },
  rmf:                  { name: 'กองทุน RMF', max: 500000, description: 'ซื้อ RMF สูงสุด 30% ของเงินได้' },
  pvd:                  { name: 'กองทุนสำรองเลี้ยงชีพ', max: 500000, description: 'กองทุนสำรองเลี้ยงชีพ' },
  gpf:                  { name: 'กองทุนบำเหน็จบำนาญ', max: 500000, description: 'กบข.' },
  nsf:                  { name: 'กองทุนการออมแห่งชาติ', max: 13200, description: 'NSF' },
  mortgage_interest:    { name: 'ดอกเบี้ยบ้าน', max: 100000, description: 'ดอกเบี้ยเงินกู้ซื้อบ้าน' },
  donation_general:     { name: 'บริจาคทั่วไป', max: 0, description: 'บริจาคทั่วไป ลดหย่อนได้ 2 เท่า แต่ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย' },
  donation_education:   { name: 'บริจาคเพื่อการศึกษา', max: 0, description: 'บริจาคเพื่อการศึกษา ลดหย่อนได้ 2 เท่า' },
  easy_e_receipt:       { name: 'Easy E-Receipt', max: 50000, description: 'ช้อปสินค้า Easy E-Receipt' },
  social_security:      { name: 'ประกันสังคม', max: 9000, description: 'เงินสมทบประกันสังคม' },
}

@Injectable()
export class TaxService {
  constructor(
    @InjectRepository(TaxDeduction)
    private readonly repo: Repository<TaxDeduction>,
  ) {}

  async upsert(userId: string, dto: UpsertTaxDeductionDto): Promise<TaxDeduction> {
    const existing = await this.repo.findOne({
      where: { userId, taxYear: dto.taxYear, type: dto.type },
    })
    if (existing) {
      Object.assign(existing, { name: dto.name, amount: dto.amount, maxAmount: dto.maxAmount, note: dto.note })
      return this.repo.save(existing)
    }
    return this.repo.save(this.repo.create({ userId, ...dto }))
  }

  async findByYear(userId: string, taxYear: number): Promise<TaxDeduction[]> {
    return this.repo.find({ where: { userId, taxYear }, order: { type: 'ASC' } })
  }

  async remove(userId: string, id: string): Promise<void> {
    const item = await this.repo.findOne({ where: { id, userId } })
    if (!item) throw new NotFoundException('Tax deduction not found')
    await this.repo.remove(item)
  }

  getDeductionTypes() {
    return Object.entries(DEDUCTION_LIMITS).map(([type, info]) => ({ type, ...info }))
  }

  async calculate(userId: string, annualIncome: number, taxYear: number) {
    const deductions = await this.findByYear(userId, taxYear)
    const totalDeductions = deductions.reduce((s, d) => {
      const limit = DEDUCTION_LIMITS[d.type]?.max
      const amount = parseFloat(d.amount as any)
      return s + (limit && limit > 0 ? Math.min(amount, limit) : amount)
    }, 0)

    const employmentDeduction = Math.min(annualIncome * 0.5, 100000)
    const netIncome = Math.max(0, annualIncome - employmentDeduction - totalDeductions)
    const tax = this.calculateTax(netIncome)

    const optimizations = this.suggestOptimizations(deductions, annualIncome, tax)

    return {
      annualIncome,
      employmentDeduction,
      totalDeductions,
      netIncome,
      tax,
      effectiveRate: annualIncome > 0 ? (tax / annualIncome) * 100 : 0,
      deductions,
      optimizations,
    }
  }

  private calculateTax(netIncome: number): number {
    let tax = 0
    for (const bracket of TAX_BRACKETS) {
      if (netIncome <= bracket.min) break
      const taxable = Math.min(netIncome, bracket.max) - bracket.min
      tax += taxable * bracket.rate
    }
    return Math.round(tax * 100) / 100
  }

  private suggestOptimizations(deductions: TaxDeduction[], income: number, currentTax: number) {
    const suggestions: any[] = []
    const usedTypes = new Set(deductions.map((d) => d.type))

    const prioritized = ['ssf', 'rmf', 'life_insurance', 'health_insurance', 'mortgage_interest']
    for (const type of prioritized) {
      if (!usedTypes.has(type)) {
        const info = DEDUCTION_LIMITS[type]
        const maxDeduct = Math.min(info.max, income * 0.3)
        const taxSaving = this.calculateTax(income) - this.calculateTax(Math.max(0, income - maxDeduct))
        if (taxSaving > 0) {
          suggestions.push({
            type,
            name: info.name,
            maxAmount: info.max,
            estimatedTaxSaving: Math.round(taxSaving),
            description: info.description,
          })
        }
      }
    }
    return suggestions.slice(0, 5)
  }
}
