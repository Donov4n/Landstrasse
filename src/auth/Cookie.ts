import AbstractAuthProvider from './AbstractAuthProvider';

/**
 * Cookie authentication provider.
 *
 * Providing an instance of this class means that the client thinks that it is already
 * authenticated by the cookies it sent on the transport level.
 */
class CookieAuthProvider extends AbstractAuthProvider {
    public get isTransportLevel(): boolean {
        return true;
    }

    /**
     * Creates a new instance of the cookie auth provider.
     */
    constructor() {
        super('', 'cookie');
    }
}

export default CookieAuthProvider;
