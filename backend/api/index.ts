import { NestFactory } from '@nestjs/core'
import { ValidationPipe, INestApplication } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as express from 'express'
import { AppModule } from '../src/app.module'
import { getCorsOptions } from '../src/config/cors.config'

// A promise, not the app itself. Assigning `cachedApp` only after `init()` lets two
// concurrent cold invocations each build a whole Nest app; assigning it before `init()`
// — as the original did — lets the second one serve requests through an app that has not
// finished initialising. Caching the in-flight promise is the only version that is
// correct under concurrency.
let bootstrapPromise: Promise<INestApplication> | null = null

/**
 * Serverless entry point.
 *
 * This file is excluded from the main tsconfig, so nothing here is type-checked with the
 * rest of the backend and it drifted away from `src/main.ts` in three ways that all
 * failed silently in production:
 *
 *   - CORS listed four verbs and omitted PUT, which `PUT /allocations/plans` and
 *     `PUT /check-ins/:date` both use. A missing verb still answers the preflight 204;
 *     the browser then declines to send the real request and the client sees an error
 *     with no response, indistinguishable from a dead network. That is exactly the
 *     failure `src/config/cors.config.ts` was written to prevent — so use it, rather
 *     than keeping a second hand-maintained list.
 *   - `origin: '*'` was the default, which is broader than the deployed allow-list.
 *   - The body limit was Nest's 100 kB default while `main.ts` allows 20 MB, so every
 *     receipt photo upload was rejected on this path alone.
 */
function bootstrap(): Promise<INestApplication> {
  if (!bootstrapPromise) bootstrapPromise = create()
  return bootstrapPromise
}

async function create(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  })

  // The platform terminates TLS and forwards; without this the rate limiter buckets
  // every caller under the proxy address. Same reasoning as src/main.ts.
  const proxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '1', 10)
  app.set('trust proxy', Number.isFinite(proxyHops) ? proxyHops : 1)

  app.use(express.json({ limit: '20mb' }))
  app.use(express.urlencoded({ extended: true, limit: '20mb' }))

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))

  app.setGlobalPrefix('api')
  app.enableCors(getCorsOptions())

  await app.init()
  return app
}

export default async function handler(req: any, res: any) {
  // Strip Vercel Services route prefix before passing to NestJS
  if (req.url?.startsWith('/_/backend')) {
    req.url = req.url.slice('/_/backend'.length) || '/'
  }
  const app = await bootstrap()
  app.getHttpAdapter().getInstance()(req, res)
}
