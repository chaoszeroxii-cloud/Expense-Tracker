import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TaxDeduction } from './tax-deduction.entity'
import { TaxService } from './tax.service'
import { TaxController } from './tax.controller'

@Module({
  imports: [TypeOrmModule.forFeature([TaxDeduction])],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
