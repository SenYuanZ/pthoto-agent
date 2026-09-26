import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SceneController } from './scene.controller';
import { SceneService } from './scene.service';

@Module({
  imports: [ConfigModule, KnowledgeModule],
  controllers: [SceneController],
  providers: [SceneService],
})
export class SceneModule {}

