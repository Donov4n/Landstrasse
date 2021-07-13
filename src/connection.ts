import WebSocketTransport from './transport';
import JSONSerializer from './serializer/json';
import Deferred from './util/deferred';
import Logger, { LogLevel } from './util/logger';
import ConnectionOpenError from './error/ConnectionOpenError';
import { ETransportEventType } from './types/Transport';
import { GlobalIDGenerator, SessionIDGenerator } from './util/id';
import { EWampMessageID } from './types/messages/MessageTypes';
import { normalRand } from './util';
import { CloseReason } from './types/Connection';
import {
    ConnectionStateMachine,
    EConnectionState,
    EMessageDirection,
} from './state/connection';

import Publisher from './processor/publisher';
import Subscriber from './processor/subscriber';
import Callee from './processor/callee';
import Caller from './processor/caller';

import type Registration from './processor/callee/generic/registration';
import type Subscription from './processor/subscriber/generic/subscription';
import type Publication from './processor/publisher/generic/publication';
import type { CallOptions } from './types/messages/CallMessage';
import type { HelloMessageDetails, WampHelloMessage } from './types/messages/HelloMessage';
import type { PublishOptions } from './types/messages/PublishMessage';
import type { RegisterOptions } from './types/messages/RegisterMessage';
import type { WampWelcomeMessage, WelcomeDetails } from './types/messages/WelcomeMessage';
import type { IdGenerators, ProcessorFactoryInterface } from './processor/AbstractProcessor';
import type { TransportInterface, TransportEvent } from './types/Transport';
import type { SubscribeOptions } from './types/messages/SubscribeMessage';
import type { SerializerInterface } from './types/Serializer';
import type { WampDict, WampList, WampURI, } from './types/messages/MessageTypes';
import type {
    WampGoodbyeMessage,
    WampAbortMessage,
    WampChallengeMessage,
    WampMessage,
} from './types/Protocol';
import type {
    Options,
    CallHandler,
    CallReturn,
    CloseDetails,
    EventHandler,
    RetryInfos,
} from './types/Connection';

const PROCESSOR_FACTORIES: ProcessorFactoryInterface[] = [
    Publisher,
    Subscriber,
    Caller,
    Callee
];

const createIdGenerators = (): IdGenerators => ({
    global: new GlobalIDGenerator(),
    session: new SessionIDGenerator(),
});

class Connection {
    private readonly _options: Options;

    private readonly _endpoint: string;

    private readonly _realm: string;

    private readonly _serializer: SerializerInterface;

    private _processors: [Publisher, Subscriber, Caller, Callee] | null = null;

    private _sessionId: number | null = null;

    private _transport: TransportInterface | null = null;

    private _state: ConnectionStateMachine;

    private _openedDeferred: Deferred<WelcomeDetails> | null = null;

    private _closedDeferred: Deferred | null = null;

    private _isRetrying: boolean = false;

    private _shouldRetry: boolean = false;

    private _retryTimer: number | null = null;

    private _maxRetries: number;

    private _retryCount: number = 0;

    private _retryDelayInitial: number;

    private _retryDelay: number;

    private _retryDelayMax: number;

    private readonly _logger: Logger;

    public get endpoint(): string {
        return this._endpoint;
    }

    public get realm(): string {
        return this._realm;
    }

    public get sessionId(): number | null {
        return this._sessionId;
    }

    public get isConnected(): boolean {
        return this._state.current === EConnectionState.ESTABLISHED;
    }

    public get isConnecting(): boolean {
        return !!this._openedDeferred;
    }

    public get isRetrying(): boolean {
        return this._isRetrying;
    }

    constructor(endpoint: string, realm: string, options: Options) {
        this._endpoint = endpoint;
        this._realm = realm;
        this._options = { retryIfUnreachable: true, ...options };

        this._serializer = this._options?.serializer ?? new JSONSerializer();
        this._maxRetries = this._options?.maxRetries ?? -1;
        this._retryDelayInitial = this._options?.initialRetryDelay ?? 3;
        this._retryDelayMax = this._options?.maxRetryDelay ?? 60;
        this._retryDelay = this._retryDelayInitial;

        this._state = new ConnectionStateMachine();
        this._logger = new Logger(options.logFunction, !!options.debug);
    }

