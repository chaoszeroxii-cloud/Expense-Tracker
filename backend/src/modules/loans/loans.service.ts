import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Loan, LoanPayment } from './loan.entity'
import { CreateLoanDto, CreateLoanPaymentDto } from './dto/loan.dto'

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    @InjectRepository(LoanPayment) private readonly paymentRepo: Repository<LoanPayment>,
  ) {}

  async create(userId: string, dto: CreateLoanDto): Promise<Loan> {
    return this.loanRepo.save(
      this.loanRepo.create({
        userId,
        direction: dto.direction ?? 'lent',
        borrower: dto.borrower,
        amount: dto.amount,
        note: dto.note,
        lentAt: new Date(dto.lentAt),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'active',
      }),
    )
  }

  async findAll(userId: string): Promise<any[]> {
    const loans = await this.loanRepo.find({
      where: { userId },
      relations: ['payments'],
      order: { lentAt: 'DESC' },
    })
    return loans.map((l) => this.enrichLoan(l))
  }

  async findActive(userId: string): Promise<any[]> {
    const loans = await this.loanRepo.find({
      where: { userId, status: 'active' },
      relations: ['payments'],
      order: { lentAt: 'DESC' },
    })
    return loans.map((l) => this.enrichLoan(l))
  }

  async addPayment(userId: string, loanId: string, dto: CreateLoanPaymentDto): Promise<Loan> {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId, userId },
      relations: ['payments'],
    })
    if (!loan) throw new NotFoundException('Loan not found')

    const paid = loan.payments.reduce((s, p) => s + parseFloat(p.amount as any), 0)
    const remaining = parseFloat(loan.amount as any) - paid

    if (dto.amount > remaining + 0.01) {
      throw new BadRequestException('Payment exceeds remaining balance')
    }

    await this.paymentRepo.manager.query(
      `INSERT INTO loan_payments (id, loan_id, amount, paid_at, note) VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [loanId, dto.amount, new Date(dto.paidAt), dto.note ?? ''],
    )

    const newPaid = paid + dto.amount
    if (newPaid >= parseFloat(loan.amount as any) - 0.01) {
      loan.status = 'settled'
      await this.loanRepo.save(loan)
    }

    return this.loanRepo.findOne({ where: { id: loanId }, relations: ['payments'] })
  }

  async remove(userId: string, id: string): Promise<void> {
    const loan = await this.loanRepo.findOne({ where: { id, userId } })
    if (!loan) throw new NotFoundException('Loan not found')
    await this.loanRepo.remove(loan)
  }

  async getDashboardSummary(userId: string) {
    const active = await this.findActive(userId)
    const lentActive = active.filter(l => l.direction === 'lent')
    const borrowedActive = active.filter(l => l.direction === 'borrowed')
    return {
      activeLoans: active.length,
      totalOutstanding: lentActive.reduce((s, l) => s + l.outstanding, 0),
      totalOwed: borrowedActive.reduce((s, l) => s + l.outstanding, 0),
      loans: active,
    }
  }

  private enrichLoan(loan: Loan) {
    const paidAmount = loan.payments.reduce((s, p) => s + parseFloat(p.amount as any), 0)
    const amount = parseFloat(loan.amount as any)
    return {
      id: loan.id,
      direction: loan.direction ?? 'lent',
      borrower: loan.borrower,
      amount,
      paidAmount,
      outstanding: amount - paidAmount,
      note: loan.note,
      lentAt: loan.lentAt,
      dueDate: loan.dueDate,
      status: loan.status,
      payments: loan.payments,
    }
  }
}
