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
    'totem-building': 'CREATURES',
    gameOver: 'MOUTH FULL!',
    noMoves: 'NO MOVES LEFT',
    score: 'FULLNESS',
    newHigh: 'BIGGEST FEAST!',
    highScore: 'BEST FULLNESS',
    best: 'BEST',
    nextJunior: 'NEXT JUNIOR',
    juniorIncoming: 'JUNIORS INCOMING!',
    nextMeal: 'NEXT FEAST',
    mealUp: 'BIGGER FEAST!',
    mouthIntro: 'Your mouth, your feast. Eat and raise juniors!',
    nextRow: 'NEXT BITE',
    nextDrop: 'NEXT',
    boardShape: 'BOARD\nSHAPE',
    corridorSelector: 'WINDING\nCORRIDOR',
    random: 'RANDOM',
    funnel: 'FUNNEL',
    hourglass: 'HOURGLASS',
    diamond: 'DIAMOND',
    corridor: 'WINDING CORRIDOR',
    hintClassic: 'Slide food into full rows to eat',
    hintShaped: 'Edges nibble food · Fill a row to eat',
    hintTetris: 'Fill rows to eat food and break pieces',
    hintTotemBuilding: 'Feed juniors · Guide them to the bottom',
    hintTotemBuilding2: 'Clear rows with juniors to help them grow up',
    buildingRules: 'CREATURE RULES',
    buildingMode1: 'JUNIOR DROP',
    buildingMode2: 'GROW UP',
    combo: 'COMBO',
    powerMode: 'FRENZY',
    powerButton: 'FRENZY BUTTON',
    on: 'ON',
    off: 'OFF',
    powerModeActivated: 'FEEDING FRENZY!',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF',
    password: 'PASSWORD',
    back: 'BACK'
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
    'totem-building': '小怪兽',
    gameOver: '嘴巴塞满啦！',
    noMoves: '无路可走',
    score: '饱腹值',
    newHigh: '最丰盛的一餐！',
    highScore: '最高饱腹值',
    best: '最高',
    nextJunior: '下一只幼崽',
    juniorIncoming: '幼崽来啦！',
    nextMeal: '下一场盛宴',
    mealUp: '盛宴加量！',
    mouthIntro: '这是你的大嘴巴，吃美食，养幼崽！',
    nextRow: '下一口',
    nextDrop: '下一块',
    boardShape: '棋盘形状',
    corridorSelector: '蜿蜒走廊',
    random: '随机',
    funnel: '漏斗',
    hourglass: '沙漏',
    diamond: '菱形',
    corridor: '蜿蜒走廊',
    hintClassic: '滑动食物，填满一行就开吃',
    hintShaped: '边缘会啃掉食物 · 填满一行开吃',
    hintTetris: '填满一行，吃掉食物并打碎拼块',
    hintTotemBuilding: '喂饱幼崽，把它们送到底部',
    hintTotemBuilding2: '让幼崽参与消行，吃饱长大！',
    buildingRules: '幼崽规则',
    buildingMode1: '幼崽掉落',
    buildingMode2: '喂养长大',
    combo: '连击',
    powerMode: '开饭',
    powerButton: '盛宴按钮',
    on: '开',
    off: '关',
    powerModeActivated: '开饭狂欢！',
    soundOn: '音效开',
    soundOff: '音效关',
    password: '密码',
    back: '返回'
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
