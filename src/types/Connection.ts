import { ECallKillMode } from './messages/CallMessage';

import type { CallOptions, InvocationDetails } from './messages/CallMessage';
import type { PublishOptions } from './messages/PublishMessage';
import type { RegisterOptions } from './messages/RegisterMessage';
import type { EventDetails, SubscribeOptions } from './messages/SubscribeMessage';

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

export type ConnectionCloseInfo = {
    reason: string;
    code: number;
    wasClean: boolean;
};

export type InlineAuth = {
    id?: string,
    method?: string,
    extra?: Record<string, any>,
};

export type OptionsBase = {
    debug?: boolean,
    endpoint: string,
    realm: string,
    serializer?: SerializerInterface,
    logFunction?: LogFunction,
};

export type Options = OptionsBase & (
    | { auth?: InlineAuth }
    | { authProvider?: AuthProviderInterface }
);

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
