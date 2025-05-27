const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const redis = new Redis({
    host: 'redis-17908.c339.eu-west-3-1.ec2.redns.redis-cloud.com',
    port: 17908,
    password: 'PXDrrL41saIPwp3LWywTSY9EokqyDjZm',
});

const redisSubscriber = new Redis({
    host: 'redis-17908.c339.eu-west-3-1.ec2.redns.redis-cloud.com',
    port: 17908,
    password: 'PXDrrL41saIPwp3LWywTSY9EokqyDjZm',
});

const HASH_KEY = 'pixels';
const CHANNEL = 'pixels_channel';
const GRID_SIZE = 10;

app.get('/', (req, res) => {
    res.send('Bienvenido a la API de r/place clon. Usa /pixels para obtener datos o /pixel para guardar.');
});

app.get('/pixels', async (req, res) => {
    try {
        const pixels = await redis.hgetall(HASH_KEY);
        res.json(pixels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/pixel', async (req, res) => {
    let { x, y, color } = req.body;
    
    if (typeof x !== 'number' || typeof y !== 'number' || typeof color !== 'string') {
        return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    // Validación de color hex
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return res.status(400).json({ error: 'Color inválido' });
    }
    
    const cellX = Math.floor(x / GRID_SIZE);
    const cellY = Math.floor(y / GRID_SIZE);
    const coord = `${cellX}:${cellY}`;
    
    try {
        await redis.hset(HASH_KEY, coord, color);
        
        // Enviar actualización a todos los clientes conectados
        const updateMessage = JSON.stringify({ coord, color });
        await redis.publish(CHANNEL, updateMessage);
        
        console.log(`Píxel actualizado: ${coord} -> ${color}`);
        res.json({ success: true });
    } catch (e) {
        console.error('Error guardando píxel:', e);
        res.status(500).json({ error: e.message });
    }
});

const server = app.listen(3000, () => {
    console.log('Servidor escuchando en http://localhost:3000');
});

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', async (ws) => {
    clients.add(ws);
    ws.isAlive = true;
    console.log(`Cliente WebSocket conectado. Total: ${clients.size}`);
    
    // Enviar estado inicial al cliente recién conectado
    try {
        const pixels = await redis.hgetall(HASH_KEY);
        const initMessage = JSON.stringify({ type: 'init', pixels });
        ws.send(initMessage);
        console.log('Estado inicial enviado al nuevo cliente');
    } catch (e) {
        console.error('Error enviando estado inicial:', e);
    }
    
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`Cliente WebSocket desconectado. Total: ${clients.size}`);
    });
    
    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        clients.delete(ws);
    });
});

// Suscribirse al canal de Redis para actualizaciones en tiempo real
redisSubscriber.subscribe(CHANNEL, (err) => {
    if (err) {
        console.error('Error suscribiéndose al canal Redis:', err);
        return;
    }
    console.log(`Suscrito al canal Redis: ${CHANNEL}`);
});

redisSubscriber.on('message', (channel, message) => {
    if (channel === CHANNEL) {
        console.log(`Mensaje recibido del canal: ${message}`);
        
        // Enviar a todos los clientes WebSocket conectados
        let sentCount = 0;
        for (const client of clients) {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(message);
                sentCount++;
            }
        }
        console.log(`Mensaje enviado a ${sentCount} clientes`);
    }
});

// Ping/pong para mantener viva la conexión WebSocket
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminando conexión WebSocket inactiva');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Limpieza al cerrar el servidor
process.on('SIGTERM', () => {
    clearInterval(interval);
    wss.close();
    redis.disconnect();
    redisSubscriber.disconnect();
});

process.on('SIGINT', () => {
    clearInterval(interval);
    wss.close();
    redis.disconnect();
    redisSubscriber.disconnect();
    process.exit(0);
});