import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SceneRequestDto } from './dto/scene.dto';
import { SceneService } from './scene.service';

@Controller('scene')
export class SceneController {
  constructor(
    private readonly sceneService: SceneService,
    private readonly configService: ConfigService,
  ) {}

  @Post('stream')
  stream(
    @Req() req: Request,
    @Body() dto: SceneRequestDto,
    @Res() res: Response,
  ): void {
    const expectedToken = this.configService.get<string>('scene.internalToken');
    const requestToken = req.headers['x-internal-token'];
    if (expectedToken && requestToken !== expectedToken) {
      throw new ForbiddenException('场景接口仅允许主服务端调用');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    sendEvent('start', { type: 'start', scene: dto.scene });

    const stream = this.sceneService.createStream(dto);
    stream.subscribe({
      next: (event) => {
        if (event.type === 'token') sendEvent('token', event);
        if (event.type === 'done') sendEvent('done', event);
        if (event.type === 'error') sendEvent('error', event);
      },
      error: (error) => {
        sendEvent('error', { type: 'error', error: (error as Error).message });
        res.end();
      },
      complete: () => res.end(),
    });
  }
}

