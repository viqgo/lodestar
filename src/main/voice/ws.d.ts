declare module "ws" {
  import type { EventEmitter } from "node:events";
  export class WebSocket extends EventEmitter {
    constructor(url: string, options?: { headers?: Record<string, string> });
    readonly readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    terminate(): void;
  }
}
