import { STAR_COLLECTIONS, matchCard, starStatus, type StarCandidate } from '@/lib/star';

const c = (slug: string, name: string, position: StarCandidate['position']): StarCandidate => ({ slug, name, position });

describe('collections Star', () => {
  it('retrouve le joueur : accents, nom partiel, homonymes départagés par le poste', () => {
    const players = [
      c('ter-stegen', 'ter Stegen', 'Goalkeeper'), c('orjasaeter', 'Sondre Ørjasæter', 'Forward'), c('kovar', 'Matěj Kovář', 'Goalkeeper'),
      c('schappo', 'Bernardo Schappo', 'Defender'), c('fontes', 'Bernardo Fontes', 'Goalkeeper'), c('silva', 'Rui Silva', 'Goalkeeper'),
      c('rafa', 'Rafa Silva', 'Forward'),
    ];
    expect(matchCard({ name: 'Marc-André ter Stegen', pos: 'GK' }, players)?.slug).toBe('ter-stegen');
    expect(matchCard({ name: 'Sondre Ørjasæter', pos: 'FW' }, players)?.slug).toBe('orjasaeter');
    expect(matchCard({ name: 'Matej Kovar', pos: 'GK' }, players)?.slug).toBe('kovar');
    expect(matchCard({ name: 'Bernardo', pos: 'GK' }, players)?.slug).toBe('fontes');
    expect(matchCard({ name: 'Rafa Silva', pos: 'FW' }, players)?.slug).toBe('rafa');
    expect(matchCard({ name: 'Diogo Costa', pos: 'GK' }, players)).toBeNull();
  });

  it('listes recopiées sans doublon ni poste invalide', () => {
    for (const col of STAR_COLLECTIONS) {
      expect(new Set(col.cards.map((x) => x.name)).size).toBe(col.cards.length);
      for (const x of col.cards) expect(['GK', 'DF', 'MD', 'FW']).toContain(x.pos);
    }
  });
});

describe('état d’une carte Star', () => {
  const gallery = [
    { slug: 'sommer', name: 'Yann Sommer', transferType: 'ENGLISH_AUCTION' },
    { slug: 'smets', name: 'Matte Smets', transferType: 'SHARDS' },
    { slug: 'horta', name: 'Ricardo Horta', transferType: 'SINGLE_SALE_OFFER' },
    { slug: 'horta', name: 'Ricardo Horta', transferType: 'DIRECT_OFFER' },
    { slug: 'max-weiss', name: 'Max Weiß', transferType: 'INSTANT_BUY' },
    { slug: 'lucca-kiaba-mounganga', name: 'Lucca Kiaba Mounganga', transferType: 'ENGLISH_AUCTION' },
  ];
  it('validée si enchère, achat immédiat ou craft, « marché » si possédée autrement, sinon manquante ; nom en repli', () => {
    expect(starStatus({ name: 'Yann Sommer', pos: 'GK' }, null, gallery)).toBe('ok'); // joueur pas suivi : par le nom
    expect(starStatus({ name: 'Matte Smets', pos: 'DF' }, 'smets', gallery)).toBe('ok');
    expect(starStatus({ name: 'Ricardo Horta', pos: 'FW' }, 'horta', gallery)).toBe('market');
    expect(starStatus({ name: 'Diogo Costa', pos: 'GK' }, 'diogo', gallery)).toBe('missing');
    expect(starStatus({ name: 'Max Weiss', pos: 'GK' }, null, gallery)).toBe('ok'); // achat immédiat à Sorare ; ß = ss
    expect(starStatus({ name: 'Lucca Brughmans', pos: 'GK', slug: 'lucca-kiaba-mounganga' }, null, gallery)).toBe('ok'); // nom différent
  });
});
