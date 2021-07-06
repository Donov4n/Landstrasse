import { CallOptions, ECallKillMode, InvocationDetails } from './messages/CallMessage';
import { PublishOptions } from './messages/PublishMessage';
import { RegisterOptions } from './messages/RegisterMessage';
import { EventDetails, SubscribeOptions } from './messages/SubscribeMessage';
import { WelcomeDetails } from './messages/WelcomeMessage';
export {
    CallOptions,
    InvocationDetails,
    PublishOptions,
    RegisterOptions,
    SubscribeOptions,
    ECallKillMode,
    EventDetails,
};

import type { SerializerInterface } from './Serializer';
import type { WampDict, WampID, WampList } from './messages/MessageTypes';
import type { AuthProviderInterface } from './AuthProvider';
import type { LogFunction } from '../util/logger';

export type ConnectionCloseInfo = {
    reason: string;
    code: number;
    wasClean: boolean;
};

export type ConnectionOptions = {
    debug?: boolean,
    endpoint: string;
    realm: string;
    serializer?: SerializerInterface;
    authProvider?: AuthProviderInterface;
    logFunction?: LogFunction;
};

export type CallResult<TArgs extends WampList, TKwArgs extends WampDict> = {
    args: TArgs;
    kwArgs: TKwArgs;
    nextResult?: Promise<CallResult<TArgs, TKwArgs>> | null;
};

export type CallHandler<
    TA extends WampList,
    TKwA extends WampDict,
    TRA extends WampList,
    TRKwA extends WampDict,
> = (
    args: TA,
    kwArgs: TKwA,
    details: InvocationDetails,
) => Promise<CallResult<TRA, TRKwA>>;

export type EventHandler<TA extends WampList, TKwA extends WampDict> = (
    args: TA,
    kwArgs: TKwA,
    details: EventDetails,
) => void;

export interface RegistrationInterface {
    Unregister(): Promise<void>;
    OnUnregistered(): Promise<void>;
    ID(): WampID;
}

export interface SubscriptionInterface {
    Unsubscribe(): Promise<void>;
    OnUnsubscribed(): Promise<void>;
    ID(): WampID;
}

export interface PublicationInterface {
    OnPublished(): Promise<WampID | null>;
}

export interface ConnectionInterface {
    Open(): Promise<WelcomeDetails>;
    Close(): Promise<ConnectionCloseInfo>;
    OnClose(): Promise<ConnectionCloseInfo>;

    // TODO: Add methods to allow feature queries
    CancelCall(callid: WampID, mode: ECallKillMode): void;

    Call<
        A extends WampList,
        K extends WampDict,
        RA extends WampList,
        RK extends WampDict,
    >(
        uri: string,
        args?: A,
        kwArgs?: K,
        options?: CallOptions,
    ): [Promise<CallResult<RA, RK>>, WampID];

    Register<
        A extends WampList,
        K extends WampDict,
        RA extends WampList,
        RK extends WampDict,
    >(
        uri: string,
        handler: CallHandler<A, K, RA, RK>,
        options?: RegisterOptions,
    ): Promise<RegistrationInterface>;

    Publish<A extends WampList, K extends WampDict>(
        topic: string,
        args?: A,
        kwArgs?: K,
        options?: PublishOptions,
    ): Promise<PublicationInterface>;

    Subscribe<A extends WampList, K extends WampDict>(
        topic: string,
        handler: EventHandler<A, K>,
        options?: SubscribeOptions,
    ): Promise<SubscriptionInterface>;
}
