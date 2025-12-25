import { initializeClient, callService, callServiceAsync } from "./lib.js";

async function main() {
    await initializeClient();

    const test = await callServiceAsync('test.echo', ['Hallo van de client!'])
    console.log('Antwoord van echo service (promise):', test);

    const test2 = await callServiceAsync('connector.services', [])
    console.log('Antwoord van connector.services (promise):', test2);

    callService('test.echo', ['Hallo met callback!'],
        (data) => {
            console.log('Antwoord van echo service (callback):', data);
        },
        (error) => {
            console.error('Fout bij aanroepen van echo service:', error);
        }
    );

    callService('connector.services', [],
        (data) => {
            console.log('Antwoord van connector.services (callback):', data);
        },
        (error) => {
            console.error('Fout bij aanroepen van connector.services:', error);
        }
    );

}
main();