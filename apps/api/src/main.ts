import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import 'reflect-metadata';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // needed for Facebook webhook signature verification
  });
  const config = app.get(ConfigService);

  // Render terminates TLS at its own proxy, so without this every request arrives carrying the
  // proxy's address and req.ip is identical for the entire internet. The rate limiters below would
  // then share one bucket across all traffic: eleven enquiries from anywhere on earth and the
  // public form starts refusing genuine patients, while a single abuser cannot be told apart from
  // everyone else. `1` trusts exactly Render's own hop, so a client cannot forge its address by
  // sending its own X-Forwarded-For header.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = config.get<string[]>('cors.origin') ?? ['http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // The web app and the API are on different origins, so by default JavaScript in the browser
    // can read only a handful of response headers — everything else is stripped before it reaches
    // fetch(), silently and with no error. The CSV export needs both of these: the filename it
    // should save under, and the row count it actually received.
    exposedHeaders: ['Content-Disposition', 'X-Export-Count'],
  });

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Sign-in, which was the loosest door in the building: it sat under the global 300 above — the
  // same budget as browsing the app — so one address could try three hundred passwords a quarter
  // hour against a system with no second factor. Ten is generous for someone who has forgotten
  // which of their passwords they used, and hopeless for anyone working through a word list.
  //
  // This is the per-IP half of the defence. The per-account half is the lockout in AuthService,
  // which is what stops a botnet spreading the same guesses across many addresses so that no
  // single IP ever trips this limit. `skipSuccessfulRequests` so a clinic behind one NAT at eight
  // in the morning is never rationed for signing in correctly.
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'Too many sign-in attempts. Try again shortly.' },
    }),
  );

  // Password reset. Both endpoints are public and unauthenticated, and each is abusable in its
  // own way: /forgot-password sends real email to a real mailbox, so an unthrottled loop turns
  // this API into a way to flood someone's inbox and burn the clinic's sending reputation;
  // /reset-password is where a stolen-token guess would be attempted. Five per quarter hour is
  // several times what a person who has genuinely lost their password will need.
  app.use(
    ['/api/auth/forgot-password', '/api/auth/reset-password'],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, message: 'Too many password reset attempts. Try again shortly.' },
    }),
  );

  // Stricter limiter for the public, unauthenticated patient portal — path-scoped via the
  // first argument so it stacks on top of (not replaces) the global limiter above.
  app.use(
    '/api/portal',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Tighter still for the public enquiry form. It is an unauthenticated *write* endpoint that
  // creates a lead on every call, so the cost of abuse is a polluted pipeline rather than just
  // load — a genuine patient fills this in once.
  app.use(
    '/api/intake',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dental Clinic CRM API')
    .setDescription('REST API for the Dental Clinic CRM')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
