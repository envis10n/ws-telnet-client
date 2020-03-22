import WST from "../build";

// Connect to server running WST.
const client = new WST("ws://localhost:13337");

client.onopen = () => {
    console.log("Connection established.");
};

// Enable GMCP when requested and send Core.Hello.
client.onwill = (option) => {
    if (option === WST.TelnetOption.GMCP) {
        client.do(WST.TelnetOption.GMCP);
        client.sendGMCP("Core.Hello", { client: "ws-telnet-client", version: "1.0.0" });
    }
};

// Regular string data received.
client.onmessage = (data) => {
    console.log(`Data received: ${data}`);
};

// Telnet event received.
client.ontelnet = (ev) => {
    console.log(`[=TELNET EVENT=]\nCommand: ${ev.command}\nOption: ${ev.option}\nData?: ${ev.data}`);
};
