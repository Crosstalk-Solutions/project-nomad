# Project NOMAD — Version française (fork bocal-pol)

> **Ce projet est un fork traduit et adapté de [Crosstalk-Solutions/project-nomad](https://github.com/Crosstalk-Solutions/project-nomad).**
> Tout le mérite du projet original revient à l'équipe Crosstalk Solutions.
> Ce fork ajoute une interface en français, des collections adaptées à la Belgique et à la France, et des ressources Kiwix en langue française.

---

## Qu'est-ce que Project NOMAD ?

**NOMAD** *(Node for Offline Media, Archives, and Data)* est un serveur de connaissances **offline-first** : Wikipedia, des milliers de livres, des cours, des cartes, une IA locale optionnelle — tout tourne sur ton matériel, sans connexion internet.

Conçu pour fonctionner quand le réseau disparaît : panne électrique, cyberattaque, catastrophe naturelle, zone blanche, ou simple prudence de préparation.

---

## Ce que ce fork ajoute

| Ajout | Description |
|---|---|
| Interface en français | Traduction de l'interface admin |
| Plantes Belgique + France | Flore comestible et médicinale, régions de Belgique et de France |
| Démarches Belgique | Numéros d'urgence, services publics, procédures de crise belges |
| Cartes Europe offline | Couverture cartographique de toute l'Europe |
| Ressources Kiwix FR | Wikipedia FR, Wikivoyage FR, Wiktionnaire, etc. |

---

## Prérequis

- **Windows** : Docker Desktop 4.x+ (ce fork inclut un `docker-compose.windows.yml` adapté)
- **Linux/Mac** : voir le [README original](https://github.com/Crosstalk-Solutions/project-nomad) pour le script d'installation Linux
- RAM minimum : 4 Go | Recommandé : 16 Go+
- Stockage : 10 Go minimum (hors contenus ZIM téléchargés)

---

## Démarrage rapide (Windows)

```powershell
# 1. Cloner ce fork
git clone https://github.com/bocal-pol/project-nomad C:\Projet\Apocalypse\NOMAD
cd C:\Projet\Apocalypse\NOMAD

# 2. Créer les dossiers de données
New-Item -ItemType Directory -Force -Path data\storage, data\mysql, data\redis

# 3. Lancer les conteneurs
docker compose -f docker-compose.windows.yml up -d

# 4. Ouvrir l'interface
start http://localhost:8080
```

L'interface est accessible sur **http://localhost:8080**.
Les logs de conteneurs sont visibles sur **http://localhost:9999** (Dozzle).

---

## Gestion des conteneurs

```powershell
# Démarrer
docker compose -f docker-compose.windows.yml up -d

# Arrêter (sans supprimer les données)
docker compose -f docker-compose.windows.yml stop

# Arrêter et supprimer les conteneurs
docker compose -f docker-compose.windows.yml down

# Voir les logs en direct
docker compose -f docker-compose.windows.yml logs -f admin
```

---

## Collections disponibles

Les collections enrichissent la bibliothèque NOMAD avec des données locales :

| Fichier | Contenu |
|---|---|
| `collections/plantes_belgique_france.json` | Flore comestible et médicinale de Belgique et de France |
| `collections/demarches_belgique.json` | Urgences, services publics et démarches de crise en Belgique |
| `collections/cartes_europe.json` | Cartes offline de toute l'Europe (fichiers ZIM Kiwix) |

---

## Crédits

- **Projet original** : [Crosstalk-Solutions/project-nomad](https://github.com/Crosstalk-Solutions/project-nomad) — licence Apache 2.0
- **Ce fork** : traduction et adaptation pour la Belgique et la France
- **Licence** : Apache 2.0 (voir [LICENSE](LICENSE))

---

## Contribuer

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les règles du projet original.
Pour les ajouts spécifiques à ce fork (collections BE/FR, traduction) : ouvrir une issue ou une PR sur ce dépôt.
