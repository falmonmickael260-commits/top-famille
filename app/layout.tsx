import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOP FAMILLE — by Lewishalmito",
  description:
    "Jeu televise multijoueur en temps reel. Deux equipes, un plateau sur la television, un telephone par joueur.",
  applicationName: "TOP FAMILLE",
  authors: [{ name: "Lewishalmito" }],
  // manifest.webmanifest + les icones ci-dessous, c'est ce qui transforme le
  // site en application installable : "Ajouter a l'ecran d'accueil" sur
  // iPhone, "Installer l'application" dans Chrome/Android. Une fois
  // installee, elle s'ouvre dans sa propre fenetre, sans barre d'adresse.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  // iOS ignore manifest.webmanifest pour l'ecran d'accueil : c'est ce bloc,
  // et lui seul, qui lui dit que l'app doit s'ouvrir sans chrome Safari.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TOP FAMILLE",
  },
};

export const viewport: Viewport = {
  themeColor: "#03060f",
  width: "device-width",
  initialScale: 1,
  // Le telephone est une telecommande : un double-tap ne doit pas zoomer
  // pendant qu'on cherche le buzzer.
  maximumScale: 1,
  userScalable: false,
  /*
   * LE REGLAGE QUI RENDAIT LE CHAMP DE REPONSE INVISIBLE.
   *
   * Par defaut, l'ouverture du clavier ne redimensionne PAS la zone de mise
   * en page : elle se contente de la recouvrir. Les hauteurs en `dvh` restent
   * donc celles de l'ecran entier, et le champ de saisie se retrouve derriere
   * le clavier, hors d'atteinte — au moment precis ou le joueur doit ecrire.
   *
   * `resizes-content` fait retrecir la page quand le clavier s'ouvre : tout
   * ce qui est a l'ecran le reste.
   */
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/*
          iOS ignore le manifest pour decider du mode plein ecran : sans CE
          meta precis (le prefixe "apple-", pas le generique que Next genere
          tout seul via appleWebApp), Safari rouvre l'icone ajoutee a l'ecran
          d'accueil dans un onglet Safari normal, barre d'adresse comprise,
          au lieu du mode autonome sans chrome.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Polices libres (OFL) servies par Google Fonts, avec repli systeme
            complet dans globals.css : si le reseau manque, le plateau reste
            lisible. Anton porte les gros titres, Inter le texte, JetBrains
            Mono les chiffres et les codes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
