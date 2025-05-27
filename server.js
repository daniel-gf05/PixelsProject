const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const redis = new Redis({
    host: 'redis-17908.c339.eu-west-3-1.ec2.redns.redis-cloud.com',
    port: 17908,
    password: 'PXDrrL41saIPwp3LWywTSY9EokqyDjZm',
});

const HASH_KEY = 'pixels';
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
    const cellX = Math.floor(x / GRID_SIZE);
    const cellY = Math.floor(y / GRID_SIZE);
    const coord = `${cellX}:${cellY}`;

    try {
        await redis.hset(HASH_KEY, coord, color);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
