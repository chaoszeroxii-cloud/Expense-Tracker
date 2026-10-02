import { NestFactory } from '@nestjs/core'
import { INestApplication } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/config/configure-app'

// A promise, not the app itself. Assigning `cachedApp` only after `init()` lets two
// concurrent cold invocations each build a whole Nest app; assigning it before `init()`
// — as the original did — lets the second one serve requests through an app that has not
// finished initialising. Caching the in-flight promise is the only version that is
// correct under concurrency.
let bootstrapPromise: Promise<INestApplication> | null = null

function bootstrap(): Promise<INestApplication> {
  if (!bootstrapPromise) bootstrapPromise = create().catch(error => {
    bootstrapPromise = null
    throw error
  })
  return bootstrapPromise
}

async function create(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  })

  configureApp(app)

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
