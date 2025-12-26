import { config, configType, initializeClient, registerConfigItem, registerService } from "./lib.js";

async function main() {

    await initializeClient();

    // Init onze services 
    function serviceEcho(args: any[]): any {
        if (config['echo']) {
            console.log('Echo service aangeroepen met args:', args);
        }
        return args[0] || "ontvangen";
    }

    await registerService('test.echo', serviceEcho, ['message']);

    await registerConfigItem('echo', 'gebruik echo', configType.bool, true);
}

main();