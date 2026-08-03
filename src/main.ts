import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`\n  ============================================`);
  console.log(`   Photography Knowledge Q&A System Started!`);
  console.log(`   Local:   http://localhost:${port}`);
  console.log(`   Chat UI: http://localhost:${port}`);
  console.log(`   API:     http://localhost:${port}/chat/stream`);
  console.log(`   ============================================\n`);
}
bootstrap();
