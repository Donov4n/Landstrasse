import AbstractAuthProvider from './AbstractAuthProvider';

/**
 * TLS Client Certificate authentication provider.
 *
 * Providing an instance of this class means that the client thinks
 * that it is already authenticated by presenting a TLS client cert on the
 * transport level.
 */
class TLSAuthProvider extends AbstractAuthProvider {
    public get isTransportLevel(): boolean {
        return true;
    }

    /**
     * Creates a new instance of the TLS auth provider.
     *
     * @param authId - Username to login as. A certificate might permit logging
     *                 in to several user names, so present one here.
     *                 It might be changed by the server, so that's possibly only a 'hint'.
     *                 (default: '')
     */
    constructor(authId?: string) {
        super(authId ?? '', 'tls');
    }
}

export default TLSAuthProvider;
