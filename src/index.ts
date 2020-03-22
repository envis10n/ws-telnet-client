class WST {
    private socket: WebSocket;
    public readonly options: WST.TelnetOptionMatrix = new WST.TelnetOptionMatrix();
    public onclose: (ev: CloseEvent) => void = (ev) => {};
    public onopen: () => void = () => {};
    public onerror: (ev: Event) => void = (ev) => {};
    public ontelnet: (ev: WST.TelnetEvent) => void = (ev) => {};
    public onsubnegotiation: (option: WST.TelnetOption, data: Uint8Array) => void = (option, data) => {};
    public onmessage: (data: string) => void = (data) => {};
    public onwill: (option: WST.TelnetOption) => void = (option) => {};
    public onwont: (option: WST.TelnetOption) => void = (option) => {};
    public ondo: (option: WST.TelnetOption) => void = (option) => {};
    public ondont: (option: WST.TelnetOption) => void = (option) => {};
    public ongmcp: (namespace: string, data: { [key: string]: any }) => void = (namespace, data) => {};
    constructor(url: string, protocols?: string | string[]) {
        this.socket = new WebSocket(url, protocols);
        this.socket.binaryType = "arraybuffer";
        this.socket.onopen = () => this.onopen();
        this.socket.onerror = (ev) => this.onerror(ev);
        this.socket.onclose = (ev) => this.onclose(ev);
        this.socket.onmessage = (ev) => {
            const data: string | ArrayBuffer = ev.data;
            if (data instanceof ArrayBuffer) {
                // Binary
                const dv = new Uint8Array(data);
                if (dv.byteLength >= 2) {
                    // IAC start
                    const command = dv[1];
                    const option = dv[2];
                    switch (command) {
                        case WST.TelnetNegotiation.SB:
                            if (!this.options.HasOption(option)) return; // Ignore disabled or waiting options
                            const oft = dv.byteLength - 2;
                            const oft2 = dv.byteLength - 1;
                            if (dv[oft] == 255 && dv[oft2] == WST.TelnetNegotiation.SE) {
                                const dv2 = new Uint8Array(dv.buffer, 3, dv.byteLength - 5);
                                this.ontelnet({
                                    command,
                                    option,
                                    data: dv2,
                                });
                                this.onsubnegotiation(option, dv2);
                                switch (option) {
                                    case WST.TelnetOption.GMCP:
                                        const dec = new TextDecoder("utf-8");
                                        const text = dec.decode(dv2);
                                        const split = text.indexOf(" ");
                                        if (split !== -1) {
                                            const namespace = text.substring(0, split);
                                            const obj = JSON.parse(text.substring(split + 1, text.length));
                                            this.ongmcp(namespace, obj);
                                        }
                                        break;
                                }
                            }
                            break;
                        case WST.TelnetNegotiation.WILL:
                            if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
                                this.options.SetState(option, WST.TelnetOptionState.ENABLED);
                            } else {
                                this.options.SetState(option, WST.TelnetOptionState.WAITING);
                            }
                            this.ontelnet({
                                command,
                                option,
                            });
                            this.onwill(option);
                            break;
                        case WST.TelnetNegotiation.WONT:
                            if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
                                this.options.SetState(option, WST.TelnetOptionState.DISABLED);
                            } else {
                                this.options.SetState(option, WST.TelnetOptionState.WAITING);
                            }
                            this.ontelnet({
                                command,
                                option,
                            });
                            this.onwont(option);
                            break;
                        case WST.TelnetNegotiation.DO:
                            if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
                                this.options.SetState(option, WST.TelnetOptionState.ENABLED);
                            } else {
                                this.options.SetState(option, WST.TelnetOptionState.WAITING);
                            }
                            this.ontelnet({
                                command,
                                option,
                            });
                            this.ondo(option);
                            break;
                        case WST.TelnetNegotiation.DONT:
                            if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
                                this.options.SetState(option, WST.TelnetOptionState.DISABLED);
                            } else {
                                this.options.SetState(option, WST.TelnetOptionState.WAITING);
                            }
                            this.ontelnet({
                                command,
                                option,
                            });
                            this.ondont(option);
                            break;
                        default:
                            this.ontelnet({
                                command,
                                option,
                            });
                            break;
                    }
                }
            } else {
                // String
                this.onmessage(data);
            }
        };
    }
    public send(data: string): void;
    public send(data: ArrayBuffer): void;
    public send(data: string | ArrayBuffer): void {
        this.socket.send(data);
    }
    public sendTelnet(command: WST.TelnetNegotiation, option: WST.TelnetOption, data: string): void;
    public sendTelnet(command: WST.TelnetNegotiation, option: WST.TelnetOption, data: Uint8Array): void;
    public sendTelnet(command: WST.TelnetNegotiation, option: WST.TelnetOption): void;
    public sendTelnet(command: WST.TelnetNegotiation, option: WST.TelnetOption, data?: string | Uint8Array): void {
        if (command === WST.TelnetNegotiation.SB && data != undefined) {
            // Subnegotiation
            if (typeof data === "string") {
                const enc = new TextEncoder();
                data = enc.encode(data);
            }
            const buf = new Uint8Array([255, command, option, ...data, 255, WST.TelnetNegotiation.SE]);
            this.send(buf.buffer);
        } else {
            // Regular command
            const buf = new Uint8Array([255, command, option]);
            this.send(buf.buffer);
        }
    }
    public sendGMCP(namespace: string, data: { [key: string]: any }): void {
        this.sendTelnet(WST.TelnetNegotiation.SB, WST.TelnetOption.GMCP, `${namespace} ${JSON.stringify(data)}`);
    }
    public will(option: WST.TelnetOption): void {
        if (this.options.GetState(option) === WST.TelnetOptionState.DISABLED) {
            this.options.SetState(option, WST.TelnetOptionState.WAITING);
            this.sendTelnet(WST.TelnetNegotiation.WILL, option);
        } else if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
            this.options.SetState(option, WST.TelnetOptionState.ENABLED);
            this.sendTelnet(WST.TelnetNegotiation.WILL, option);
        }
    }
    public wont(option: WST.TelnetOption): void {
        if (this.options.GetState(option) === WST.TelnetOptionState.DISABLED) {
            this.options.SetState(option, WST.TelnetOptionState.WAITING);
            this.sendTelnet(WST.TelnetNegotiation.WONT, option);
        } else if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
            this.options.SetState(option, WST.TelnetOptionState.DISABLED);
            this.sendTelnet(WST.TelnetNegotiation.WONT, option);
        }
    }
    public do(option: WST.TelnetOption): void {
        if (this.options.GetState(option) === WST.TelnetOptionState.DISABLED) {
            this.options.SetState(option, WST.TelnetOptionState.WAITING);
            this.sendTelnet(WST.TelnetNegotiation.DO, option);
        } else if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
            this.options.SetState(option, WST.TelnetOptionState.ENABLED);
            this.sendTelnet(WST.TelnetNegotiation.DO, option);
        }
    }
    public dont(option: WST.TelnetOption): void {
        if (this.options.GetState(option) === WST.TelnetOptionState.DISABLED) {
            this.options.SetState(option, WST.TelnetOptionState.WAITING);
            this.sendTelnet(WST.TelnetNegotiation.DONT, option);
        } else if (this.options.GetState(option) === WST.TelnetOptionState.WAITING) {
            this.options.SetState(option, WST.TelnetOptionState.DISABLED);
            this.sendTelnet(WST.TelnetNegotiation.DONT, option);
        }
    }
}

