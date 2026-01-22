import { spawn } from 'child_process';

// deze mf runt de tests op de goede manier
const TESTS = [
    'basic',
    'privleges'
]
async function runner() {
    for (const test of TESTS) {
        let runningCounter = 3;
        // start een background process die de server start deze sluit samen met de client

        // Server: capture and prefix logs so they are visible here
        const serverProcess = spawn('node', [`./dist/tests/server/${test}.js`], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true
        });
        serverProcess.stdout?.on('data', (data: Buffer) => {
            process.stdout.write(`[server:${test}] ${data}`);
        });
        serverProcess.stderr?.on('data', (data: Buffer) => {
            process.stderr.write(`[server:${test}] ${data}`);
        });
        serverProcess.on('close', (code: number) => {
            console.log(`[server:${test}] exited with code ${code}`);
            runningCounter--;
        });

        // Clients: inherit stdio, but also log exit to use the variables
        const clientProcess = spawn('node', [`./dist/tests/clients/${test}/clientA.js`], {
            stdio: 'inherit',
            detached: true
        });
        clientProcess.on('close', (code: number) => {
            console.log(`[clientA:${test}] exited with code ${code}`);
            runningCounter--;
        });

        const clientProcessB = spawn('node', [`./dist/tests/clients/${test}/clientB.js`], {
            stdio: 'inherit',
            detached: true
        });
        clientProcessB.on('close', (code: number) => {
            console.log(`[clientB:${test}] exited with code ${code}`);
            runningCounter--;
        });

        await Promise.all([
            new Promise((resolve) => serverProcess.on('close', resolve)),
            new Promise((resolve) => clientProcess.on('close', resolve)),
            new Promise((resolve) => clientProcessB.on('close', resolve))
        ]).then(() => {
            console.log(`All processes for test ${test} have exited.`);
        });
    }
}
runner();