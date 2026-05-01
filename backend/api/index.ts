import { NestFactory } from '@nestjs/core'
import { ValidationPipe, INestApplication } from '@nestjs/common'
import { AppModule } from '../src/app.module'

let cachedApp: INestApplication

async function bootstrap(): Promise<INestApplication> {
  if (cachedApp) return cachedApp

  cachedApp = await NestFactory.create(AppModule, { logger: false })

  cachedApp.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))

  cachedApp.setGlobalPrefix('api')

  cachedApp.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })

  await cachedApp.init()
  return cachedApp
}

export default async function handler(req: any, res: any) {
  // Strip Vercel Services route prefix before passing to NestJS
  if (req.url?.startsWith('/_/backend')) {
    req.url = req.url.slice('/_/backend'.length) || '/'
  }
  const app = await bootstrap()
  app.getHttpAdapter().getInstance()(req, res)
}
