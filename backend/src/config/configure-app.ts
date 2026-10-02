import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as express from 'express'
import { getCorsOptions } from './cors.config'

/** Identical HTTP policy for the long-running server and the serverless entry point. */
export function configureApp(app: NestExpressApplication): void {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0)
  if (!Number.isInteger(hops) || hops < 0) throw new Error('TRUST_PROXY_HOPS must be a non-negative integer')
  app.set('trust proxy', hops)
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })
  app.use(express.json({ limit: '20mb' }))
  app.use(express.urlencoded({ extended: true, limit: '20mb' }))
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))
  app.setGlobalPrefix('api')
  app.enableCors(getCorsOptions())
}
