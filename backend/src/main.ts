import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { getCorsOptions } from './config/cors.config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Behind nginx / Render / Vercel the immediate peer is the load balancer, so
  // `req.ip` is the proxy's address for every caller. ThrottlerGuard keys on it,
  // which silently collapsed the 100 req/min ceiling into a single bucket shared
  // by the whole user base — the app starts returning 429 to everyone at a few
  // active users. Trusting a fixed hop count (not `true`) makes `req.ips` resolve
  // the real client while still refusing a spoofed X-Forwarded-For from outside.
  const proxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '1', 10);
  app.set('trust proxy', Number.isFinite(proxyHops) ? proxyHops : 1);

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Global validation pipe — strips unknown fields, transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  app.enableCors(getCorsOptions());

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);
}

bootstrap();
