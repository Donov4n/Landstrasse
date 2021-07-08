import type { WampHelloMessage } from './messages/HelloMessage';
import type { WampWelcomeMessage } from './messages/WelcomeMessage';
import type { WampPublishedMessage, WampPublishMessage } from './messages/PublishMessage';
import type {
    EWampMessageID,
    WampDict,
    WampID,
    WampList,
    WampURI,
} from './messages/MessageTypes';
import type {
    WampCallMessage,
    WampCancelMessage,
    WampInterruptMessage,
    WampInvocationMessage,
    WampResultMessage,
    WampYieldMessage,
} from './messages/CallMessage';
import type {
    WampEventMessage,
    WampSubscribedMessage,
    WampSubscribeMessage,
    WampUnsubscribedMessage,
    WampUnsubscribeMessage,
} from './messages/SubscribeMessage';
import type {
    WampRegisteredMessage,
    WampRegisterMessage,
    WampUnregisteredMessage,
    WampUnregisterMessage,
} from './messages/RegisterMessage';

export type WampAbortMessage = [EWampMessageID.ABORT, WampDict, WampURI];
export type WampGoodbyeMessage = [EWampMessageID.GOODBYE, WampDict, WampURI];
export type WampChallengeMessage = [EWampMessageID.CHALLENGE, string, WampDict?];
export type WampAuthenticateMessage = [EWampMessageID.AUTHENTICATE, string, WampDict?];
export type WampErrorMessage = [
    EWampMessageID.ERROR,
    EWampMessageID,
    WampID,
    WampDict,
    WampURI,
    WampList?,
    WampDict?,
];

export type WampMessage =
    | WampHelloMessage
    | WampWelcomeMessage
    | WampAbortMessage
    | WampGoodbyeMessage
    | WampAuthenticateMessage
    | WampChallengeMessage
    | WampPublishMessage
    | WampPublishedMessage
    | WampSubscribeMessage
    | WampSubscribedMessage
    | WampUnsubscribeMessage
    | WampUnsubscribedMessage
    | WampEventMessage
    | WampCallMessage
    | WampResultMessage
    | WampCancelMessage
    | WampRegisterMessage
    | WampUnregisterMessage
    | WampRegisteredMessage
    | WampUnregisteredMessage
    | WampInvocationMessage
    | WampYieldMessage
    | WampInterruptMessage
    | WampErrorMessage;
