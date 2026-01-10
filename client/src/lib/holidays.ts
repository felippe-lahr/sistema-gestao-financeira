export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'optional'; // feriado nacional ou ponto facultativo
}

export const holidays2026: Holiday[] = [
  { date: '2026-01-01', name: 'Confraternização Universal', type: 'national' },
  { date: '2026-02-16', name: 'Carnaval', type: 'optional' },
  { date: '2026-02-17', name: 'Carnaval', type: 'optional' },
  { date: '2026-02-18', name: 'Quarta-Feira de Cinzas', type: 'optional' },
  { date: '2026-04-03', name: 'Paixão de Cristo', type: 'national' },
  { date: '2026-04-20', name: 'Tiradentes (ponte)', type: 'optional' },
  { date: '2026-04-21', name: 'Tiradentes', type: 'national' },
  { date: '2026-05-01', name: 'Dia Mundial do Trabalho', type: 'national' },
  { date: '2026-06-04', name: 'Corpus Christi', type: 'optional' },
  { date: '2026-06-05', name: 'Corpus Christi (ponte)', type: 'optional' },
  { date: '2026-09-07', name: 'Independência do Brasil', type: 'national' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida', type: 'national' },
  { date: '2026-10-28', name: 'Dia do Servidor Público Federal', type: 'optional' },
  { date: '2026-11-02', name: 'Finados', type: 'national' },
  { date: '2026-11-15', name: 'Proclamação da República', type: 'national' },
  { date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra', type: 'national' },
  { date: '2026-12-24', name: 'Véspera do Natal', type: 'optional' },
  { date: '2026-12-25', name: 'Natal', type: 'national' },
  { date: '2026-12-31', name: 'Véspera do Ano Novo', type: 'optional' },
];

export function getHolidayByDate(date: string): Holiday | undefined {
  return holidays2026.find(h => h.date === date);
}

export function getHolidaysByMonth(year: number, month: number): Holiday[] {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);
  return holidays2026.filter(h => h.date.startsWith(`${yearStr}-${monthStr}`));
}
