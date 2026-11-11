const KEY = 'slidey_lang';

const DICT = {
  en: {
    settings: 'SETTINGS',
    restart: 'RESTART',
    resume: 'RESUME',
    mode: 'MODE',
    map: 'MAP',
    difficulty: 'DIFFICULTY',
    easy: 'EASY',
    normal: 'NORMAL',
    classic: 'CLASSIC',
    shaped: 'SHAPED',
    standard: 'STANDARD',
    tetris: 'TETRIS',
    'totem-building': 'TOTEM BUILDING',
    gameOver: 'GAME OVER',
    noMoves: 'NO MOVES LEFT',
    score: 'SCORE',
    newHigh: 'NEW HIGH SCORE!',
    highScore: 'HIGH SCORE',
    best: 'BEST',
    level: 'LEVEL',
    nextRow: 'NEXT ROW',
    nextDrop: 'NEXT',
    boardShape: 'BOARD\nSHAPE',
    corridorSelector: 'WINDING\nCORRIDOR',
    random: 'RANDOM',
    funnel: 'FUNNEL',
    hourglass: 'HOURGLASS',
    diamond: 'DIAMOND',
    corridor: 'WINDING CORRIDOR',
    hintClassic: 'Slide a block to fill a row',
    hintShaped: 'Rising edges trim blocks · Fill a row',
    hintTetris: 'Fill a row → break the whole piece',
    hintTotemBuilding: 'Send totems to the floor',
    combo: 'COMBO',
    godClear: 'GOD CLEAR!',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF'
  },
  zh: {
    settings: '设置',
    restart: '重新开始',
    resume: '继续',
    mode: '模式',
    map: '地图',
    difficulty: '难度',
    easy: '简单',
    normal: '普通',
    classic: '经典',
    shaped: '异形',
    standard: '标准',
    tetris: '俄罗斯方块',
    'totem-building': '图腾建造',
    gameOver: '游戏结束',
    noMoves: '无路可走',
    score: '分数',
    newHigh: '新纪录！',
    highScore: '最高分',
    best: '最高',
    level: '等级',
    nextRow: '下一行',
    nextDrop: '下一块',
    boardShape: '棋盘形状',
    corridorSelector: '蜿蜒走廊',
    random: '随机',
    funnel: '漏斗',
    hourglass: '沙漏',
    diamond: '菱形',
    corridor: '蜿蜒走廊',
    hintClassic: '滑动方块填满一行',
    hintShaped: '上升边缘会裁切方块 · 填满一行',
    hintTetris: '填满一行 → 整块碎裂',
    hintTotemBuilding: '送到底部得分',
    combo: '连击',
    godClear: '神级消除！',
    soundOn: '音效开',
    soundOff: '音效关'
  }
};

let lang = 'en';

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(KEY, lang); } catch {}
  return lang;
}

export function loadLang() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'zh' || stored === 'en') lang = stored;
  } catch {}
  return lang;
}

export function t(key) {
  return DICT[lang][key] ?? DICT.en[key] ?? key;
}

export function modeLabel(id, fallback) {
  return DICT[lang][id] ?? fallback;
}
