import { initializeClient, callServiceAsync, setConfigItem } from "./lib.js";

async function main() {
    await initializeClient();

    const test = await callServiceAsync('test.echo', ['Hallo van de client!'])
    console.log('Antwoord van echo service (promise):', test);

    await setConfigItem('echo', false)

    const test2 = await callServiceAsync('test.echo', ['Hallo van de client!'])
    console.log('Antwoord van echo service (promise):', test2);
}
main();