namespace WST {
    /*
    Telnet definitions
*/
    export enum TelnetNegotiation {
        /** Mark the start of a negotiation sequence. */
        IAC = 255,
        /** Confirm  */
        WILL = 251,
        /** Tell the other side that we refuse to use an option. */
        WONT = 252,
        /** Request that the other side begin using an option. */
        DO = 253,
        /**  */
        DONT = 254,
        NOP = 241,
        /** Subnegotiation used for sending out-of-band data. */
        SB = 250,
        /** Marks the end of a subnegotiation sequence. */
        SE = 240,
        IS = 0,
        SEND = 1,
    }

    export enum TelnetOption {
        /** Whether the other side should interpret data as 8-bit characters instead of standard NVT ASCII.  */
        BINARY_TRANSMISSION = 0,
        /** Whether the other side should continue to echo characters. */
        ECHO = 1,
        RECONNECTION = 2,
        SUPPRESS_GO_AHEAD = 3,
        APPROX_MESSAGE_SIZE_NEGOTIATION = 4,
        STATUS = 5,
        TIMING_MARK = 6,
        REMOTE_CONTROLLED_TRANS_ECHO = 7,
        OUTPUT_LINE_WIDTH = 8,
        OUTPUT_PAGE_SIZE = 9,
        OUTPUT_CR_DISPOSITION = 10,
        OUTPUT_HORIZONTAL_TAB_STOPS = 11,
        OUTPUT_HORIZONTAL_TAB_DISPOSITION = 12,
        OUTPUT_FORMFEED_DISPOSITION = 13,
        OUTPUT_VERTICAL_TAB_STOPS = 14,
        OUTPUT_VERTICAL_TAB_DISPOSITION = 15,
        OUTPUT_LINEFEED_DISPOSITION = 16,
        EXTENDED_ASCII = 17,
        LOGOUT = 18,
        BYTE_MACRO = 19,
        DATA_ENTRY_TERMINAL = 20,
        SUPDUP = 21,
        SUPDUP_OUTPUT = 22,
        SEND_LOCATION = 23,
        TERMINAL_TYPE = 24,
        END_OF_RECORD = 25,
        TACACS_USER_IDENTIFICATION = 26,
        OUTPUT_MARKING = 27,
        TERMINAL_LOCATION_NUMBER = 28,
        TELNET_3270_REGIME = 29,
        X3_PAD = 30,
        /**
         * Whether to negotiate about window size (client).
         * @example
         * [IAC, SB, NAWS, WIDTH[1], WIDTH[0], HEIGHT[1], HEIGHT[0], IAC, SE]
         */
        NEGOTIATE_ABOUT_WINDOW_SIZE = 31,
        TERMINAL_SPEED = 32,
        REMOTE_FLOW_CONTROL = 33,
        LINEMODE = 34,
        X_DISPLAY_LOCATION = 35,
        ENVIRONMENT = 36,
        AUTHENTICATION = 37,
        ENCRYPTION = 38,
        NEW_ENVIRONMENT = 39,
        TN3270E = 40,
        XAUTH = 41,
        CHARSET = 42,
        TELNET_REMOTE_SERIAL_PORT = 43,
        COM_PORT_CONTROL = 44,
        TELNET_SUPPRESS_LOCAL_ECHO = 45,
        TELNET_START_TLS = 46,
        KERMIT = 47,
        SEND_URL = 48,
        FORWARD_X = 49,
        TELOPT_PRAGMA_LOGON = 138,
        TELOPT_SSPI_LOGON = 139,
        TELOPT_PRAGMA_HEARTBEAT = 140,
        /** Generic MUD Communication Protocol option.
         * @example
         * [IAC, SB, GMCP, "Package.SubPackage", "JSON", IAC, SE]
         */
        GMCP = 201,
        EXTENDED_OPTIONS_LIST = 255,
    }

    export interface TelnetEvent {
        command: number;
        option: number;
        data?: Uint8Array;
    }

    export enum TelnetOptionState {
        DISABLED,
        WAITING,
        ENABLED,
    }

    export interface ITelnetOptionMatrix {
        [key: number]: TelnetOptionState;
    }

    export class TelnetOptionMatrix {
        private _options: ITelnetOptionMatrix = {};
        public GetState(option: number): TelnetOptionState {
            if (this._options[option] === undefined) {
                this._options[option] = TelnetOptionState.DISABLED;
            }
            return this._options[option];
        }
        public HasOption(option: number): boolean {
            return this._options[option] !== undefined && this._options[option] === TelnetOptionState.ENABLED;
        }
        public SetState(option: number, state: TelnetOptionState): void {
            this._options[option] = state;
        }
    }
}

export default WST;
