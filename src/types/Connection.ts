import { ECallKillMode } from './messages/CallMessage';

import type { CallOptions, InvocationDetails } from './messages/CallMessage';
import type { PublishOptions } from './messages/PublishMessage';
import type { RegisterOptions } from './messages/RegisterMessage';
import type { EventDetails, SubscribeOptions } from './messages/SubscribeMessage';
import type { WelcomeDetails } from './messages/WelcomeMessage';

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
import type { WampDict, WampList } from './messages/MessageTypes';
import type { AuthProviderInterface } from './AuthProvider';
import type { LogFunction } from '../util/logger';

export enum CloseReason {
    CLOSED = 'closed',
    LOST = 'lost',
    UNREACHABLE = 'unreachable',
}

export type CloseDetails = {
    code?: number,
    reason: string,
    message?: string,
    wasClean: boolean,
};

export type InlineAuth = {
    id?: string,
    method?: string,
    extra?: WampDict,
};

export type OptionsBase = {
    debug?: boolean,
    serializer?: SerializerInterface,
    logFunction?: LogFunction,

    // - Handlers
    onOpen?: (details: WelcomeDetails) => void,
    onClose?: (reason: CloseReason, details: CloseDetails) => void | boolean,
    onOpenError?: (error: Error) => void | boolean,

    // - Retry options
    retryIfUnreachable?: boolean,
    maxRetries?: number,
    initialRetryDelay?: number,
    maxRetryDelay?: number,
};

export type Options = OptionsBase & (
    | { auth?: InlineAuth }
    | { authProvider?: AuthProviderInterface }
);

export type RetryInfos =
    | { count: null, delay: null, willRetry: false }
    | { count: number, delay: number, willRetry: true };

export type CallResult<TArgs extends WampList, TKwArgs extends WampDict> = {
    args: TArgs;
    kwArgs: TKwArgs;
    nextResult?: Promise<CallResult<TArgs, TKwArgs>> | null;
};

export type CallCancel = (killMode?: ECallKillMode) => Promise<void>;
export type CallReturn<RA extends WampList, RK extends WampDict> = [Promise<CallResult<RA, RK>>, CallCancel];

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
