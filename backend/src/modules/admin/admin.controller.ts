import { Controller, Get, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { AdminService } from './admin.service'
import { AdminGuard } from '../auth/roles.guard'
import { IsIn } from 'class-validator'

class SetRoleDto {
  @IsIn(['user', 'admin'])
  role: 'user' | 'admin'
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('stats')
  getStats() {
    return this.svc.getStats()
  }

  @Get('users')
  findAll() {
    return this.svc.findAllUsers('')
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.svc.getUserDetail(id)
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.svc.setRole(id, dto.role)
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.svc.deleteUser(id)
  }
}
