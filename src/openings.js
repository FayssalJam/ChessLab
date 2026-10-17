// Bibliothèque des grandes ouvertures (vérifiées par chess.js au démarrage des tests).
// side : camp qui « choisit » l'ouverture ('w' ou 'b').
export const OPENINGS = [
  // 1.e4 e5
  { name: 'Partie italienne', eco: 'C50', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 Bc4', idea: 'Développement rapide, pression sur f7, plans c3-d4.' },
  { name: 'Partie espagnole', eco: 'C60', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 Bb5', idea: 'Pression durable sur e5 via le cavalier c6.' },
  { name: 'Partie écossaise', eco: 'C45', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 d4', idea: 'Ouvrir le centre tout de suite, jeu de pièces actif.' },
  { name: 'Gambit Evans', eco: 'C51', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', idea: 'Un pion contre une avance de développement et le centre.' },
  { name: 'Attaque Fried Liver', eco: 'C57', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7', idea: 'Sacrifice en f7 : arme redoutable à bas niveau.' },
  { name: 'Partie viennoise', eco: 'C25', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nc3', idea: 'Prépare f4 avec un jeu d\'attaque à l\'aile roi.' },
  { name: 'Gambit du roi', eco: 'C30', side: 'w', family: '1.e4 e5', moves: 'e4 e5 f4', idea: 'Romantique : le pion f contre l\'initiative et la colonne f.' },
  { name: 'Quatre cavaliers', eco: 'C47', side: 'w', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6', idea: 'Solide et symétrique, idéal pour apprendre.' },
  { name: 'Défense Petrov', eco: 'C42', side: 'b', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nf6', idea: 'Contre-attaque symétrique très solide.' },
  { name: 'Défense Philidor', eco: 'C41', side: 'b', family: '1.e4 e5', moves: 'e4 e5 Nf3 d6', idea: 'Centre compact, plan …Nf6, …Be7, …O-O.' },
  { name: 'Gambit Stafford', eco: 'C42', side: 'b', family: '1.e4 e5', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6', idea: 'Piégeux : très efficace sous 1500, douteux au-dessus.' },
  // Contre 1.e4
  { name: 'Défense sicilienne', eco: 'B20', side: 'b', family: 'contre 1.e4', moves: 'e4 c5', idea: 'Déséquilibre immédiat, colonne c, majorité centrale.' },
  { name: 'Sicilienne Najdorf', eco: 'B90', side: 'b', family: 'contre 1.e4', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', idea: 'La plus riche : …e5 ou …e6, …b5.' },
  { name: 'Sicilienne Dragon', eco: 'B70', side: 'b', family: 'contre 1.e4', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', idea: 'Fou g7 sur la grande diagonale, roques opposés.' },
  { name: 'Défense française', eco: 'C00', side: 'b', family: 'contre 1.e4', moves: 'e4 e6', idea: 'Chaîne d5-e6, frapper la base avec …c5 et …f6.' },
  { name: 'Défense Caro-Kann', eco: 'B10', side: 'b', family: 'contre 1.e4', moves: 'e4 c6', idea: 'Structure saine, le fou c8 sort avant …e6.' },
  { name: 'Défense scandinave', eco: 'B01', side: 'b', family: 'contre 1.e4', moves: 'e4 d5', idea: 'Simple et directe : idéale pour débuter avec les Noirs.' },
  { name: 'Défense Pirc', eco: 'B07', side: 'b', family: 'contre 1.e4', moves: 'e4 d6 d4 Nf6 Nc3 g6', idea: 'Hypermoderne : laisser le centre puis le saper.' },
  { name: 'Défense Alekhine', eco: 'B02', side: 'b', family: 'contre 1.e4', moves: 'e4 Nf6', idea: 'Provoquer l\'avance des pions blancs pour les attaquer.' },
  // 1.d4
  { name: 'Gambit dame', eco: 'D06', side: 'w', family: '1.d4', moves: 'd4 d5 c4', idea: 'Échanger le pion c contre le pion central d5.' },
  { name: 'Gambit dame refusé', eco: 'D30', side: 'b', family: '1.d4', moves: 'd4 d5 c4 e6', idea: 'Solide, structure Carlsbad fréquente.' },
  { name: 'Gambit dame accepté', eco: 'D20', side: 'b', family: '1.d4', moves: 'd4 d5 c4 dxc4', idea: 'Rendre le pion plus tard, jeu libre.' },
  { name: 'Défense slave', eco: 'D10', side: 'b', family: '1.d4', moves: 'd4 d5 c4 c6', idea: 'Soutenir d5 sans enfermer le fou c8.' },
  { name: 'Système de Londres', eco: 'D02', side: 'w', family: '1.d4', moves: 'd4 d5 Bf4', idea: 'Même schéma contre tout : Bf4, e3, Nf3, c3, Bd3.' },
  { name: 'Système Colle', eco: 'D05', side: 'w', family: '1.d4', moves: 'd4 d5 Nf3 Nf6 e3', idea: 'Préparer e4 et une attaque sur le roque.' },
  { name: 'Défense est-indienne', eco: 'E60', side: 'b', family: '1.d4', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', idea: 'Centre fermé, attaque …f5 sur le roi.' },
  { name: 'Défense nimzo-indienne', eco: 'E20', side: 'b', family: '1.d4', moves: 'd4 Nf6 c4 e6 Nc3 Bb4', idea: 'Clouer c3, abîmer la structure blanche.' },
  { name: 'Défense Grünfeld', eco: 'D80', side: 'b', family: '1.d4', moves: 'd4 Nf6 c4 g6 Nc3 d5', idea: 'Laisser le centre blanc puis le détruire.' },
  { name: 'Ouverture catalane', eco: 'E00', side: 'w', family: '1.d4', moves: 'd4 Nf6 c4 e6 g3', idea: 'Fou g2 sur la grande diagonale, pression à long terme.' },
  { name: 'Défense hollandaise', eco: 'A80', side: 'b', family: '1.d4', moves: 'd4 f5', idea: 'Contrôler e4, attaque à l\'aile roi.' },
  { name: 'Gambit Englund', eco: 'A40', side: 'b', family: '1.d4', moves: 'd4 e5', idea: 'Gambit piège pour débutants, à connaître pour l\'éviter.' },
  // Autres
  { name: 'Ouverture anglaise', eco: 'A10', side: 'w', family: 'Autres', moves: 'c4', idea: 'Sicilienne inversée, contrôle de d5.' },
  { name: 'Ouverture Réti', eco: 'A09', side: 'w', family: 'Autres', moves: 'Nf3 d5 c4', idea: 'Hypermoderne et flexible.' },
  { name: 'Ouverture Bird', eco: 'A02', side: 'w', family: 'Autres', moves: 'f4', idea: 'Contrôle de e5, schéma Stonewall possible.' },
];

export const FAMILIES = ['1.e4 e5', 'contre 1.e4', '1.d4', 'Autres'];
