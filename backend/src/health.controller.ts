import { Controller, Get } from '@nestjs/common'
import { Public } from './modules/auth/jwt-auth.guard'

@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }
}
