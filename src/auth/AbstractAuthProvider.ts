import type { AuthProviderInterface, Signature } from '../types/AuthProvider';
import type { WampDict } from '../types/messages/MessageTypes';

abstract class AbstractAuthProvider implements AuthProviderInterface {
    private readonly _authId: string;
    private readonly _authMethod: string;

    /** @inheritDoc */
    public get authId(): string {
        return this._authId;
    }

    /** @inheritDoc */
    public get authMethod(): string {
        return this._authMethod;
    }

    public abstract get isTransportLevel(): boolean;

    /**
     * Creates a new instance.
     *
     * @param authId - The username to send to the server
     * @param authMethod - The authmethod to send to the server
     */
    constructor(authId: string, authMethod: string) {
        this._authId = authId;
        this._authMethod = authMethod;
    }

    /** @inheritDoc */
    public computeChallenge(_: WampDict): Promise<Signature> {
        return Promise.reject('Challenge computing is not supported by the auth provider.');
    }
}

export default AbstractAuthProvider;
