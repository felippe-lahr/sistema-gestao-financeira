console.log("=== DATA E HORA DO SERVIDOR ===");
console.log("Date.now():", new Date());
console.log("Timezone offset (minutes):", new Date().getTimezoneOffset());
console.log("ISO String:", new Date().toISOString());
console.log("Locale String:", new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
console.log("SQL CURRENT_DATE equivalente:", new Date().toISOString().split('T')[0]);
console.log("SQL NOW() equivalente:", new Date().toISOString());
