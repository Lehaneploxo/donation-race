// Тамагочи-девушка: соответствие "подарок TikTok → действие".
// Плейсхолдеры под реальный каталог подарков — правь только этот файл,
// логика в server.js трогать не нужно (см. п.10 ТЗ "девушкатамагочи.txt").
//
// FOOD/TRAINING/MOOD — списки названий подарков (регистронезависимо).
// CLOTHING — карта названия подарка → { slot, item }.
//   slot: 'upper' | 'lower' | 'shoes' | 'accessory' | 'dress'
//   'dress' — особый слот, визуально перекрывает upper+lower одновременно.

module.exports = {
  FOOD: ['Ice Cream', 'Donut'],

  TRAINING: ['GG', 'Sunglasses'],

  MOOD: ['Rose', 'Finger Heart', 'TikTok'],

  CLOTHING: {
    'Perfume': { slot: 'upper',     item: 'tshirt'   },
    'Corgi':   { slot: 'lower',     item: 'jeans'    },
    'Galaxy':  { slot: 'dress',     item: 'dress'    },
    'Mic':     { slot: 'shoes',     item: 'sneakers' },
    'Crown':   { slot: 'accessory', item: 'bow'      },
  },
};
