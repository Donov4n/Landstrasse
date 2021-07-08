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
import type { WampAbortMessage, WampChallengeMessage, WampMessage } from './types/Protocol';
import type { WampWelcomeMessage, WelcomeDetails } from './types/messages/WelcomeMessage';
import type { IdGenerators, ProcessorFactoryInterface } from './processor/AbstractProcessor';
import type { TransportInterface, TransportEvent } from './types/Transport';
import type { SubscribeOptions } from './types/messages/SubscribeMessage';
import type { AuthProviderInterface } from './types/AuthProvider';
import type { SerializerInterface } from './types/Serializer';
import type { WampDict, WampList, WampURI, } from './types/messages/MessageTypes';
import type { CallHandler, CallReturn, ConnectionCloseInfo, ConnectionOptions, EventHandler } from './types/Connection';

const createIdGenerators = (): IdGenerators => ({
    global: new GlobalIDGenerator(),
    session: new SessionIDGenerator(),
});

class Connection {
    public sessionId: number | null = null;

    private transport: TransportInterface | null = null;

    // - The type of processors has to match the order of the factories in processorFactories.
    private processors: [Publisher, Subscriber, Caller, Callee] | null = null;
    private processorsFactories: ProcessorFactoryInterface[] = [Publisher, Subscriber, Caller, Callee];

    private idGenerators: IdGenerators;
    private state: ConnectionStateMachine;

    private serializer: SerializerInterface;
    private authProvider: AuthProviderInterface | null;

    private openedDeferred: Deferred<WelcomeDetails> | null = null;
    private closedDeferred: Deferred<ConnectionCloseInfo> | null = null;

    private readonly logger: Logger;

    public get closed(): Promise<ConnectionCloseInfo> {
        if (!this.closedDeferred) {
            this.closedDeferred = new Deferred();
        }
        return this.closedDeferred.promise;
    }

    constructor(private connectionOptions: ConnectionOptions) {
        this.state = new ConnectionStateMachine();
        this.idGenerators = createIdGenerators();
        this.serializer = this.connectionOptions?.serializer ?? new JSONSerializer();
        this.authProvider = this.connectionOptions?.authProvider ?? null;
        this.logger = new Logger(connectionOptions.logFunction, !!connectionOptions.debug);
    }

    public open(): Promise<WelcomeDetails> {
        if (this.transport) {
            return Promise.reject('Transport already opened or opening.');
        }

        this.transport = new WebSocketTransport(this.serializer);
        this.state = new ConnectionStateMachine();
        this.openedDeferred = new Deferred();
        this.transport.open(
            this.connectionOptions.endpoint,
            this.handleTransportEvent.bind(this),
        );

        this.logger.log(LogLevel.DEBUG, 'Connection opened.');
        return this.openedDeferred.promise;
    }

    public close(): Promise<ConnectionCloseInfo> {
        if (!this.transport) {
            return Promise.reject('Transport is not open.');
        }

        this.transport.send([
            EWampMessageID.GOODBYE,
            { message: 'client shutdown' },
            'wamp.close.normal',
        ]);

        this.logger.log(LogLevel.DEBUG, 'Closing Connection.');
        this.state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);

