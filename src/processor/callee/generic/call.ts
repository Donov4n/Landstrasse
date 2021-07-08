import Logger, { LogLevel } from '../../../util/logger';
import WampError from '../../../error/WampError';
import SerializationError from '../../../error/SerializationError';
import Deferred from '../../../util/deferred';
import { EWampMessageID } from '../../../types/messages/MessageTypes';

import type { WampMessage } from '../../../types/Protocol';
import type { ProtocolViolator } from '../../AbstractProcessor';
import type { CallHandler, CallResult } from '../../../types/Connection';
import type { InvocationDetails, WampYieldMessage } from '../../../types/messages/CallMessage';
import type { WampDict, WampID, WampList } from '../../../types/messages/MessageTypes';

class Call {
    public progress = false;
    public cancelled = false;
    private onCancel = new Deferred<void>();

    constructor(
        handler: CallHandler<WampList, WampDict, WampList, WampDict>,
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
        details.onCancel = this.onCancel.promise;

        // We want to actively catch rejected cancel promises.
        // Rejecting this cancel promise means, that the call wasn't canceled and completed, so
        // dropping any error is fine here.
        this.onCancel.promise.catch(() => {});
        this.progress = details && !!details.receive_progress;

        setTimeout(
            () => {
                handler(args, kwArgs, details)
                    .then(
                        (res) => this.onHandlerResult(res),
                        (err) => this.onHandlerError(err),
                    )
                    .catch((e) => this.violator(`Failed to send: ${e}`));
            },
            0
        );
    }

    public cancel(): void {
        if (this.cancelled) {
            return;
        }
        this.cancelled = true;
        this.onCancel.resolve();
    }

    //
    // - Handlers.
    //

    private async onHandlerResult(res: CallResult<WampList, WampDict>): Promise<void> {
        if (!res.nextResult || this.progress) {
            const message: WampYieldMessage = [
                EWampMessageID.YIELD,
                this.callId,
                { progress: !!res.nextResult && this.progress },
                res.args || [],
                res.kwArgs || {},
            ];

            if (!res.nextResult && !this.cancelled) {
                this.onCancel.reject();
            }

            try {
                await this.sender(this.callId, message, !res.nextResult);
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

        if (res.nextResult) {
            res.nextResult
                .then(
                    (result) => this.onHandlerResult(result),
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

        if (!this.cancelled) {
            this.onCancel.reject();
        }

        this.logger.log(
            LogLevel.DEBUG,
            `Call id "${this.callId}", sending error "${wampError.errorUri}".`,
        );
        await this.sender(this.callId, errorMessage, true);
    }
}

export default Call;
