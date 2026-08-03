import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('list')
  listDocuments() {
    return {
      totalChunks: this.knowledgeService.getDocumentCount(),
      documents: this.knowledgeService.listDocuments(),
    };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: any,
    @Body('category') category?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
    ];

    if (
      !allowedTypes.includes(file.mimetype) &&
      !file.originalname.match(/\.(txt|md|json|csv)$/)
    ) {
      throw new HttpException(
        'Only .txt, .md, .json, .csv files are allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const content = file.buffer.toString('utf-8');
      const result = await this.knowledgeService.addDocument(
        content,
        file.originalname,
        category || '用户上传',
      );
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        `Failed to process document: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('text')
  async addText(@Body() body: { content: string; source: string; category?: string }) {
    if (!body.content || !body.source) {
      throw new HttpException(
        'content and source are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.knowledgeService.addDocument(
        body.content,
        body.source,
        body.category || '用户上传',
      );
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        `Failed to process document: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reindex')
  async reindex() {
    await this.knowledgeService.reindex();
    return {
      success: true,
      message: 'Knowledge base reindexed',
      totalChunks: this.knowledgeService.getDocumentCount(),
    };
  }

  @Get('chunks')
  getChunks(@Query('source') source: string) {
    if (!source) {
      throw new HttpException('source query param is required', HttpStatus.BAD_REQUEST);
    }
    return {
      source,
      chunks: this.knowledgeService.getChunks(source),
    };
  }

  @Get('document/:source')
  getDocument(@Param('source') source: string) {
    const content = this.knowledgeService.getOriginal(source);
    const doc = this.knowledgeService.listDocuments().find((d) => d.source === source);
    if (content === null && !doc) {
      throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
    }
    return {
      source,
      category: doc?.category || '',
      content: content || '',
    };
  }

  @Put('document/:source')
  async updateDocument(
    @Param('source') source: string,
    @Body() body: { content: string; category?: string },
  ) {
    if (!body.content) {
      throw new HttpException('content is required', HttpStatus.BAD_REQUEST);
    }
    const chunkCount = await this.knowledgeService.updateDocument(
      source,
      body.content,
      body.category,
    );
    return { success: true, source, chunkCount };
  }

  @Delete('document/:source')
  async deleteDocument(@Param('source') source: string) {
    await this.knowledgeService.removeDocument(source);
    return { success: true, source };
  }
}
