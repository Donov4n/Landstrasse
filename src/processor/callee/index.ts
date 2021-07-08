import AbstractProcessor from '../AbstractProcessor';
import Registration from './generic/registration';
import Call from './generic/call';
import { LogLevel } from '../../util/logger';
import PendingMap from '../../util/map';
import { EWampMessageID } from '../../types/messages/MessageTypes';

import type { WampMessage } from '../../types/Protocol';
import type { CallHandler } from '../../types/Connection';
import type { WampDict, WampID, WampList } from '../../types/messages/MessageTypes';
import type {
    RegisterOptions,
    WampRegisteredMessage,
    WampRegisterMessage,
    WampUnregisteredMessage,
    WampUnregisterMessage,
} from '../../types/messages/RegisterMessage';

class Callee extends AbstractProcessor {
    public static getFeatures(): WampDict {
        return {
            callee: {
                progressive_call_results: true,
                call_timeout: true,
                call_canceling: true,
                caller_identification: true,
                call_trustlevels: true,
                pattern_based_registration: true,
                sharded_registration: true,
                shared_registration: true,
            },
        };
    }

    private registrations = new Map<WampID, Registration>();
    private runningCalls = new Map<WampID, Call>();

    private registrationRequests = new PendingMap<WampRegisteredMessage>(
        EWampMessageID.REGISTER,
        EWampMessageID.REGISTERED,
    );

    private unregistrationsRequests = new PendingMap<WampUnregisteredMessage>(
        EWampMessageID.UNREGISTER,
        EWampMessageID.UNREGISTERED,
        ([,, details]) => {
            if (!details) {
                return [false, 'Invalid unregistration (missing registration details).'];
            }
            const id = details.registration;

            const registration = this.registrations.get(id);
            if (!registration) {
                return [false, `Unexpected unregistration (unknown registration id ${id}).`];
            }

            this.registrations.delete(id);
            registration.unregisteredDeferred.resolve();

            return [true, ''];
        },
    );

    public async register<A extends WampList, K extends WampDict, RA extends WampList, RK extends WampDict>(
        uri: string,
        handler: CallHandler<A, K, RA, RK>,
        options?: RegisterOptions,
    ): Promise<Registration> {
        if (this.closed) {
            return Promise.reject('Callee closed.');
        }

        const requestId = this.idGenerators.session.id();
        const message: WampRegisterMessage = [EWampMessageID.REGISTER, requestId, options || {}, uri];
        const request = this.registrationRequests.add(requestId);
        this.logger.log(LogLevel.DEBUG, `Registering "${uri}" (request id: ${requestId}).`, options);

        try {
            await this.sender(message);
        } catch (err) {
            this.registrationRequests.reject(requestId, err);
            throw err;
        }

        const [,, registrationId] = await request;
        const registration = new Registration(
            registrationId,
            uri,
            handler as any,
            async (registration) => await this.unregister(registration),
        );
        this.registrations.set(registrationId, registration);

        return registration;
    }

    private async unregister(registration: Registration): Promise<void> {
        if (this.closed) {
            throw new Error('Callee closed.');
        }

        const requestId = this.idGenerators.session.id();
        const message: WampUnregisterMessage = [EWampMessageID.UNREGISTER, requestId, registration.id];
        const request = this.unregistrationsRequests.add(requestId);

        try {
            try {
                await this.sender(message);
            } catch (err) {
                this.unregistrationsRequests.reject(requestId, err);
                throw err;
            }

            await request;
            this.registrations.delete(registration.id);
            registration.unregisteredDeferred.resolve();
        } catch (e) {
            registration.unregisteredDeferred.reject(e);
        }
    }

    //
    // - Handlers.
    //

    protected onMessage(msg: WampMessage): boolean {
        const handled = [this.registrationRequests, this.unregistrationsRequests].some(
            (pendingRequests) => {
                const [handled, success, error] = pendingRequests.handle(msg);
                if (handled && !success) {
                    this.violator(error);
                }
                return handled;
            }
        );
        if (handled) {
            return true;
        }

        if (msg[0] === EWampMessageID.INVOCATION) {
            const [, requestId, registrationId, details, args, kwArgs] = msg;
            const registration = this.registrations.get(registrationId);
            if (!registration) {
                this.violator('Unexpected invocation (unable to find the related registration).');
                return true;
            }

            this.logger.log(
                LogLevel.DEBUG,
                `Call received for registration "${registration.uri}" (request id: ${requestId}).`,
                args,
                kwArgs,
                details,
            );

            const actualDetails = { ...(details || {}) };
            if (!actualDetails.procedure) {
                actualDetails.procedure = registration.uri;
            }

            const call = new Call(
                registration.handler, // Call Handler function
                args || [], // Args or empty array
                kwArgs || {}, // KwArgs or empty object
                details || {}, // Options or empty object
                requestId,
                async (cid, msgToSend, finished) => {
                    if (finished) {
                        this.runningCalls.delete(cid);
                    }
                    if (!this.closed) {
                        await this.sender(msgToSend);
                    }
                },
                this.violator,
                this.logger,
            );
            this.runningCalls.set(requestId, call);

            return true;
        }

        if (msg[0] === EWampMessageID.INTERRUPT) {
            const requestId = msg[1];
            const call = this.runningCalls.get(requestId);

            if (!call) {
                this.violator('Unexpected interrupt (unable to find the related invocation).');
            } else {
                this.logger.log(
                    LogLevel.DEBUG,
                    `Received cancellation request for invocation (request id: ${requestId}).`
                );
                call.cancel();
            }

            return true;
        }

        return false;
    }

    protected onClose(): void {
        this.registrationRequests.close();
        this.unregistrationsRequests.close();

        // - Running invocations.
        this.runningCalls.forEach((pendingCall) => { pendingCall.cancel(); });
        this.runningCalls.clear();

        // - Registrations.
        this.registrations.forEach((registration) => {
            registration.unregisteredDeferred.reject('Callee closing.');
        });
        this.registrations.clear();
    }
}

export default Callee;
