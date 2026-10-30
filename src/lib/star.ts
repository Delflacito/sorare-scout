import type { GenericPosition } from '@/domain/types';

/** Carte d'une collection Star : nom et poste tels qu'affichés sur la carte Sorare ; slug si le nom Sorare du joueur diffère. */
export interface StarCard { name: string; pos: 'GK' | 'DF' | 'MD' | 'FW'; slug?: string }
export interface StarCollection { competition: string; name: string; cards: StarCard[] }

const POS: Record<StarCard['pos'], GenericPosition> = { GK: 'Goalkeeper', DF: 'Defender', MD: 'Midfielder', FW: 'Forward' };

/** « GK Yann Sommer; MD … » → cartes (« Nom=slug » pour un joueur au nom différent chez Sorare). */
const list = (s: string): StarCard[] => s.split(';').map((x) => x.trim()).map((x) => {
  const [name, slug] = x.slice(3).split('=');
  return { pos: x.slice(0, 2) as StarCard['pos'], name, ...(slug && { slug }) };
});

// shortcut: listes recopiées des captures de l'appli Sorare (saison 2026-27), à mettre à jour à la main si Sorare les change.
export const STAR_COLLECTIONS: StarCollection[] = [
  { competition: 'eredivisie', name: 'Eredivisie', cards: list(
    'GK Marc-André ter Stegen; MD Julian Brandt; FW Anis Hadj Moussa; MD Peer Koopmeiners; DF Lucas Rosa; FW Ivan Perišić; '
    + 'DF Aaron Bouwman; FW Dušan Tadić; MD Kees Smit; FW Steven Berghuis; FW Jacob Trenskow; GK Bernt Klaverboer; '
    + 'GK Etienne Vaessen; DF Bart van Rooij; FW Ricardo Pepi; FW Ro-Zangelo Daal; FW Sondre Ørjasæter; DF Mauro Júnior; '
    + 'MD Kodai Sano; GK Tjaark Ernst; MD Luciano Valente; FW Tolu Arokodare; GK Matěj Kovář; FW Ruben van Bommel; '
    + 'GK Jari de Busser; MD Gjivai Zechiël; FW Thom van Bergen; DF Sergiño Dest') },
  { competition: 'primeira-liga-pt', name: 'Primeira Liga', cards: list(
    'DF Clément Lenglet; GK Rui Silva; MD Sergi Altimira; DF Gonçalo Inácio; DF Jakub Kiwior; FW Luis Suárez; GK Lazar Carević; '
    + 'FW Andreas Schjelderup; GK Bernardo; MD Gabri Veiga; FW Ricardo Horta; GK Samuel Soares; DF Tomás Araújo; '
    + 'FW Gianluca Prestianni; FW Vangelis Pavlidis; DF Jan Bednarek; GK Diogo Costa; DF Maxi Araújo; MD Mathias de Amorim; '
    + 'MD Rodrigo Zalazar; FW Geny Catamo; FW Rafa Silva; MD Issa Doumbia; DF Alberto Costa; MD Victor Froholdt') },
  { competition: 'jupiler-pro-league', name: 'Jupiler Pro League', cards: list(
    'GK Yann Sommer; MD Adem Zorgane; DF Matte Smets; GK Colin Coosemans; MD Lukas Ambros; FW Guilherme Smith; FW Carlos Forbs; '
    + 'FW Junya Ito; FW Matthieu Epolo; GK Mohamed Koné; DF Kevin Mac Allister; GK Lucca Brughmans=lucca-kiaba-mounganga; DF Brandon Mechele; '
    + 'FW Mamadou Diakhon; GK Taishi Brandon Nozawa; DF Aiham Ousou; MD Hans Vanaken; MD Jeppe Erenbjerg; DF Kyriani Sabbe; '
    + 'FW Nicolò Tresoldi; MD Hugo Vetlesen; MD Bryan Heynen; GK Hervé Koffi; FW Jan Virgili; FW Rafiu Durosinmi; DF Joaquin Seys') },
  { competition: 'football-league-championship', name: 'Championship', cards: list(
    'GK Max Weiss; MD Aidan Morris; DF Ryan Manning; DF Luke Ayling; FW Raúl Jiménez; DF Japhet Tanganga; GK Vladan Kovačević; '
    + 'GK James Beadle; FW Adrian Segečić; GK Anthony Patterson; FW Taty Castellanos; DF Konstantinos Mavropanos; GK José Sá; '
    + 'FW Will Lankshear; FW Morgan Whittaker; GK Pierce Charles; FW Jarrod Bowen; MD Fer López; GK Mads Hermansen; MD André; '
    + 'FW Manor Solomon; GK Radek Vítek; MD Finn Azaz; GK Lawrence Vigouroux; MD Jack McGlynn; FW Jimmy-Jay Morgan; '
    + 'GK Michael Cooper; GK Max O’Leary; MD Léo Scienza; GK Daniel Peretz; FW Ryan Kavuma-McQueen; MD Arne Engels') },
  { competition: 'premiership-gb-sct', name: 'Scottish Premiership', cards: list(
    'FW Greg Kiltie; FW Camilo Durán; DF Cameron Carter-Vickers; GK Beau Reus; DF Kieran Tierney; DF Auston Trusty; GK Ivor Pandur; '
    + 'GK Alex Paulsen; FW Kasper Høgh; MD Benjamin Nygren; GK Viljami Sinisalo; FW Cláudio Braga; DF James Penrice; '
    + 'FW Haissem Hassan; FW Lawrence Shankland; FW Daisuke Yokota; MD Callum McGregor; MD Mika Baur; MD Cammy Devlin; DF Liam Scales') },
];

