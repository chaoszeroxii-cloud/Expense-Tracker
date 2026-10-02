export interface BillInput {
  name: string
  amount: number
  categoryId: string
  dueDay: number
}
export interface Bill extends Omit<BillInput, 'categoryId'> {
  id: string
  month: string
  categoryId: string | null
  categoryName: string | null
  active: boolean
  dueDate: string
  expenseId: string | null
  paidAmount: number | null
  paidDate: string | null
  status: 'paid' | 'overdue' | 'due_today' | 'upcoming'
}
export interface GoalInput {
  name: string
  targetAmount: number
  savedAmount: number
  targetDate: string
}
export interface SavingsGoal extends GoalInput {
  id: string
  remaining: number
  monthlyNeeded: number
  status: 'complete' | 'overdue' | 'saving'
}
export interface PlanningOverview {
  month: string
  today: string
  unpaidBills: number
  billsPaidToday: number
  bills: Bill[]
  goals: SavingsGoal[]
}
