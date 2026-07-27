import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const body = typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null;

    // Whatever else the thrower attached comes through. Some exceptions carry fields the client
    // acts on rather than merely prints — the duplicate-number conflict names the deal already
    // holding that number, so the dialog can offer to open it — and picking out only `message` and
    // `error` silently dropped them, leaving the browser a sentence it could not act on.
    //
    // Spread first, so a payload can never overwrite the canonical fields below: an exception is
    // not allowed to declare its own statusCode and have the body disagree with the HTTP status.
    // Nothing reaches here from a non-HttpException except the fixed string above, so an internal
    // error still cannot leak its details this way.
    const errorResponse = {
      ...(body ?? {}),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: body && 'message' in body ? body.message : message,
      error: body && 'error' in body ? body.error : HttpStatus[status],
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(errorResponse);
  }
}