    public open(): Promise<WelcomeDetails> {
        if (this._openedDeferred) {
            return this._openedDeferred.promise;
        }

        if (this.isConnected || this._transport) {
            return Promise.reject('Connection already opened or opening.');
        }

        this.resetRetry();
        this._shouldRetry = true;

        this._logger.log(LogLevel.DEBUG, 'Opening Connection.');
        this._openedDeferred = new Deferred();
        this._open();

        return this._openedDeferred.promise;
    }

    public close(): Promise<void> {
        if (!this._transport && !this.isRetrying) {
            return Promise.reject('Connection already closed.');
        }

        if (this._closedDeferred) {
            return this._closedDeferred.promise;
        }
        this._closedDeferred = new Deferred();

        // - The app wants to close .. don't retry.
        this._shouldRetry = false;

        if (this._transport) {
            this._transport.send([
                EWampMessageID.GOODBYE,
                { message: 'client shutdown' },
                'wamp.close.normal',
            ]);

            this._logger.log(LogLevel.DEBUG, 'Closing Connection.');
            this._state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
        } else {
            this.handleClose({
                reason: 'wamp.close.normal',
                message: 'Client shutdown (between two retries).',
                wasClean: true,
            });
        }

        return this._closedDeferred.promise;
    }

    //
    // - WAMP methods.
    //

    public call<A extends WampList = WampList, K extends WampDict = WampDict, RA extends WampList = WampList, RK extends WampDict = WampDict>(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: CallOptions,
    ): CallReturn<RA, RK> {
        if (!this._processors) {
            return [
                Promise.reject('Invalid session state.'),
                () => Promise.resolve(),
            ];
        }
        return this._processors[2].call(uri, args, kwargs, opts);
    }

    public register<A extends WampList = WampList, K extends WampDict = WampDict, RA extends WampList = WampList, RK extends WampDict = WampDict>(
        uri: WampURI,
        handler: CallHandler<A, K, RA, RK>,
        opts?: RegisterOptions,
    ): Promise<Registration> {
        if (!this._processors) {
            return Promise.reject('Invalid session state.');
        }
        return this._processors[3].register(uri, handler, opts);
    }

    public subscribe<A extends WampList = WampList, K extends WampDict = WampDict>(
        uri: WampURI,
        handler: EventHandler<A, K>,
        opts?: SubscribeOptions,
    ): Promise<Subscription> {
        if (!this._processors) {
            return Promise.reject('Invalid session state.');
        }
        return this._processors[1].subscribe(uri, handler, opts);
    }

    public publish<A extends WampList = WampList, K extends WampDict = WampDict>(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: PublishOptions,
    ): Promise<Publication> {
        if (!this._processors) {
            return Promise.reject('Invalid session state.');
        }
        return this._processors[0].publish(uri, args, kwargs, opts);
    }

    //
    // - Processors.
    //

    private processSessionMessage(msg: WampMessage): void {
        if (!this._transport) {
            return;
        }

        this._state.update([EMessageDirection.RECEIVED, msg[0]]);
        switch (this._state.current) {
            case EConnectionState.CHALLENGING: {
                const challengeMsg = msg as WampChallengeMessage;

                if (!('authProvider' in this._options) || !this._options.authProvider) {
                    this._logger.log(LogLevel.ERROR, 'Received WAMP challenge, but no auth provider set.');
                    this._transport.close(3000, 'auth_error', 'Received WAMP challenge, but no auth provider set.');
                    return;
                }

                this._options.authProvider
                    .computeChallenge(challengeMsg[2] || {})
                    .then((signature) => {
                        if (!this._transport) {
                            return;
                        }
                        return this._transport.send([
                            EWampMessageID.AUTHENTICATE,
                            signature.signature,
                            signature.details || {},
                        ]);
                    })
                    .then(() => {
                        this._state.update([
                            EMessageDirection.SENT,
                            EWampMessageID.AUTHENTICATE,
                        ]);
                    })
                    .catch((error) => {
                        if (!this._transport) {
                            return;
                        }
                        this._logger.log(LogLevel.WARNING, 'Failed to compute challenge.', error);
                        this._transport.close(3000, 'auth_challenge_failed', 'Failed to compute challenge.');
                    });
                break;
            }
            case EConnectionState.ESTABLISHED: {
                const idGenerators = createIdGenerators();
                this._processors = PROCESSOR_FACTORIES.map((procssorClass) => {
                    return new procssorClass(
                        (msg) => this._transport!.send(msg),
                        (reason) => { this.handleProtocolViolation(reason); },
                        idGenerators,
                        this._logger,
                    );
                }) as any;

                const [, sessionId, welcomeDetails] = msg as WampWelcomeMessage;
                this._sessionId = sessionId !== null ? sessionId : -1;
                this._logger.log(LogLevel.DEBUG, `Connection established.`, welcomeDetails);
                this.handleOpen(welcomeDetails);
                break;
            }
            case EConnectionState.CLOSING: {
                // - We received a GOODBYE message from the server, so we reply with goodbye and shutdown the transport.
                this._transport.send([
                    EWampMessageID.GOODBYE,
                    { message: 'clean close' },
                    'wamp.close.goodbye_and_out',
                ]);
                this._state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
                this._transport.close(1000, 'wamp.close.normal', (msg as WampGoodbyeMessage)[1]?.message);
                break;
            }
            case EConnectionState.CLOSED: {
                // - Clean close finished, actually close the transport, so `closed` and close callbacks will be created.
                const message = msg[0] === EWampMessageID.GOODBYE ? msg[1]?.message : undefined;
                this._transport.close(1000, 'wamp.close.normal', message);
                break;
            }
            case EConnectionState.ERROR: {
                // - Protocol violation, so close the transport not clean (i.e. code 3000)
                //   and if we encountered the error, send an ABORT message to the server.
                if (msg[0] !== EWampMessageID.ABORT) {
                    this.handleProtocolViolation('Protocol violation during session creation.');
                } else {
                    const { message } = msg[1] ?? {};
                    this._transport.close(3000, msg[2], message, true);
                    this.handleOpen(new ConnectionOpenError(msg[2], message));
                }
                break;
            }
        }
    }

