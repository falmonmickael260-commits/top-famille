import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOP FAMILLE — by Lewishalmito",
  description:
    "Jeu televise multijoueur en temps reel. Deux equipes, un plateau sur la television, un telephone par joueur.",
  applicationName: "TOP FAMILLE",
  authors: [{ name: "Lewishalmito" }],
  icons: { icon: "/icon.svg" },
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
