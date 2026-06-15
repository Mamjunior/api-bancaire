const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // sert les fichiers HTML

// ══ FICHIERS JSON (base de données) ══
const USERS_FILE   = path.join(__dirname, 'data', 'users.json');
const COMPTES_FILE = path.join(__dirname, 'data', 'comptes.json');
const TOKENS_FILE  = path.join(__dirname, 'data', 'tokens.json');

// Crée le dossier data s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialise les fichiers JSON s'ils n'existent pas
function initFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}
initFile(USERS_FILE,   { users: [], nextId: 1 });
initFile(COMPTES_FILE, { comptes: [], nextId: 1 });
initFile(TOKENS_FILE,  { tokens: {} });

// ══ HELPERS JSON ══
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ══ HELPERS AUTH ══
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ══ MIDDLEWARE : vérifier le token ══
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erreur: 'Token manquant. Veuillez vous connecter.' });
  }
  const token = authHeader.split(' ')[1];
  const tokensData = readJSON(TOKENS_FILE);
  const userId = tokensData.tokens[token];
  if (!userId) {
    return res.status(401).json({ erreur: 'Token invalide ou expiré. Reconnectez-vous.' });
  }
  const usersData = readJSON(USERS_FILE);
  const user = usersData.users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ erreur: 'Utilisateur introuvable.' });
  }
  req.user = user;
  next();
}

// ══════════════════════════════════════
//  ROUTES AUTH
// ══════════════════════════════════════

// Inscription
app.post('/auth/register', (req, res) => {
  const { nom, email, password } = req.body;

  if (!nom || !email || !password) {
    return res.status(400).json({ erreur: 'Nom, email et mot de passe sont requis.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const usersData = readJSON(USERS_FILE);
  const exists = usersData.users.find(u => u.email === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ erreur: 'Un compte avec cet email existe déjà.' });
  }

  // Créer l'utilisateur
  const newUser = {
    id: usersData.nextId++,
    nom,
    email: email.toLowerCase(),
    password: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  usersData.users.push(newUser);
  writeJSON(USERS_FILE, usersData);

  // Créer automatiquement un compte bancaire pour cet utilisateur
  const comptesData = readJSON(COMPTES_FILE);
  const newCompte = {
    id: comptesData.nextId++,
    userId: newUser.id,
    nom: newUser.nom,
    solde: 0,
    historique: [],
    createdAt: new Date().toISOString()
  };
  comptesData.comptes.push(newCompte);
  writeJSON(COMPTES_FILE, comptesData);

  res.status(201).json({
    message: 'Compte créé avec succès.',
    user: { id: newUser.id, nom: newUser.nom, email: newUser.email },
    compte: { id: newCompte.id, solde: newCompte.solde }
  });
});

// Connexion
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ erreur: 'Email et mot de passe requis.' });
  }

  const usersData = readJSON(USERS_FILE);
  const user = usersData.users.find(
    u => u.email === email.toLowerCase() && u.password === hashPassword(password)
  );

  if (!user) {
    return res.status(401).json({ erreur: 'Email ou mot de passe incorrect.' });
  }

  // Générer un token
  const token = generateToken();
  const tokensData = readJSON(TOKENS_FILE);
  tokensData.tokens[token] = user.id;
  writeJSON(TOKENS_FILE, tokensData);

  // Récupérer le compte bancaire
  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === user.id);

  res.json({
    message: 'Connexion réussie.',
    token,
    user: { id: user.id, nom: user.nom, email: user.email },
    compte: compte ? { id: compte.id, solde: compte.solde } : null
  });
});

// Déconnexion
app.post('/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers['authorization'].split(' ')[1];
  const tokensData = readJSON(TOKENS_FILE);
  delete tokensData.tokens[token];
  writeJSON(TOKENS_FILE, tokensData);
  res.json({ message: 'Déconnexion réussie.' });
});

// Profil utilisateur connecté
app.get('/auth/me', authMiddleware, (req, res) => {
  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === req.user.id);
  res.json({
    user: { id: req.user.id, nom: req.user.nom, email: req.user.email },
    compte: compte || null
  });
});

// ══════════════════════════════════════
//  ROUTES COMPTES (protégées)
// ══════════════════════════════════════

// Mon compte
app.get('/comptes/moi', authMiddleware, (req, res) => {
  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === req.user.id);
  if (!compte) return res.status(404).json({ erreur: 'Compte introuvable.' });
  res.json(compte);
});

// Dépôt
app.post('/comptes/moi/depot', authMiddleware, (req, res) => {
  const { montant } = req.body;
  if (!montant || montant <= 0) {
    return res.status(400).json({ erreur: 'Montant invalide.' });
  }

  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === req.user.id);
  if (!compte) return res.status(404).json({ erreur: 'Compte introuvable.' });

  compte.solde += montant;
  compte.historique.push({
    type: 'depot',
    montant,
    soldeFinal: compte.solde,
    date: new Date().toISOString()
  });
  writeJSON(COMPTES_FILE, comptesData);

  res.json({
    message: 'Dépôt effectué avec succès.',
    solde: compte.solde,
    transaction: compte.historique[compte.historique.length - 1]
  });
});

// Retrait
app.post('/comptes/moi/retrait', authMiddleware, (req, res) => {
  const { montant } = req.body;
  if (!montant || montant <= 0) {
    return res.status(400).json({ erreur: 'Montant invalide.' });
  }

  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === req.user.id);
  if (!compte) return res.status(404).json({ erreur: 'Compte introuvable.' });

  if (compte.solde < montant) {
    return res.status(400).json({ erreur: 'Solde insuffisant.' });
  }

  compte.solde -= montant;
  compte.historique.push({
    type: 'retrait',
    montant,
    soldeFinal: compte.solde,
    date: new Date().toISOString()
  });
  writeJSON(COMPTES_FILE, comptesData);

  res.json({
    message: 'Retrait effectué avec succès.',
    solde: compte.solde,
    transaction: compte.historique[compte.historique.length - 1]
  });
});

// Historique des transactions
app.get('/comptes/moi/historique', authMiddleware, (req, res) => {
  const comptesData = readJSON(COMPTES_FILE);
  const compte = comptesData.comptes.find(c => c.userId === req.user.id);
  if (!compte) return res.status(404).json({ erreur: 'Compte introuvable.' });

  // Retourner l'historique du plus récent au plus ancien
  const historique = [...compte.historique].reverse();
  res.json({ historique, total: historique.length });
});

// ══════════════════════════════════════
//  ROUTES ADMIN (liste tous les comptes)
// ══════════════════════════════════════
app.get('/comptes', (req, res) => {
  const comptesData = readJSON(COMPTES_FILE);
  res.json(comptesData.comptes.map(c => ({
    id: c.id,
    nom: c.nom,
    solde: c.solde,
    createdAt: c.createdAt
  })));
});

// ══ ROUTE D'ACCUEIL ══
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ══ SWAGGER (garde l'ancienne doc) ══
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ══ DÉMARRAGE ══
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📄 Swagger : http://localhost:${PORT}/api-docs`);
});
