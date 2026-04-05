import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(scriptDir, '..');
const webuiDir = resolve(rootDir, 'webui');
const distDir = resolve(webuiDir, 'dist');

async function buildWebUi() {
    await rm(distDir, { recursive: true, force: true });
    await mkdir(distDir, { recursive: true });

    await build({
        entryPoints: [resolve(webuiDir, 'main.js')],
        outfile: resolve(distDir, 'app.js'),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2020'],
        sourcemap: true,
        logLevel: 'info'
    });

    const sourceHtml = await readFile(resolve(webuiDir, 'index.html'), 'utf8');
    const builtHtml = sourceHtml.replace('src="main.js"', 'src="./app.js"');
    await writeFile(resolve(distDir, 'index.html'), builtHtml, 'utf8');

    console.log('Web UI build complete:', distDir);
}

buildWebUi().catch((error) => {
    console.error('Web UI build failed:', error);
    process.exitCode = 1;
});
