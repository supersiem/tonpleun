import { initializeClient, registerService } from "./lib.js";

async function main() {

    await initializeClient();

    // Init onze services 
    function serviceEcho(args: any[]): any {
        console.log('Echo service aangeroepen met args:', args);
        return args[0] || "ontvangen";
    }

    registerService('test.echo', serviceEcho, ['message']);

}

main();