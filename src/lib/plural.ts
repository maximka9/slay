// Склонение слова «голос»: 1 голос, 2 голоса, 5 голосов, 11 голосов, 21 голос.
export function votesWord(count: number) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return 'голос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'голоса';
  return 'голосов';
}

export function votesLabel(count: number) {
  return `${count} ${votesWord(count)}`;
}
