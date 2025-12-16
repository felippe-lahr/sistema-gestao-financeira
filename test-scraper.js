const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function testScraper() {
  try {
    const url = "https://www.tesourodireto.com.br/produtos/dados-sobre-titulos/rendimento-dos-titulos";
    console.log("Acessando:", url);
    
    const response = await fetch(url);
    console.log("Status:", response.status);
    
    const html = await response.text();
    console.log("HTML recebido:", html.length, "caracteres");
    
    const $ = cheerio.load(html);
    
    // Procurar pelas linhas da tabela
    const rows = $("tr[role='row']");
    console.log("Linhas encontradas:", rows.length);
    
    rows.slice(0, 3).each((index, element) => {
      const cells = $(element).find("td");
      console.log(`\nLinha ${index + 1}:`);
      cells.each((i, cell) => {
        console.log(`  Coluna ${i}: ${$(cell).text().trim().substring(0, 50)}`);
      });
    });
    
  } catch (error) {
    console.error("Erro:", error.message);
  }
}

testScraper();