export interface StarCandidate { slug: string; name: string; position: GenericPosition | null }

const tokens = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/gi, 'o').replace(/ß/g, 'ss').replace(/æ/gi, 'ae')
  .toLowerCase().split(/[^a-z]+/).filter(Boolean);

/**
 * Joueur suivi correspondant à une carte : même nom, sinon un nom contenu dans l'autre (« ter Stegen », « Bernardo »),
 * départagé par le poste de la carte ; null si introuvable ou ambigu.
 */
export function matchCard<T extends StarCandidate>(card: StarCard, candidates: T[]): T | null {
  if (card.slug) return candidates.find((c) => c.slug === card.slug) ?? null;
  const want = tokens(card.name);
  const key = want.join(' ');
  const exact = candidates.filter((c) => tokens(c.name).join(' ') === key);
  const pool = exact.length ? exact : candidates.filter((c) => {
    const have = tokens(c.name);
    return have.every((t) => want.includes(t)) || want.every((t) => have.includes(t));
  });
  if (pool.length <= 1) return pool[0] ?? null;
  const samePos = pool.filter((c) => c.position === POS[card.pos]);
  return samePos.length === 1 ? samePos[0] : null;
}

/** Carte de la galerie Sorare de l'utilisateur (saison en cours). */
export interface GalleryCard { slug: string; name: string; transferType: string | null }
/** ok : carte gagnée aux enchères ou craftée (validée) ; market : possédée mais obtenue autrement (ne compte pas) ; missing : absente. */
export type StarStatus = 'ok' | 'market' | 'missing';

// Enchères et crafts valident. Sorare classe certaines enchères en INSTANT_BUY (Berghuis, Rosa, van Rooij : achetés aux enchères,
// validés dans l'appli). Les ventes entre managers (SINGLE_SALE_OFFER, SINGLE_BUY_OFFER, DIRECT_OFFER) et les récompenses non.
const counts = (t: string | null) => t === 'SHARDS' || t === 'INSTANT_BUY' || !!t?.includes('AUCTION');

/** État d'une carte Star : cartes du même joueur (slug du joueur suivi, à défaut nom) dans la galerie. */
export function starStatus(card: StarCard, playerSlug: string | null, gallery: GalleryCard[]): StarStatus {
  const bySlug = playerSlug ? gallery.filter((g) => g.slug === playerSlug) : [];
  const match = bySlug.length ? null : matchCard(card, gallery.map((g) => ({ ...g, position: null })));
  const mine = bySlug.length ? bySlug : match ? gallery.filter((g) => g.slug === match.slug) : [];
  return mine.some((g) => counts(g.transferType)) ? 'ok' : mine.length ? 'market' : 'missing';
}