    private processMessage(msg: WampMessage): void {
        if (msg[0] === EWampMessageID.GOODBYE) {
            this._state.update([EMessageDirection.RECEIVED, msg[0]]);
            return;
        }

        const handled = this._processors!.some(
            (processor) => processor.processMessage(msg),
        );

        if (!handled) {
            this._logger.log(LogLevel.ERROR, `Unhandled message.`, msg);
            this.handleProtocolViolation('No handler found for message.');
        }
    }

    private sendHello(): void {
        const details: HelloMessageDetails = {
            roles: Object.assign({}, ...PROCESSOR_FACTORIES.map(
                (processor) => processor.getFeatures(),
            )),
        };

        if ('authProvider' in this._options && this._options.authProvider) {
            details.authid = this._options.authProvider.authId;
            details.authmethods = [this._options.authProvider.authMethod];
        }

        if ('auth' in this._options && this._options.auth) {
            if (this._options.auth.id) {
                details.authid = this._options.auth.id;
            }

            if (this._options.auth.method) {
                details.authmethods = [this._options.auth.method];
            }

            if (this._options.auth.extra) {
                details.authextra = this._options.auth.extra;
             }
        }

        const message: WampHelloMessage = [EWampMessageID.HELLO, this.realm, details];
        this._transport!.send(message).then(
            () => { this._state.update([EMessageDirection.SENT, EWampMessageID.HELLO]); },
            (err) => { this.handleProtocolViolation(`Transport error: ${err}.`); },
        );
    }

    //
    // - Handlers.
    //

    private handleTransportEvent(event: TransportEvent): void {
        switch (event.type) {
            case ETransportEventType.OPEN: {
                this.sendHello();
                break;
            }
            case ETransportEventType.MESSAGE: {
                if (this.isConnected) {
                    this.processMessage(event.message);
                } else {
                    this.processSessionMessage(event.message);
                }
                break;
            }
            case ETransportEventType.CRITICAL_ERROR:
            case ETransportEventType.ERROR: {
                if (event.type === ETransportEventType.CRITICAL_ERROR || this.isConnecting) {
                    if (this._transport!.isOpen) {
                        this._transport!.close(3000, 'connection_error', event.error, true);
                    } else {
                        this.resetConnectionInfos();
                    }

                    if (!this.handleOpen(new ConnectionOpenError('connection_error', event.error))) {
                        this.handleClose({
                            reason: 'connection_error',
                            message: event.error,
                            wasClean: false,
                        });
                    }
                } else {
                    this._logger.log(LogLevel.DEBUG, 'Transport error.', event.error);
                }
                break;
            }
            case ETransportEventType.CLOSE: {
                this.resetConnectionInfos();

                if (!event.silent) {
                    if (!this.handleOpen(new ConnectionOpenError(event.reason, event.message))) {
                        this.handleClose({
                            code: event.code,
                            reason: event.reason,
                            message: event.message,
                            wasClean: event.wasClean,
                        });
                    }
                }
                break;
            }
        }
    }

