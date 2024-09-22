import {createClient} from "redis";

let cliente = null;

export async function getClienteRedis() {
    if (!cliente) {
        cliente = createClient({
            url: 'redis://localhost:6379'
        });

        cliente.on('error', (err) => console.log('Erro no cliente Redis', err));

        await cliente.connect();
        console.log('Conectado ao Redis');
    }
    return cliente;
}