import WebSocketTransport from './transport';
import JSONSerializer from './serializer/json';
import Deferred from './util/deferred';
import Logger, { LogLevel } from './util/logger';
import ConnectionOpenError from './error/ConnectionOpenError';
import ConnectionCloseError from './error/ConnectionCloseError';
import { ETransportEventType } from './types/Transport';
import { GlobalIDGenerator, SessionIDGenerator } from './util/id';
import { EWampMessageID } from './types/messages/MessageTypes';
import {
    ConnectionStateMachine,
    EConnectionState,
    EMessageDirection,
} from './state/connection';

import Publisher from './processor/Publisher';
import Subscriber from './processor/Subscriber';
import Callee from './processor/Callee';
import Caller from './processor/Caller';

import type { CallOptions, ECallKillMode } from './types/messages/CallMessage';
import type { HelloMessageDetails, WampHelloMessage } from './types/messages/HelloMessage';
import type { PublishOptions } from './types/messages/PublishMessage';
import type { RegisterOptions } from './types/messages/RegisterMessage';
import type { WampAbortMessage, WampChallengeMessage, WampMessage } from './types/Protocol';
import type { WampWelcomeMessage, WelcomeDetails } from './types/messages/WelcomeMessage';
import type { IDGen, ProcessorFactoryInterface } from './processor/AbstractProcessor';
import type { TransportInterface, TransportEvent } from './types/Transport';
import type { SubscribeOptions } from './types/messages/SubscribeMessage';
import type { AuthProviderInterface } from './types/AuthProvider';
import type { SerializerInterface } from './types/Serializer';
import type { WampDict, WampID, WampList, WampURI, } from './types/messages/MessageTypes';
import type {
    CallHandler,
    CallResult,
    ConnectionCloseInfo,
    ConnectionOptions,
    EventHandler,
    ConnectionInterface,
    PublicationInterface,
    RegistrationInterface,
    SubscriptionInterface,
} from './types/Connection';

const createIdGens = () => {
    return {
        global: new GlobalIDGenerator(),
        session: new SessionIDGenerator(),
    };
};

export class Connection implements ConnectionInterface {
    public sessionId: number | null = null;

    private transport: TransportInterface | null = null;
    private onOpen: Deferred<WelcomeDetails> | null = null;
    private onClose: Deferred<ConnectionCloseInfo> | null = null;

    // The type of subHandlers has to match the order of the Factories in subFactories
    private subHandlers: [Publisher, Subscriber, Caller, Callee] | null = null;
    private subFactories: ProcessorFactoryInterface[] = [Publisher, Subscriber, Caller, Callee];

    private idGen: IDGen;
    private state: ConnectionStateMachine;

    private serializer: SerializerInterface;
    private authProvider: AuthProviderInterface | null;

    private readonly logger: Logger;

    constructor(private connectionOptions: ConnectionOptions) {
        this.state = new ConnectionStateMachine();
        this.idGen = createIdGens();
        this.serializer = this.connectionOptions?.serializer ?? new JSONSerializer();
        this.authProvider = this.connectionOptions?.authProvider ?? null;
        this.logger = new Logger(connectionOptions.logFunction, connectionOptions.debug);
    }

    public Open(): Promise<WelcomeDetails> {
        if (!!this.transport) {
            return Promise.reject('Transport already opened or opening');
        }

        this.transport = new WebSocketTransport(this.serializer);
        this.state = new ConnectionStateMachine();
        this.onOpen = new Deferred();
        this.transport.Open(
            this.connectionOptions.endpoint,
            this.handleTransportEvent.bind(this),
        );

        this.logger.log(LogLevel.DEBUG, 'Connection opened.');
        return this.onOpen.promise;
    }

    public OnClose(): Promise<ConnectionCloseInfo> {
        if (!this.onClose) {
            this.onClose = new Deferred();
        }
        return this.onClose.promise;
    }

    public Close(): Promise<ConnectionCloseInfo> {
        if (!this.transport) {
            return Promise.reject('transport is not open');
        }
        this.transport.Send([
            EWampMessageID.GOODBYE,
            { message: 'client shutdown' },
            'wamp.close.normal',
        ]);

        this.logger.log(LogLevel.DEBUG, 'Closing Connection');
        this.state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
        return this.OnClose();
    }

    public CancelCall(callid: WampID, mode?: ECallKillMode): void {
        if (!this.subHandlers) {
            throw new Error('invalid session state');
        }
        this.subHandlers[2].CancelCall(callid, mode);
    }

