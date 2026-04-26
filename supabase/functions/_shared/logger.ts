/**
 * Logger structuré pour Edge Functions.
 *
 * Persiste dans table `function_logs` (Supabase) au lieu de console.log.
 * Les logs sont consultables via /admin/slo et exportables.
 */

import { createServiceClient } from './auth.ts';

export interface LogContext {
  functionName: string;
  requestId: string;
  userId?: string;
  organizationId?: string;
}

export class FunctionLogger {
  private logId: string | null = null;
  private startedAt: number;

  constructor(private ctx: LogContext) {
    this.startedAt = Date.now();
  }

  async start(params?: Record<string, unknown>): Promise<void> {
    const service = createServiceClient();
    const { data, error } = await service
      .from('function_logs')
      .insert({
        function_name: this.ctx.functionName,
        request_id: this.ctx.requestId,
        user_id: this.ctx.userId,
        organization_id: this.ctx.organizationId,
        status: 'started',
        params,
      })
      .select('id')
      .single();
    if (!error && data) {
      this.logId = data.id as string;
    }
  }

  async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.write('info', message, metadata);
  }

  async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.write('warn', message, metadata);
  }

  async error(message: string, error?: Error, metadata?: Record<string, unknown>): Promise<void> {
    await this.write('error', message, {
      ...metadata,
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
  }

  async success(httpStatus: number, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.logId) return;
    const service = createServiceClient();
    await service
      .from('function_logs')
      .update({
        status: 'success',
        http_status: httpStatus,
        duration_ms: Date.now() - this.startedAt,
        completed_at: new Date().toISOString(),
        message: metadata ? JSON.stringify(metadata).slice(0, 500) : null,
      })
      .eq('id', this.logId);
  }

  async failure(httpStatus: number, errorMessage: string, errorStack?: string): Promise<void> {
    if (!this.logId) return;
    const service = createServiceClient();
    await service
      .from('function_logs')
      .update({
        status: 'error',
        http_status: httpStatus,
        duration_ms: Date.now() - this.startedAt,
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        error_stack: errorStack ?? null,
      })
      .eq('id', this.logId);
  }

  private async write(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const service = createServiceClient();
    await service.from('function_logs').insert({
      function_name: this.ctx.functionName,
      request_id: this.ctx.requestId,
      user_id: this.ctx.userId,
      organization_id: this.ctx.organizationId,
      status: 'started',
      level,
      message,
      params: metadata,
    });
  }
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}