    private handleProtocolViolation(message: string): void {
        if (!this._transport) {
            this._logger.log(LogLevel.ERROR, 'Failed to handle protocol violation: Already closed.');
            return;
        }

        const abortMessage: WampAbortMessage = [
            EWampMessageID.ABORT,
            { message },
            'wamp.error.protocol_violation',
        ];

        this._logger.log( LogLevel.ERROR, `Protocol violation: ${message}.`);
        this._transport.send(abortMessage);

        this._transport.close(3000, 'protocol_violation', message, true);
        this.handleOpen(new ConnectionOpenError('protocol_violation', message));
    }

    private handleOpen(details: ConnectionOpenError | WelcomeDetails): boolean {
        if (!this._openedDeferred) {
            return false;
        }
        this.resetRetryTimer();

        if (!(details instanceof Error)) {
            this.resetRetry();
            this._options.onOpen?.(details);
            this._openedDeferred.resolve(details);
            this._openedDeferred = null;
            return true;
        }

        this._logger.log(LogLevel.WARNING, 'Connection failed.', details);
        const stopReconnecting = !!this._options.onOpenError?.(details);
        if (!stopReconnecting && this.retryOpening()) {
            return true;
        }

        this._openedDeferred.reject(details);
        this._openedDeferred = null;
        return true;
    }

    private handleClose(details: CloseDetails): void {
        this.resetRetryTimer();

        let reason: CloseReason = details.wasClean ? CloseReason.CLOSED : CloseReason.LOST;
        if (this.isConnecting) {
            reason = CloseReason.UNREACHABLE;
        }

        this._logger.log(LogLevel[details.wasClean ? 'DEBUG' : 'WARNING'], 'Connection closed.', details);
        const stopReconnecting = !!this._options.onClose?.(reason, details);
        if (!stopReconnecting && this.retryOpening()) {
            return;
        }

        if (this._closedDeferred) {
            this._closedDeferred.resolve();
            this._closedDeferred = null;
        }
    }

    //
    // - Internal
    //

    private _open(): void {
        if (this.isConnected || this._transport) {
            return;
        }

        if (!this._openedDeferred) {
            this._openedDeferred = new Deferred();
        }

        this._state = new ConnectionStateMachine();
        this._transport = new WebSocketTransport(this._serializer);
        this._transport.open(
            this.endpoint,
            this.handleTransportEvent.bind(this),
        );
    }

    private retryOpening(): boolean {
        if (!this._shouldRetry) {
            return false;
        }

        // - Closed while connecting.
        if (this.isConnecting && !this._options.retryIfUnreachable) {
            this._logger.log(LogLevel.WARNING, 'Auto-reconnect disabled!');
            return false;
        }

        const nextTry = this.nextTryInfos();
        if (!nextTry.willRetry) {
            this._logger.log(LogLevel.WARNING, 'Giving up trying to reconnect!');
            return false;
        }

        const retry = () => {
            if (!this._shouldRetry) {
                return;
            }
            this._open();
        };

        this._isRetrying = true;
        this._retryTimer = setTimeout(retry, nextTry.delay * 1000);
        this._logger.log(LogLevel.INFO, `Will try to reconnect [${nextTry.count}] in ${nextTry.delay}s ...`);
        return true;
    }

    private resetRetryTimer() {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
        }
        this._retryTimer = null;
    }

    private resetRetry() {
        this.resetRetryTimer();

        this._retryCount = 0;
        this._retryDelay = this._retryDelayInitial;
        this._isRetrying = false;
    }

    private nextTryInfos(): RetryInfos {
        this._retryDelay = normalRand(this._retryDelay, this._retryDelay * 0.1);
        if (this._retryDelay > this._retryDelayMax) {
            this._retryDelay = this._retryDelayMax;
        }

        this._retryCount += 1;

        let infos: RetryInfos = { count: null, delay: null, willRetry: false };
        if (this._shouldRetry && (this._maxRetries === -1 || this._retryCount <= this._maxRetries)) {
            infos = { count: this._retryCount, delay: this._retryDelay, willRetry: true };
        }

        // - Retry delay growth for next retry cycle.
        this._retryDelay = this._retryDelay * 1.5;

        return infos;
    }

    private resetConnectionInfos(): void {
        this._transport = null;
        this._sessionId = null;
        this._state = new ConnectionStateMachine();

        if (this._processors) {
            this._processors.forEach((processor) => processor.close());
            this._processors = null;
        }
    }
}

export default Connection;
