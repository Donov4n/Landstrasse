import type { WampMessage } from './Protocol';

export enum ETransportEventType {
    OPEN,
    ERROR,
    CRITICAL_ERROR,
    MESSAGE,
    CLOSE,
}

export type TransportEvent =
    | { type: ETransportEventType.OPEN }
    | { type: ETransportEventType.ERROR | ETransportEventType.CRITICAL_ERROR, error: string }
    | { type: ETransportEventType.ERROR, error: string }
    | { type: ETransportEventType.MESSAGE, message: WampMessage }
    | {
          type: ETransportEventType.CLOSE,
          code: number,
          reason: string,
          message: string,
          silent: boolean,
          wasClean: boolean,
      };

export interface TransportInterface {
    get isOpen(): boolean;
    open(endpoint: string, callback: (ev: TransportEvent) => void): void;
    close(code: number, reason: string, message?: string, silent?: boolean): void;
    send(message: WampMessage): Promise<void>;
}