    public Call<
        A extends WampList,
        K extends WampDict,
        RA extends WampList,
        RK extends WampDict,
    >(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: CallOptions,
    ): [Promise<CallResult<RA, RK>>, WampID] {
        if (!this.subHandlers) {
            return [Promise.reject('invalid session state'), -1];
        }
        return this.subHandlers[2].Call(uri, args, kwargs, opts);
    }

    public Register<
        A extends WampList,
        K extends WampDict,
        RA extends WampList,
        RK extends WampDict,
    >(
        uri: WampURI,
        handler: CallHandler<A, K, RA, RK>,
        opts?: RegisterOptions,
    ): Promise<RegistrationInterface> {
        if (!this.subHandlers) {
            return Promise.reject('invalid session state');
        }
        return this.subHandlers[3].Register(uri, handler, opts);
    }
    public Subscribe<A extends WampList, K extends WampDict>(
        uri: WampURI,
        handler: EventHandler<A, K>,
        opts?: SubscribeOptions,
    ): Promise<SubscriptionInterface> {
        if (!this.subHandlers) {
            return Promise.reject('invalid session state');
        }
        return this.subHandlers[1].Subscribe(uri, handler, opts);
    }
    public Publish<A extends WampList, K extends WampDict>(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: PublishOptions,
    ): Promise<PublicationInterface> {
        if (!this.subHandlers) {
            return Promise.reject('invalid session state');
        }
        return this.subHandlers[0].Publish(uri, args, kwargs, opts);
    }

    private handleTransportEvent(event: TransportEvent): void {
        switch (event.type) {
            case ETransportEventType.OPEN: {
                this.sendHello();
                break;
            }
            case ETransportEventType.MESSAGE: {
                if (this.state.getState() === EConnectionState.ESTABLISHED) {
                    this.processMessage(event.message);
                } else {
                    this.processSessionMessage(event.message);
                }
                break;
            }
            case ETransportEventType.ERROR: {
                this.logger.log(LogLevel.DEBUG, `ConnError: ${event.error}`);
                if (this.state.getState() !== EConnectionState.ESTABLISHED) {
                    this.handleOnOpen(new ConnectionOpenError(event.error));
                }
                break;
            }
            case ETransportEventType.CLOSE: {
                this.logger.log(
                    LogLevel.DEBUG,
                    `ConnClose: ${event.wasClean} ${event.code} ${event.reason}`,
                );
                this.transport = null;
                const state = this.state.getState();
                this.state = new ConnectionStateMachine();
                if (!!this.subHandlers) {
                    this.subHandlers.forEach((h) => h.Close());
                    this.subHandlers = null;
                }
                if (!this.handleOnOpen(new ConnectionOpenError(event.reason))) {
                    this.handleOnClose(
                        event.wasClean
                            ? {
                                  code: event.code,
                                  reason: event.reason,
                                  wasClean: event.wasClean,
                              }
                            : new ConnectionCloseError(event.reason, event.code),
                    );
                }
                break;
            }
        }
    }

    private sendHello(): void {
        const details: HelloMessageDetails = {
            roles: Object.assign({}, ...this.subFactories.map((j) => j.GetFeatures())),
        };

        if (this.authProvider) {
            details.authid = this.authProvider.AuthID();
            details.authmethods = [this.authProvider.AuthMethod()];
        }

        const msg: WampHelloMessage = [
            EWampMessageID.HELLO,
            this.connectionOptions.realm,
            details,
        ];
        this.transport!.Send(msg).then(//-
            () => { this.state.update([EMessageDirection.SENT, EWampMessageID.HELLO]); },
            (err) => { this.handleProtocolViolation(`Transport error: ${err}`); },
        );
    }

    //
    // - Processors.
    //

