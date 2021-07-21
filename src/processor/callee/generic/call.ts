import Logger, { LogLevel } from '../../../util/logger';
import WampError from '../../../error/WampError';
import SerializationError from '../../../error/SerializationError';
import Deferred from '../../../util/deferred';
import { EWampMessageID } from '../../../types/messages/MessageTypes';

import type { WampMessage } from '../../../types/Protocol';
import type { ProtocolViolator } from '../../AbstractProcessor';
import type { CallHandler } from '../../../types/Connection';
import type { InvocationDetails, WampYieldMessage } from '../../../types/messages/CallMessage';
import type { WampDict, WampID, WampList } from '../../../types/messages/MessageTypes';

class Call {
    public progress = false;

    public cancelled = false;

    private _cancelledDeferred = new Deferred<void>();

    constructor(
        handler: CallHandler,
        args: WampList,
        kwArgs: WampDict,
        details: InvocationDetails,
        public callId: WampID,
        private sender: (cid: number, msg: WampMessage, finish: boolean) => Promise<void>,
        private violator: ProtocolViolator,
        private logger: Logger,
    ) {
        args = args || [];
        kwArgs = kwArgs || {};
        details = details || {};
        details.onCancel = this._cancelledDeferred.promise;

        this.progress = details && !!details.receive_progress;

        // We want to actively catch rejected cancel promises.
        // Rejecting this cancel promise means, that the call wasn't canceled
        // and completed, so dropping any error is fine here.
        this._cancelledDeferred.promise.catch(() => {});

        const handle = () => {
            handler(args, kwArgs, details)
                .then(
                    (res) => this.onHandlerResult(res),
                    (err) => this.onHandlerError(err),
                )
                .catch((e) => this.violator(`Failed to send: ${e}`));
        };
        setTimeout(handle, 0);
    }

    public cancel(): void {
        if (this.cancelled) {
            return;
        }
        this.cancelled = true;
        this._cancelledDeferred.resolve();
    }

    //
    // - Handlers.
    //

    private async onHandlerResult(response: unknown): Promise<void> {
        let _response: { result: unknown, next?: Promise<unknown> };
        if (typeof response !== 'object' || response === null || !('result' in response)) {
            _response = { result: response };
        } else {
            _response = response as { result: unknown, next?: Promise<unknown> };
        }
        const { result, next } = _response;

        const isFinished = !next;
        if (isFinished || this.progress) {
            const message: WampYieldMessage = [
                EWampMessageID.YIELD,
                this.callId,
                { progress: !!_response.next && this.progress },
            ];

            if (typeof result === 'object' && result !== null && ('args' in result || 'kwargs' in result)) {
                const { args, kwargs } = (result as { args?: unknown, kwargs?: unknown });

                const isValidArgs = !args || Array.isArray(args);
                const isValidKwargs = !kwargs || typeof kwargs === 'object';
                if (!isValidArgs || !isValidKwargs) {
                    this.logger.log(
                        LogLevel.WARNING,
                        `Invalid result for call id "${this.callId}", sending error.`,
                        [isValidArgs, args],
                        [isValidKwargs, kwargs],
                    );
                    return this.onHandlerError(new WampError('wamp.error.runtime_error'));
                }

                const hasKwargs = kwargs && Object.keys(kwargs as Record<any, string>).length;
                if ((args as any[]).length || hasKwargs) {
                    message.push(args as any[]);
                    if (hasKwargs) {
                        message.push(kwargs as Record<any, string>);
                    }
                }
            } else {
                message.push([result]);
            }

            try {
                await this.sender(this.callId, message, isFinished);
            } catch (err) {
                if (err instanceof SerializationError) {
                    this.logger.log(
                        LogLevel.WARNING,
                        `Serialization for call id "${this.callId}" failed, sending error.`,
                    );
                    await this.onHandlerError(new WampError('wamp.error.serialization-error'));
                }
            }

            this.logger.log(LogLevel.DEBUG, `Call id "${this.callId}", sending yield.`);
        }

        if (next) {
            next
                .then(
                    (_response) => this.onHandlerResult(_response),
                    (error) => this.onHandlerError(error),
                )
                .catch((e) => this.violator(`Failed to send: ${e}`));
        }
    }

    private async onHandlerError(err: any): Promise<void> {
        let wampError: WampError | null = null;
        if (typeof err === 'string' || err instanceof String) {
            wampError = new WampError(err as string);
        } else if (err instanceof WampError) {
            wampError = err as WampError;
        } else {
            this.logger.log(LogLevel.WARNING, 'A runtime error occurred.', err);
            wampError = new WampError<any>('wamp.error.runtime_error', [err]);
        }
        const errorMessage = wampError.toErrorMessage(this.callId);

        this.logger.log(
            LogLevel.DEBUG,
            `Call id "${this.callId}", sending error "${wampError.errorUri}".`,
        );
        await this.sender(this.callId, errorMessage, true);
    }
}

export default Call;
