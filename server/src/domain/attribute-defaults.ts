/**
 * Набор по умолчанию. Дальше редактируется в настройках — здесь только то,
 * с чего начинается пустая база.
 */

export type CoreAttributeSeedType = {
  key: string;
  name: string;
  /** Трёхбуквенная метка для карточки. */
  shortCode: string;
  /**
   * Ось для матрицы Skill × Will. Без неё Skill вырождается в OVR:
   * мотивационные атрибуты считаются на обеих осях, облако точек
   * схлопывается в диагональ, и матрица перестаёт что-либо различать.
   */
  axis: 'skill' | 'will';
  /** Что значит «3» — без этого оценки дрейфуют год к году. */
  description: string;
};

/** Три навыка и три отношения к делу — чтобы обе оси матрицы были нагружены. */
export const CORE_ATTRIBUTES: readonly CoreAttributeSeedType[] = [
  {
    key: 'hard_skills',
    name: 'Технические навыки',
    shortCode: 'ТЕХ',
    axis: 'skill',
    description: '3 — уверенно решает типовые задачи своего стека без помощи',
  },
  {
    key: 'delivery',
    name: 'Доведение до результата',
    shortCode: 'РЕЗ',
    axis: 'skill',
    description: '3 — доводит задачи до конца, сроки называет близко к правде',
  },
  {
    key: 'communication',
    name: 'Коммуникация',
    shortCode: 'КОМ',
    axis: 'skill',
    description: '3 — понятно объясняет, не пропадает, вовремя поднимает флаг',
  },
  {
    key: 'ownership',
    name: 'Ответственность',
    shortCode: 'ОТВ',
    axis: 'will',
    description: '3 — берёт задачу целиком и не ждёт отдельных указаний',
  },
  {
    key: 'growth',
    name: 'Рост',
    shortCode: 'РОС',
    axis: 'will',
    description: '3 — учится ровно столько, сколько требует работа',
  },
  {
    key: 'influence',
    name: 'Влияние на команду',
    shortCode: 'ВЛИ',
    axis: 'will',
    description: '3 — помогает, когда просят; на общий уровень не влияет',
  },
];

/** Узкие скиллы по специализациям — подстаты позиции, вне OVR. */
export const SPECIALIZATION_SKILLS: Readonly<Record<string, readonly string[]>> = {
  iOS: ['Swift', 'SwiftUI / UIKit', 'Архитектура приложения', 'Тесты и стабильность'],
  Android: ['Kotlin', 'Compose', 'Архитектура приложения', 'Тесты и стабильность'],
  Бэкенд: ['Проектирование API', 'Базы данных', 'Надёжность и нагрузка', 'Наблюдаемость'],
  QA: ['Тест-дизайн', 'Автотесты', 'Работа с требованиями', 'Разбор инцидентов'],
};

/**
 * Ожидаемый профиль по грейдам — то, что превращает карточку из оценки
 * человека в инструмент роста: видно не «сколько у него», а «чего не хватает».
 */
export const GRADE_EXPECTATIONS: Readonly<Record<string, Record<string, number>>> = {
  Junior: {
    hard_skills: 2,
    delivery: 2,
    communication: 2,
    ownership: 2,
    growth: 3,
    influence: 1,
  },
  Middle: {
    hard_skills: 3,
    delivery: 3,
    communication: 3,
    ownership: 3,
    growth: 3,
    influence: 2,
  },
  Senior: {
    hard_skills: 4,
    delivery: 4,
    communication: 4,
    ownership: 4,
    growth: 3,
    influence: 3,
  },
  Lead: {
    hard_skills: 4,
    delivery: 4,
    communication: 5,
    ownership: 5,
    growth: 3,
    influence: 4,
  },
};
