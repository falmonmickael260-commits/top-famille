# 🎬 TOP FAMILLE

> **by Lewishalmito**

Jeu télévisé **multijoueur en temps réel**. Deux équipes, cinq manches, une
grande finale. Le plateau va sur la **télévision**, chaque joueur garde son
**téléphone** comme télécommande, et **l'animateur est automatique** : personne
n'a besoin de tenir le micro.

**Stack** : Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
Supabase (Auth anonyme, Postgres, Realtime) · déployé sur Vercel.

| | |
|---|---|
| En ligne | <https://top-famille.vercel.app> |
| Dépôt | <https://github.com/falmonmickael260-commits/top-famille> |
| Supabase | projet dédié `wfguhfovryflzwtgpjdb` |

---

## Mise en route

### 1. Installer

```bash
npm install
```

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Les **deux** variables, avec exactement ces noms (ici comme sur Vercel) :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

Où les trouver : **Supabase Dashboard → Project Settings → API**. La clé
publique est publique par conception : la sécurité repose sur RLS et les
fonctions SQL, pas sur le secret de la clé.

### 3. Le schéma SQL — l'étape qui ne peut pas être sautée

Trois façons, au choix.

**À la main** (rien à partager, ~30 s) :

1. Supabase Dashboard → **SQL Editor → New query**
2. Colle **l'intégralité** de [`supabase/schema.sql`](supabase/schema.sql)
3. **Run**

Le fichier fait 240 Ko, dont 90 % de questions. Si le navigateur peine sur un
paste aussi gros, les deux moitiés sont générées à côté — même SQL, à exécuter
**dans l'ordre** :

- [`supabase/schema.part1-structure.sql`](supabase/schema.part1-structure.sql) (85 Ko)
- [`supabase/schema.part2-questions.sql`](supabase/schema.part2-questions.sql) (157 Ko)

**En une commande**, avec l'URL de connexion Postgres
(Supabase → *Connect* → URI) :

```bash
SUPABASE_DB_URL='postgresql://postgres.<ref>:<mdp>@<host>:5432/postgres' npm run push:schema
```

**Ou avec un jeton d'accès personnel** (Supabase → *Account* → *Access Tokens*) :

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx npm run push:schema
```

`npm run push:schema` sans rien affiche ces options et l'URL exacte du SQL
Editor de ton projet.

Le fichier est **idempotent** : on peut le rejouer sans rien casser. Il crée
d'un coup :

| Élément | Détail |
|---|---|
| Tables | `tf_games`, `tf_players`, `tf_questions`, `tf_answers`, `tf_reveals`, `tf_finale_answers`, `tf_events` |
| Données | les 201 questions de `data/questions.json` et leurs 1 206 réponses |
| RPC | `tf_create`, `tf_join`, `tf_set_team`, `tf_start`, `tf_buzz`, `tf_submit`, `tf_tick`, `tf_state`, `tf_leave`, `tf_restart`, `tf_host_skip` |
| Machine d'état | 19 phases, entièrement côté serveur |
| RLS | `tf_games`/`tf_players`/`tf_events` en lecture seule ; les tables qui contiennent des **réponses** sont totalement inaccessibles |
| Realtime | publication sur `tf_games`, `tf_players`, `tf_events` |

> Tout est préfixé `tf_`. Ce projet Supabase peut héberger d'autres jeux
> (TABOO LIVE et ses tables `rooms`/`players`/`cards`) sans interférence.

### 4. Authentification anonyme

**Authentication → Providers → Anonymous** → *Enable*.

Les joueurs n'ont ni email, ni mot de passe, ni compte : chacun reçoit un UUID
Supabase à la première visite, réutilisé ensuite. C'est la clé primaire de
`tf_players`.

Si ce provider est désactivé, l'app affiche un message explicite au lieu d'une
erreur technique.

### 5. Vérifier

```bash
npm run check:supabase
```

Ce diagnostic répond précisément aux pannes classiques, dans l'ordre où elles
arrivent : `.env.local` absent, provider anonyme désactivé, `schema.sql` non
exécuté, questions non seedées, **et verrous de sécurité désarmés** (il vérifie
qu'une réponse cachée ne fuite pas dans la charge utile).

### 6. Jouer

```bash
npm run dev
```

→ http://localhost:3000

---

## Comment on lance une vraie partie

1. Sur l'**ordinateur relié à la télévision** : *Créer une partie*.
   Tu deviens **host**, et le plateau s'ouvre sur `/g/CODE/tv`.
2. Le code s'affiche en grand, du type **TF-4827**.
3. Sur **chaque téléphone** : ouvrir la même adresse, *Rejoindre une partie*,
   entrer le code, choisir son pseudo et son équipe.
4. Les joueurs apparaissent sur leurs podiums, en direct.
5. L'hôte appuie sur **🚀 LANCER LE SHOW**.

À partir de là, plus personne ne touche à rien : le jeu s'annonce, distribue
les tours, compte les fautes, gère le vol, enchaîne les manches et va jusqu'à
la victoire tout seul.

### Les trois interfaces

| Adresse | Pour qui | Ce qu'on y voit |
|---|---|---|
| `/g/CODE/tv` | 📺 la télévision | tout : question, tableau, réponses cachées et révélées, scores, joueurs, équipe active, chrono, fautes |
| `/g/CODE` | 📱 le téléphone | seulement ce qui le concerne : son nom, son équipe, BUZZ, champ de réponse, chrono |
| `/g/CODE/host` | 🖥️ l'hôte | la régie technique : lancer, débloquer une phase, relancer |

---

## Les règles, dans l'ordre du show

```
FACE-À-FACE
    ↓
