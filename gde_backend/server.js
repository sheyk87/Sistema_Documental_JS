// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Importamos las rutas
const authRoutes = require('./routes/authRoutes');
// Usamos las rutas (El endpoint final será /api/auth/login)
app.use('/api/auth', authRoutes);

const systemRoutes = require('./routes/systemRoutes');
app.use('/api/system', systemRoutes);

const docRoutes = require('./routes/docRoutes');
app.use('/api/docs', docRoutes);

const expRoutes = require('./routes/expRoutes');
app.use('/api/exps', expRoutes);

const userRoutes = require('./routes/userRoutes');
const areaRoutes = require('./routes/areaRoutes');

app.use('/api/users', userRoutes);
app.use('/api/areas', areaRoutes);

app.get('/api/test', (req, res) => {
    res.json({ message: 'El servidor GDE está funcionando correctamente' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});