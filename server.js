const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
app.use(express.json());

// ---------- Base de données en mémoire ----------
let comptes = [];
let nextId = 1;

// ---------- Routes ----------

// UC1 : Créer un compte
app.post('/comptes', (req, res) => {
  const { nom, soldeInitial = 0 } = req.body;

  if (!nom) {
    return res.status(400).json({ erreur: 'Le nom est requis' });
  }

  const nouveauCompte = {
    id: nextId++,
    nom,
    solde: soldeInitial
  };

  comptes.push(nouveauCompte);
  res.status(201).json(nouveauCompte);
});

// UC2 : Lister tous les comptes
app.get('/comptes', (req, res) => {
  res.json(comptes);
});

// UC3 : Voir un compte spécifique
app.get('/comptes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const compte = comptes.find(c => c.id === id);

  if (!compte) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  res.json(compte);
});

// UC4 : Dépôt
app.post('/comptes/:id/depot', (req, res) => {
  const id = parseInt(req.params.id);
  const { montant } = req.body;
  const compte = comptes.find(c => c.id === id);

  if (!compte) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  if (!montant || montant <= 0) {
    return res.status(400).json({ erreur: 'Montant invalide' });
  }

  compte.solde += montant;
  res.json({ id: compte.id, solde: compte.solde, message: 'Dépôt effectué' });
});

// UC5 : Retrait
app.post('/comptes/:id/retrait', (req, res) => {
  const id = parseInt(req.params.id);
  const { montant } = req.body;
  const compte = comptes.find(c => c.id === id);

  if (!compte) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  if (!montant || montant <= 0) {
    return res.status(400).json({ erreur: 'Montant invalide' });
  }

  if (compte.solde < montant) {
    return res.status(400).json({ erreur: 'Solde insuffisant' });
  }

  compte.solde -= montant;
  res.json({ id: compte.id, solde: compte.solde, message: 'Retrait effectué' });
});

// ---------- Swagger ----------
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ---------- Démarrage du serveur ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API bancaire démarrée sur http://localhost:${PORT}`);
  console.log(`📄 Swagger disponible sur http://localhost:${PORT}/api-docs`);
});
