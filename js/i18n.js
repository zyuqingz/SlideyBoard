const KEY = 'slidey_lang';

const DICT = {
  en: {
    settings: 'SETTINGS',
    restart: 'RESTART',
    resume: 'RESUME',
    mode: 'MODE',
    classic: 'CLASSIC',
    shaped: 'SHAPED',
    totem: 'TOTEM',
    gameOver: 'GAME OVER',
    noMoves: 'NO MOVES LEFT',
    score: 'SCORE',
    newHigh: 'NEW HIGH SCORE!',
    highScore: 'HIGH SCORE',
    best: 'BEST',
    level: 'LEVEL',
    nextRow: 'NEXT ROW',
    totemNext: 'TOTEM MODE · NEXT ROW',
    boardShape: 'BOARD SHAPE',
    random: 'RANDOM',
    chooseShape: 'Choose shape, then tap SHAPED',
    funnel: 'FUNNEL',
    hourglass: 'HOURGLASS',
    diamond: 'DIAMOND',
    corridor: 'WINDING CORRIDOR',
    hintClassic: 'Slide a block to fill a row',
    hintShaped: 'Rising edges trim blocks · Fill a row',
    hintTotem: 'Totems reach the top → clear 1–3 rows',
    combo: 'COMBO',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF'
  },
  zh: {
    settings: '设置',
    restart: '重新开始',
    resume: '继续',
    mode: '模式',
    classic: '经典',
    shaped: '异形',
    totem: '图腾',
    gameOver: '游戏结束',
    noMoves: '无路可走',
    score: '分数',
    newHigh: '新纪录！',
    highScore: '最高分',
    best: '最高',
    level: '等级',
    nextRow: '下一行',
    totemNext: '图腾模式 · 下一行',
    boardShape: '棋盘形状',
    random: '随机',
    chooseShape: '选择形状后点「异形」',
    funnel: '漏斗',
    hourglass: '沙漏',
    diamond: '菱形',
    corridor: '蜿蜒走廊',
    hintClassic: '滑动方块填满一行',
    hintShaped: '上升边缘会裁切方块 · 填满一行',
    hintTotem: '图腾到达顶部 → 消除 1–3 行',
    combo: '连击',
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