        return this.closed;
    }

    //
    // - WAMP methods.
    //

    public call<A extends WampList, K extends WampDict, RA extends WampList, RK extends WampDict>(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: CallOptions,
    ): CallReturn<RA, RK> {
        if (!this.processors) {
            return [
                Promise.reject('Invalid session state.'),
                () => Promise.resolve(),
            ];
        }
        return this.processors[2].call(uri, args, kwargs, opts);
    }

    public register<A extends WampList, K extends WampDict, RA extends WampList, RK extends WampDict>(
        uri: WampURI,
        handler: CallHandler<A, K, RA, RK>,
        opts?: RegisterOptions,
    ): Promise<Registration> {
        if (!this.processors) {
            return Promise.reject('Invalid session state.');
        }
        return this.processors[3].register(uri, handler, opts);
    }

    public subscribe<A extends WampList, K extends WampDict>(
        uri: WampURI,
        handler: EventHandler<A, K>,
        opts?: SubscribeOptions,
    ): Promise<Subscription> {
        if (!this.processors) {
            return Promise.reject('Invalid session state.');
        }
        return this.processors[1].subscribe(uri, handler, opts);
    }

    public publish<A extends WampList, K extends WampDict>(
        uri: WampURI,
        args?: A,
        kwargs?: K,
        opts?: PublishOptions,
    ): Promise<Publication> {
        if (!this.processors) {
            return Promise.reject('Invalid session state.');
        }
        return this.processors[0].publish(uri, args, kwargs, opts);
    }

    //
    // - Processors.
    //

    private processSessionMessage(msg: WampMessage): void {
        if (!this.transport) {
            return;
        }

        this.state.update([EMessageDirection.RECEIVED, msg[0]]);
        switch (this.state.current) {
            case EConnectionState.CHALLENGING: {
                const challengeMsg = msg as WampChallengeMessage;

                if (!this.authProvider) {
                    this.logger.log(LogLevel.ERROR, 'Received WAMP challenge, but no auth provider set.');
                    this.transport.close(3000, 'Authentication failed.');
                    return;
                }

                this.authProvider
                    .computeChallenge(challengeMsg[2] || {})
                    .then((signature) => {
                        if (!this.transport) {
                            return;
                        }
                        return this.transport.send([
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
                        this.logger.log(LogLevel.WARNING, 'Failed to compute challenge.', error);
                        this.transport.close(3000, 'Authentication failed.');
                    });
                break;
            }
            case EConnectionState.ESTABLISHED: {
                this.idGenerators = createIdGenerators();
                this.processors = this.processorsFactories.map((procssorClass) => {
                    return new procssorClass(
                        (msg) => this.transport!.send(msg),
                        (reason) => { this.handleProtocolViolation(reason); },
                        this.idGenerators,
                        this.logger,
                    );
                }) as any;

                const [, sessionId, welcomeDetails] = msg as WampWelcomeMessage;
                this.sessionId = sessionId;
                this.logger.log(LogLevel.DEBUG, `Connection established.`, welcomeDetails);
                this.handleOnOpen(welcomeDetails);
                break;
            }
            case EConnectionState.CLOSING: {
                // - We received a GOODBYE message from the server, so we reply with goodbye and shutdown the transport.
                this.transport.send([
                    EWampMessageID.GOODBYE,
                    { message: 'clean close' },
                    'wamp.close.goodbye_and_out',
                ]);
                this.state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
                this.transport.close(1000, 'wamp.close.normal');
                break;
            }
            case EConnectionState.CLOSED: {
                // - Clean close finished, actually close the transport, so `closed` and close callbacks will be created.
                this.transport.close(1000, 'wamp.close.normal');
                break;
            }
            case EConnectionState.ERROR: {
                // - Protocol violation, so close the transport not clean (i.e. code 3000)
                //   and if we encountered the error, send an ABORT message to the server.
                if (msg[0] !== EWampMessageID.ABORT) {
                    this.handleProtocolViolation('Protocol violation during session creation.');
                } else {
                    this.transport.close(3000, msg[2]);
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

        const handled = this.processors!.some(
            (processor) => processor.processMessage(msg),
        );

        if (!handled) {
            this.logger.log(LogLevel.ERROR, `Unhandled message.`, msg);
            this.handleProtocolViolation('No handler found for message.');
        }
    }

    private sendHello(): void {
        const details: HelloMessageDetails = {
            roles: Object.assign({}, ...this.processorsFactories.map(
                (processor) => processor.getFeatures(),
            )),
        };

        if (this.authProvider) {
            details.authid = this.authProvider.authId;
            details.authmethods = [this.authProvider.authMethod];
        }

        const message: WampHelloMessage = [EWampMessageID.HELLO, this.connectionOptions.realm, details];
        this.transport!.send(message).then(
            () => { this.state.update([EMessageDirection.SENT, EWampMessageID.HELLO]); },
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
                if (this.state.current === EConnectionState.ESTABLISHED) {
                    this.processMessage(event.message);
                } else {
                    this.processSessionMessage(event.message);
                }
                break;
            }
            case ETransportEventType.ERROR: {
                this.logger.log(LogLevel.DEBUG, 'Connection error.', event.error);
                if (this.state.current !== EConnectionState.ESTABLISHED) {
                    this.handleOnOpen(new ConnectionOpenError(event.error));
                }
                break;
            }
            case ETransportEventType.CLOSE: {
                this.logger.log(LogLevel.DEBUG, 'Connection closed.', event);

                this.transport = null;
                this.state = new ConnectionStateMachine();
                if (this.processors) {
                    this.processors.forEach((processor) => processor.close());
                    this.processors = null;
                }

                if (!this.handleOnOpen(new ConnectionOpenError(event.reason))) {
                    this.handleOnClose(
                        event.wasClean
                            ? { code: event.code, reason: event.reason, wasClean: event.wasClean }
                            : new ConnectionCloseError(event.reason, event.code),
                    );
                }
                break;
            }
        }
    }

    private handleProtocolViolation(reason: WampURI): void {
        if (!this.transport) {
            this.logger.log(LogLevel.ERROR, 'Failed to handle protocol violation: Already closed.');
            return;
        }

        const abortMessage: WampAbortMessage = [
            EWampMessageID.ABORT,
            { message: reason },
            'wamp.error.protocol_violation',
        ];

        this.logger.log(LogLevel.ERROR, `Protocol violation: ${reason}.`);
        this.transport.send(abortMessage);
        this.transport.close(3000, 'protcol_violation');
        this.handleOnOpen(new ConnectionOpenError('Protocol violation.'));
    }

    private handleOnOpen(details: Error | WelcomeDetails): boolean {
        if (!this.openedDeferred) {
            return false;
        }

        if (details instanceof Error) {
            this.openedDeferred.reject(details);
        } else {
            this.openedDeferred.resolve(details);
        }
        this.openedDeferred = null;

        return true;
    }

    private handleOnClose(details: Error | ConnectionCloseInfo): void {
        if (!this.closedDeferred) {
            return;
        }

        if (details instanceof Error) {
            this.closedDeferred.reject(details);
        } else {
            this.closedDeferred.resolve(details);
        }
        this.closedDeferred = null;
    }
}

export default Connection;
