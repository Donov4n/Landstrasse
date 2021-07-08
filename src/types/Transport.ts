import type { WampMessage } from './Protocol';

export enum ETransportEventType {
    OPEN,
    ERROR,
    MESSAGE,
    CLOSE,
}

export type TransportEvent =
    | { type: ETransportEventType.OPEN }
    | { type: ETransportEventType.ERROR, error: string }
    | { type: ETransportEventType.MESSAGE, message: WampMessage }
    | {
          type: ETransportEventType.CLOSE,
          code: number,
          reason: string,
          wasClean: boolean,
      };

export interface TransportInterface {
    open(endpoint: string, callback: (ev: TransportEvent) => void): void;
    close(code: number, reason: string): void;
    send(message: WampMessage): Promise<void>;
}