DÉTERMINATION DE L'ÉQUIPE QUI PREND LE CONTRÔLE
    ↓
TOUR DE L'ÉQUIPE  (rotation stricte, un joueur après l'autre)
    ↓
3 FAUTES
    ↓
VOL PAR L'ÉQUIPE ADVERSE  (une seule tentative)
    ↓
FIN DE LA MANCHE
```

**Face-à-face.** Un joueur de chaque équipe, jamais les deux mêmes : le serveur
choisit celui qui en a fait le moins, donc tout le monde y passe. La question
s'affiche, les deux peuvent buzzer, **le serveur départage**. Le premier a
**10 secondes** pour écrire.

**Prendre le contrôle.** Bonne réponse : **toute son équipe** prend la manche —
ce n'est pas le joueur qui joue seul. Mauvaise réponse : la main passe à
l'adversaire du duel, 10 secondes pour lui. Si personne ne trouve,
**la manche ne va à personne**.

**Tour de l'équipe.** 25 secondes de chrono commun. Les joueurs répondent
**chacun leur tour**, dans un ordre fixe qui démarre au gagnant du face-à-face.
Après **chaque** réponse — bonne ou mauvaise — la main passe au suivant : celui
qui s'est trompé **ne rejoue pas immédiatement**.

**Les fautes.** Elles appartiennent à l'**équipe**, pas au joueur. Trois fautes
(ou le chrono à zéro) et le tour s'arrête net.

**Le vol.** L'équipe adverse se concerte à voix haute, puis **un seul joueur
valide une seule réponse** — le verrou est en base, deux coéquipiers qui
valident en même temps ne peuvent pas passer tous les deux. Bonne : **tous les
points de la manche** changent de camp. Fausse : l'équipe en place garde tout.

**Les manches.** 1 et 2 en points normaux, **manche 3 ×2**, manche 4 normale,
**manche 5 ×3**.

**La finale.** L'équipe en tête envoie deux joueurs. Cinq questions chacun,
20 secondes par question ; le second **ne voit pas** les réponses du premier
(elles ne sont pas envoyées à son navigateur). Révélation question par
question, réponse par réponse. Objectif **200 points** : atteint, l'équipe
gagne ; manqué, la victoire passe à l'autre équipe.

---

## Architecture

```
app/
  layout.tsx              polices, métadonnées, thème
  page.tsx                loader cinématique + accueil (créer / rejoindre / règles)
  globals.css             le plateau : décor, caméra, cases, buzzer, bandeaux
  g/[code]/page.tsx       📱 le téléphone
  g/[code]/tv/page.tsx    📺 le plateau
  g/[code]/host/page.tsx  🖥️ la régie

