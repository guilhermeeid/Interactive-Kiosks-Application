// Tipos mínimos da Web NFC (Chrome no Android), que ainda não vêm no TypeScript.
// https://w3c.github.io/web-nfc/

interface NDEFRecordInit {
  recordType: string;
  data?: string | BufferSource;
  lang?: string;
  mediaType?: string;
  encoding?: string;
  id?: string;
}

interface NDEFRecord {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly data?: DataView;
  readonly encoding?: string;
  readonly lang?: string;
}

interface NDEFMessage {
  readonly records: readonly NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  readonly serialNumber: string;
  readonly message: NDEFMessage;
}

declare class NDEFReader extends EventTarget {
  constructor();
  scan(opcoes?: { signal?: AbortSignal }): Promise<void>;
  write(
    mensagem: string | { records: NDEFRecordInit[] },
    opcoes?: { overwrite?: boolean; signal?: AbortSignal },
  ): Promise<void>;
  onreading: ((evento: NDEFReadingEvent) => void) | null;
  onreadingerror: ((evento: Event) => void) | null;
}
