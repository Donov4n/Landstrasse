import AbstractProcessor from './AbstractProcessor';
import Deferred from '../util/deferred';
import { LogLevel } from '../util/logger';
import { EWampMessageID } from '../types/messages/MessageTypes';

import type { CallResult, CallReturn } from '../types/Connection';
import type { WampMessage } from '../types/Protocol';
import type { WampDict, WampID, WampList, WampURI } from '../types/messages/MessageTypes';
import type {
    CallOptions,
    ECallKillMode,
    WampCallMessage,
    WampCancelMessage,
} from '../types/messages/CallMessage';

type CallRequest = Deferred<CallResult<WampList, WampDict>>;

class Caller extends AbstractProcessor {
    public static getFeatures(): WampDict {
        return {
            caller: {
                features: {
                    progressive_call_results: true,
                    call_timeout: true,
                    call_canceling: true,
                    caller_identification: true,
                    sharded_registration: true,
                },
            },
        };
    }

    private _pendingCalls = new Map<WampID, [request: CallRequest, withProgress: boolean]>();

    public call<A extends WampList, K extends WampDict, RA extends WampList, RK extends WampDict>(
        uri: WampURI,
        args?: A,
        kwArgs?: K,
        details?: CallOptions,
    ): CallReturn<RA, RK> {
        if (this._closed) {
            return [
                Promise.reject('Caller closed.'),
                () => Promise.resolve(),
            ];
        }

        const withProgress = !!details?.receive_progress;
        const requestId = this.idGenerators.session.id();
        const message: WampCallMessage = [EWampMessageID.CALL, requestId, details || {}, uri, args || [], kwArgs || {}];
        this.logger.log(LogLevel.DEBUG, `Calling "${uri}" (request id: ${requestId}).`, args, kwArgs, details);

        const executor = async () => {
            const result = new Deferred<CallResult<RA, RK>>();
            this._pendingCalls.set(requestId, [result as Deferred<CallResult<any, any>>, withProgress]);

            try {
                await this.sender(message);
            } catch (err) {
                this.logger.log(LogLevel.WARNING, `Call to "${uri}" failed.`, err);
                this._pendingCalls.delete(requestId);
                throw err;
            }

            return await result.promise;
        };

        const cancel = (killMode?: ECallKillMode) => this.cancel(requestId, killMode);
        return [executor(), cancel];
    }

    public async cancel(requestId: WampID, killMode?: ECallKillMode): Promise<void> {
        if (this._closed) {
            throw new Error('Caller closed.');
        }

        const call = this._pendingCalls.get(requestId);
        if (!call) {
            throw new Error('Unexpected cancellation (unable to find the related call).');
        }

        const msg: WampCancelMessage = [EWampMessageID.CANCEL, requestId, { mode: killMode || '' }];
        this.logger.log(LogLevel.DEBUG, `Cancelling call ${requestId}.`);

        await this.sender(msg);
    }

    //
    // - Handlers.
    //

    protected onMessage(msg: WampMessage): boolean {
        if (msg[0] === EWampMessageID.RESULT) {
            const requestId = msg[1];
            if (!this._pendingCalls.has(requestId)) {
                this.violator('Unexpected result received (unable to find the related call).');
                return true;
            }
            const [callRequest, awaitedProgress] = this._pendingCalls.get(requestId)!;

            const details = msg[2] || {};
            const resultArgs = msg[3] || [];
            const resultKwargs = msg[4] || {};

            if (details.progress) {
                this.logger.log(LogLevel.DEBUG, `Received call progress for call ${requestId}.`, resultArgs, resultKwargs);

                if (!awaitedProgress) {
                    this.violator('Unexpected progress received for a call without progress requested.');
                    return true;
                }

                const nextCallRequest = new Deferred<CallResult<WampList, WampDict>>();
                callRequest.resolve({ args: resultArgs, kwArgs: resultKwargs, nextResult: nextCallRequest.promise });
                this._pendingCalls.set(requestId, [nextCallRequest, true]);
            } else {
                this.logger.log(LogLevel.DEBUG, `Received result for call ${requestId}.`, resultArgs, resultKwargs);
                callRequest.resolve({ args: resultArgs, kwArgs: resultKwargs, nextResult: null });
                this._pendingCalls.delete(requestId);
            }
            return true;
        }

        if (msg[0] === EWampMessageID.ERROR && msg[1] === EWampMessageID.CALL) {
            const requestId = msg[2];
            if (!this._pendingCalls.has(requestId)) {
                this.violator('Unexpected call error received (unable to find the related call).');
                return true;
            }
            const [callRequest] = this._pendingCalls.get(requestId)!;
            this.logger.log(LogLevel.WARNING, `Received \`${msg[4].toString()}\` error for call ${requestId}.`);
            this._pendingCalls.delete(requestId);
            callRequest.reject(new Error(msg[4]));

            return true;
        }

        return false;
    }

    protected onClose(): void {
        this._pendingCalls.forEach(([request]) => {
            request.reject('Caller closing.');
        });
        this._pendingCalls.clear();
    }
}

export default Caller;
