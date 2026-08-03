import { Module, Global } from '@nestjs/common';
import { JsonStore } from './json-store';

/**
 * Global module exposing shared infra (currently only the JSON file store).
 */
@Global()
@Module({
  providers: [JsonStore],
  exports: [JsonStore],
})
export class CommonModule {}