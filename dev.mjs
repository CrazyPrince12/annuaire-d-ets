// Compatibilité pour les anciennes commandes : le serveur est désormais Express.
import app from './server.js';
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`CONGLOMERAT — Express sur le port ${port}`));
