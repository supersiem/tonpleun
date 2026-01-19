/* Dit bestand is automatisch gegenereerd door Tonpleun. Wijzigingen hierin worden overschreven. */

import { getService } from './clientLib.js';

// Services for client: testClient
// echo
export async function echo(tekst: string): Promise<any> {
    return await getService('echo', 'testClient', [tekst]);
}

// Services for client: Client2