    private processSessionMessage(msg: WampMessage): void {
        if (!this.transport) {
            return;
        }

        this.state.update([EMessageDirection.RECEIVED, msg[0]]);
        switch (this.state.getState()) {
            case EConnectionState.CHALLENGING: {
                const challengeMsg = msg as WampChallengeMessage;
                if (!this.authProvider) {
                    this.logger.log(LogLevel.ERROR, 'Received WAMP challenge, but no auth provider set.');
                    this.transport.Close(3000, 'Authentication failed');
                    return;
                }

                this.authProvider
                    .ComputeChallenge(challengeMsg[2] || {})
                    .then((signature) => {
                        if (!this.transport) {
                            return;
                        }
                        return this.transport.Send([//-
                            EWampMessageID.AUTHENTICATE,
                            signature.signature,
                            signature.details || {},
                        ]);
                    })
                    .then(() => {
                        this.state.update([
                            EMessageDirection.SENT,
                            EWampMessageID.AUTHENTICATE,
                        ]);
                    })
                    .catch((error) => {
                        if (!this.transport) {
                            return;
                        }
                        this.logger.log(LogLevel.WARNING, [
                            'Failed to compute challenge or send for auth provider',
                            this.authProvider,
                            error,
                        ]);
                        this.transport.Close(3000, 'Authentication failed');
                    });
                break;
            }
            case EConnectionState.ESTABLISHED: {
                this.idGen = createIdGens();
                this.subHandlers = this.subFactories.map((handlerClass) => {
                    return new handlerClass(
                        async (msgToSend) => {
                            await this.transport!.Send(msgToSend); //-
                        },
                        (reason) => {
                            this.handleProtocolViolation(reason);
                        },
                        this.idGen,
                        this.logger,
                    );
                }) as any; // this works.
                // this is, because map on tuples is not defined typesafe-ish.
                // Harr, Harr, Harr

                const estabishedMessage = msg as WampWelcomeMessage;

                const [, sessionId, welcomeDetails] = estabishedMessage;

                this.sessionId = sessionId;
                this.logger.log(LogLevel.DEBUG, `Connection established.`);
                this.handleOnOpen(welcomeDetails);
                break;
            }
            case EConnectionState.CLOSING: {
                // We received a GOODBYE message from the server, so reply with goodbye and shutdown the transport.
                this.transport.Send([
                    EWampMessageID.GOODBYE,
                    { message: 'clean close' },
                    'wamp.close.goodbye_and_out',
                ]);
                this.state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
                this.transport.Close(1000, 'wamp.close.normal');
                break;
            }
            case EConnectionState.CLOSED: {
                // Clean close finished, actually close the transport, so onClose and close Callbacks will be created
                this.transport.Close(1000, 'wamp.close.normal');
                break;
            }
            case EConnectionState.ERROR: {
                // protocol violation, so close the transport not clean (i.e. code 3000)
                // and if we encountered the error, send an ABORT message to the server
                if (msg[0] !== EWampMessageID.ABORT) {
                    this.handleProtocolViolation(
                        'protocol violation during session establish',
                    );
                } else {
                    this.transport.Close(3000, msg[2]);
                    this.handleOnOpen(new ConnectionOpenError(msg[2], msg[1]));
                }
                break;
            }
        }
    }

    private processMessage(msg: WampMessage): void {
        if (msg[0] === EWampMessageID.GOODBYE) {
            this.state.update([EMessageDirection.RECEIVED, msg[0]]);
            return;
        }
        let success = false;
        for (const subHandler of this.subHandlers!) {
            success = subHandler.ProcessMessage(msg);
            if (success) {
                break;
            }
        }
        if (!success) {
            this.logger.log(LogLevel.ERROR, `Unhandled message: ${JSON.stringify(msg)}`);
            this.handleProtocolViolation('no handler found for message');
        }
    }

    //
    // - Handlers.
    //

    private handleProtocolViolation(reason: WampURI): void {
        if (!this.transport) {
            this.logger.log(
                LogLevel.ERROR,
                'Failed to handle protocol violation: Already closed.',
            );
            return;
        }
        const abortMessage: WampAbortMessage = [
            EWampMessageID.ABORT,
            { message: reason },
            'wamp.error.protocol_violation',
        ];

        this.logger.log(LogLevel.ERROR, `Protocol violation: ${reason}`);
        this.transport.Send(abortMessage);
        this.transport.Close(3000, 'protcol_violation');
        this.handleOnOpen(new ConnectionOpenError('protocol violation'));
    }

    private handleOnOpen(details: Error | WelcomeDetails): boolean {
        if (!this.onOpen) {
            return false;
        }
        if (details instanceof Error) {
            this.onOpen.reject(details);
        } else {
            this.onOpen.resolve(details);
        }
        this.onOpen = null;
        return true;
    }

    private handleOnClose(details: Error | ConnectionCloseInfo): void {
        if (!this.onClose) {
            return;
        }
        if (details instanceof Error) {
            this.onClose.reject(details);
        } else {
            this.onClose.resolve(details);
        }
        this.onClose = null;
    }
}
