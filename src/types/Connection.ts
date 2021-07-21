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
    message: string,
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

export type CallCancel = (killMode?: ECallKillMode) => Promise<void>;
export type CallReturn<T = any> = [Promise<T>, CallCancel];

export type CallHandler<
    TA extends WampList = WampList,
    TKwA extends WampDict = WampDict,
    T = any,
> = (
    args: TA,
    kwArgs: TKwA,
    details: InvocationDetails,
) => Promise<T>;

export type EventHandler<
    TA extends WampList = WampList,
    TKwA extends WampDict = WampDict,
> = (
    args: TA,
    kwArgs: TKwA,
    details: EventDetails,
) => void;