components/
  Loader.tsx              l'ouverture du show (10 temps, ~4,5 s)
  Announcer.tsx           l'animateur automatique, à l'image
  RulesModal.tsx  GameGate.tsx
  stage/                  Board, ScorePanel, Strikes, Timer, Roster, FaceOff,
                          StealScene, FinaleScene, VictoryScene, Lobby,
                          HostRail, TvStage
  phone/                  PhoneRemote, Buzzer, AnswerForm
  fx/                     Studio, Particles, Confetti, Slam, SoundToggles

lib/
  supabase.ts             client navigateur
  api.ts                  auth anonyme, appels RPC, messages d'erreur propres
  useGame.ts              état, Realtime, chrono serveur, tick
  announcer.ts            le script de l'animateur (fonction pure)
  audio.ts                tout le son, synthétisé à la Web Audio API
  types.ts                types partagés, miroir exact du SQL

data/questions.json       201 questions, 1 206 réponses
supabase/schema.sql       tout le SQL : tables, RLS, RPC, machine d'état, seed
scripts/
  validate-questions.mjs  garde-fou qualité (lancé à chaque build)
  build-schema.mjs        réinjecte questions.json dans schema.sql
  check-supabase.mjs      diagnostic de connexion
  playtest.mjs            une partie complète jouée par des robots
