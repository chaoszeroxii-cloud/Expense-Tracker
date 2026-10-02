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

  /**
   * Record a payment against a loan.
   *
   * The whole thing runs in one transaction holding a lock on the loan row. It used to
   * read the payments, compute what was left, and only then insert — so two payments
   * submitted at once (a double-tap, or the same request retried after a lost response)
   * both saw the full remaining balance, both passed the check, and the loan ended up
   * over-paid with no error anywhere.
   */
  async addPayment(userId: string, loanId: string, dto: CreateLoanPaymentDto): Promise<Loan> {
    await this.loanRepo.manager.transaction(async (em) => {
      const loan = await em.getRepository(Loan)
        .createQueryBuilder('l')
        .setLock('pessimistic_write')
        .where('l.id = :loanId AND l.user_id = :userId', { loanId, userId })
        .getOne()
      if (!loan) throw new NotFoundException('Loan not found')

      const [row] = await em.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid FROM loan_payments WHERE loan_id = $1`,
        [loanId],
      )
      const paid = parseFloat(row?.paid ?? '0') || 0
      const total = parseFloat(loan.amount as any)
      const remaining = total - paid

      if (dto.amount > remaining + 0.01) {
        throw new BadRequestException(
          `Payment exceeds remaining balance. Outstanding: ฿${Math.max(0, remaining).toFixed(2)}`,
        )
      }

      await em.query(
        `INSERT INTO loan_payments (id, loan_id, amount, paid_at, note) VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [loanId, dto.amount, new Date(dto.paidAt), dto.note ?? ''],
      )

      if (paid + dto.amount >= total - 0.01) {
        await em.update(Loan, { id: loanId }, { status: 'settled' })
      }
    })

    return this.loanRepo.findOne({ where: { id: loanId, userId }, relations: ['payments'] })
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