```

### Ce qui garantit la cohérence multijoueur

**Le client ne décide rien.** Pas qui a buzzé, pas qui est actif, pas quand le
chrono expire, pas combien il y a de fautes, pas qui gagne. Tout est calculé
dans des fonctions `security definer` en base. Les policies RLS n'autorisent
que le `SELECT` : aucune écriture directe n'est possible, même en appelant
l'API REST à la main.

**Le buzzer est atomique.** `tf_buzz` fait un
`UPDATE … WHERE buzz_winner IS NULL AND phase_seq = …`. Le premier UPDATE qui
passe gagne ; les autres voient `row_count = 0` et reçoivent simplement l'état.
Deux buzz à la milliseconde, depuis deux téléphones sur deux réseaux, ne
peuvent pas passer tous les deux.

**Le chrono est serveur.** Le client affiche `phase_ends_at − maintenant`,
recalé par le `serverNow` que renvoie chaque RPC. Un rechargement retrouve la
seconde exacte ; un téléphone mal à l'heure affiche quand même le bon temps.

**Avancer est idempotent.** Quand un chrono arrive à zéro, **tous** les clients
appellent `tf_tick` — l'hôte tout de suite, les téléphones en décalage. Le
premier appel « consomme » le chrono (`phase_ends_at → NULL` sous condition de
`phase_seq`), les autres ne font rien. Personne ne peut figer le show en
fermant son onglet.

**Les animations ne se perdent pas.** Chaque changement de phase incrémente
`phase_seq` et écrit `last_event` **sur la ligne de la partie**. Les beats sont
donc lus sur l'état, pas sur un flux d'événements : une trame Realtime perdue
ne peut pas faire sauter une animation. `tf_events` existe en plus, en ajout
seul, comme journal.

**Déconnexion et retour.** `tf_players.last_seen` est un battement de cœur
(15 s côté client, 40 s de tolérance côté serveur). Un téléphone verrouillé
n'est pas « parti » : la rotation saute son tour s'il ne revient pas, et il
redevient joueur actif dès qu'on le rallume. Aucun état de partie en
`localStorage` — seuls le pseudo et les réglages de son y sont mémorisés.

### La sécurité des réponses

Une réponse non trouvée **ne quitte pas le serveur**. Ce n'est pas un masquage
CSS ni un `display: none` : trois verrous.

1. **Le panel n'est pas dans le bundle.** `data/questions.json` ne sert qu'au
   seed SQL et au validateur. Aucun module de `app/`, `components/` ou `lib/`
   ne l'importe : fouiller le JavaScript ne donne aucune réponse.
2. **`tf_questions` et `tf_answers` sont inaccessibles.** Aucune policy RLS de
   lecture, et le privilège SQL est révoqué pour `anon` et `authenticated`. Un
   `select * from tf_answers` depuis le navigateur renvoie *permission denied*,
   même en connaissant `tf_games.question_id` (un entier opaque).
3. **Le serveur décide quoi montrer.** `_tf_board()` renvoie, pour chaque case
   non trouvée, `{rank, revealed: false}` — `label` et `points` valent `null`.
   Et `_tf_finale()` ne donne à un finaliste que ses propres réponses, jamais
   celles de l'autre, jusqu'à la révélation.

`npm run check:supabase` vérifie ces trois verrous à chaque fois.

### La validation des réponses

Le joueur tape vite, sur un téléphone, sans accents. `_tf_norm()` ramène tout à
une forme comparable : minuscules, accents retirés, ponctuation retirée,
articles de tête retirés (`de la crème solaire` → `creme solaire`), espaces
normalisés. Puis `_tf_same()` accepte :

- l'égalité stricte,
- le pluriel/singulier (`serviettes` = `serviette`),
- une faute de frappe sur un mot assez long (distance de Levenshtein,
  implémentée en plpgsql pur — aucune extension requise),
- un mot juste noyé dans une phrase (`je dirais une serviette de plage`), à
  condition qu'il s'agisse d'un **mot entier** d'au moins 5 lettres : `car` ne
  valide pas `carotte`.

Chaque réponse porte en plus ses `acceptedAnswers` (`voiture` accepte `une
voiture`, `automobile`…). Le validateur de build refuse toute forme qui
validerait **deux réponses différentes** de la même question — sinon le serveur
ne saurait pas laquelle créditer.

### Le son

Tout est **synthétisé** dans `lib/audio.ts` à la Web Audio API : le buzzer, le
gong de faute, la sirène du vol, la fanfare de victoire, et les quatre lits
musicaux d'ambiance sont écrits en notes. Aucun fichier à télécharger, aucun
jingle, **aucune musique protégée**, 0 ko d'assets. Deux interrupteurs
indépendants : **🔊 SON** et **🎵 MUSIQUE**.

### Le décor

Aucune image, nulle part. Le studio est fait de dégradés, de coniques, de
filets lumineux et de reflets en CSS (`globals.css`), plus deux canvas 2D pour
les poussières lumineuses et les confettis. Conséquence pratique : ça se charge
instantanément et ça reste net sur une télévision 4K. Le décor **change de
couleur selon le moment du jeu**, et la caméra zoome selon la phase — duel,
gros plan, tableau, plan large sur la victoire.

---

## D'où viennent les questions

**Aucun sondage n'a été inventé.** Les classements et les points de
`data/questions.json` sont le **barème éditorial du jeu**, et l'écran l'affiche
toujours comme tel : **« PANEL TOP FAMILLE · 100 réponses »**. Aucun institut
n'est cité, aucune URL ni date d'enquête n'a été fabriquée.

La structure prévoit le cas d'un vrai sondage : une question peut porter
`source.type = "survey"`, et le schéma **refuse alors de l'enregistrer** sans
`source_url`, `source_date` et `population` réels (contrainte
`tf_questions_survey_needs_source`). Le validateur de build applique la même
règle. Une telle question affiche un lien « sondage vérifié » à l'écran.

201 questions, 18 catégories : alimentation, vie quotidienne, famille,
vacances, sport, télévision, cinéma, musique, technologie, réseaux sociaux,
consommation, voiture, travail, école, fêtes, sorties, voyages, habitudes.

### Ajouter des questions

1. Édite `data/questions.json` (id unique, 4 à 8 réponses, points
   **décroissants**, total entre 80 et 100).
2. `npm run validate:questions`
3. `npm run build:schema`
4. Rejoue le bloc **QUESTIONS** de `supabase/schema.sql` dans le SQL Editor
   (il est en `on conflict do update` : aucun doublon).

---

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | valide les questions puis compile |
| `npm start` | sert le build de production |
| `npm run typecheck` | TypeScript seul |
| `npm run validate:questions` | garde-fou qualité du panel |
| `npm run build:schema` | réinjecte `questions.json` dans `schema.sql` et régénère les deux moitiés |
| `npm run push:schema` | envoie `schema.sql` dans Supabase (URL Postgres ou jeton) |
| `npm run check:supabase` | diagnostic de connexion et de sécurité |
| `npm run simulate` | **le schéma exécuté dans Postgres/WASM, hors ligne** |
| `npm run playtest` | **une partie complète jouée par des robots, sur Supabase** |
| `npm run demo` | une partie de démonstration jouée toute seule, à regarder |
| `npm run bot` | un joueur robot, pour compléter les équipes |
| `npm run stage` | met une partie dans un état donné, pour travailler le plateau |

### `npm run simulate`

Le schéma **exécuté pour de vrai, sans Supabase et sans réseau**. PGlite est
PostgreSQL compilé en WebAssembly : `supabase/schema.sql` s'y exécute avec le
même moteur plpgsql que dans le SQL Editor. En quelques secondes, on obtient :

- la **validation syntaxique de tout le fichier** — une virgule de travers dans
  une fonction ne se verrait autrement qu'en pleine partie ;
- une **partie entière** jouée contre la vraie machine d'état, les cinq manches
  et la finale ;
- la preuve que les **verrous tiennent** : double buzz, double validation,
  réponse hors tour, vol par la mauvaise équipe, écriture directe sur les
  scores — tout est refusé, en interrogeant la base *en tant que* le rôle
  `authenticated` que porte un joueur connecté ;
- la preuve qu'une **réponse non trouvée ne sort jamais du serveur** ;
- les cas limites de composition : **1 contre 1** (le même joueur tient les
  deux manches de la finale) et **équipe complète à 6**.

Seules deux choses sont simulées, parce qu'elles appartiennent à Supabase et
non à Postgres : `auth.uid()` (remplacé par un paramètre de session) et la
publication Realtime (aucun effet sur la logique de jeu).

C'est le test à lancer après **toute** modification de `schema.sql` — il ne
touche à aucune donnée réelle.

```bash
npm run simulate
npm run simulate -- -v   # chaque transition de la machine d'état
```

### `npm run playtest`

Ce n'est pas un test unitaire : c'est une vraie partie multijoueur. Six robots,
six sessions Supabase anonymes distinctes, uniquement les RPC publiques —
exactement ce que font six téléphones. Le scénario traverse volontairement
**tous** les chemins de la mécanique :

- manche 1 : face-à-face gagné d'entrée, l'équipe vide le tableau ;
- manche 2 : premier duelliste à côté, le second trouve, puis 3 fautes et
  **vol réussi** (les points changent de camp) ;
- manche 3 (×2) : personne ne trouve au face-à-face, **aucun point** ;
- manche 4 : 3 fautes puis **vol raté** ;
- manche 5 (×3) : le chrono d'équipe expire, puis vol ;
- finale : 5 questions par joueur, dont une sans réponse et une en doublon,
  puis la révélation et la victoire.

Et il tente ce qu'un tricheur tenterait : buzzer à deux en même temps, valider
deux fois, répondre quand ce n'est pas son tour, envoyer une réponse vide,
voler quand on n'est pas l'équipe qui vole. Chacun **doit** être refusé.

Les invariants sont vérifiés à **chaque** lecture d'état : les fautes restent
entre 0 et 3, un score ne redescend jamais, le joueur actif appartient bien à
l'équipe au contrôle, celui qui vient de se tromper ne rejoue pas, et aucune
case fermée ne contient son libellé.

```bash
npm run playtest              # 6 joueurs
npm run playtest -- --players 4
npm run playtest -- --verbose # chaque transition
```

---

### Voir le show sans réunir six téléphones

```bash
npm run demo
```

Crée une partie, y fait entrer six robots, lance le show et joue **jusqu'à la
victoire** — avec de vrais temps de réflexion, des fautes, des vols réussis et
ratés. Il affiche l'URL du plateau dès le départ : ouvre-la sur la télévision
et regarde. C'est la façon la plus rapide de voir l'ensemble.

Pour jouer soi-même en complétant les équipes :

```bash
npm run bot -- TF-4827 Sarah B --play        # un coéquipier robot
npm run bot -- TF-4827 Kevin B --level mixed # qui se trompe une fois sur trois
npm run bot -- TF-4827 Julie R               # présent, mais qui ne joue pas
```

Et pour travailler le plateau sur une partie déjà bien avancée (question
posée, trois réponses ouvertes, une faute au compteur) :

```bash
npm run stage
```

## Tester le multijoueur à la main

Ouvre plusieurs fenêtres, dont au moins une en **navigation privée** : chaque
contexte de navigateur a sa propre session anonyme, donc son propre joueur.

- 1 onglet sur `/g/CODE/tv` → le plateau
- 2 à 6 fenêtres sur `/g/CODE` → les téléphones

Sur un vrai réseau local, les téléphones se connectent à
`http://<ip-de-la-machine>:3000` (`npm run dev -- -H 0.0.0.0`).

---

## Déploiement Vercel

1. Pousse le dépôt sur GitHub.
2. [vercel.com](https://vercel.com) → **Add New… → Project** → importe le dépôt.
3. Framework détecté : **Next.js**. Rien à changer.
4. **Environment Variables** (Production, Preview et Development) :

   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clé publique |

5. **Deploy**.

> Si tu ajoutes les variables après un premier déploiement, relance un
> *Redeploy* : les variables `NEXT_PUBLIC_*` sont injectées au build.

---

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| « Les fonctions SQL sont absentes de Supabase » | `schema.sql` non exécuté | rejoue-le **entièrement** dans le SQL Editor |
| « Les tables SQL sont absentes de Supabase » | idem | idem |
| « Active Anonymous Sign-In » | provider anonyme désactivé | Authentication → Providers → Anonymous |
| « Supabase n'est pas configuré » | `.env.local` absent ou incomplet | vérifie les **deux** noms de variables, puis relance `npm run dev` |
| Les joueurs n'apparaissent pas en direct | Realtime inactif | Database → Replication → coche `tf_games`, `tf_players`, `tf_events` |
| Aucune question ne s'affiche | bloc QUESTIONS non exécuté | `npm run build:schema` puis rejoue le bloc |
| « Cette équipe est complète » | 6 joueurs déjà présents | rejoins l'autre équipe |
| Toute la mise en page a disparu | Tailwind n'a rien généré | `tailwind.config.js` doit rester en **.js** et ses globs ancrés sur `__dirname` (voir les commentaires du fichier) |

---

## Accessibilité et performance

- `prefers-reduced-motion` : pas de loader cinématique, pas de projecteurs qui
  balaient, pas de particules, pas de mouvement de caméra. Le jeu reste
  entièrement jouable.
- Le téléphone n'affiche jamais plus d'une décision à la fois, en très gros :
  **BUZZ**, **C'EST TON TOUR**, **ÉCRIS TA RÉPONSE**, **ATTENDS TON TOUR**.
- Le décor est du CSS, les particules un canvas à nombre fixe de points, et les
  deux boucles `requestAnimationFrame` s'arrêtent quand l'onglet passe en
  arrière-plan.
- Le chrono se rafraîchit à 100 ms (assez fin pour un affichage au dixième,
  assez large pour ne pas peser sur les animations).

---

**TOP FAMILLE** · by Lewishalmito
