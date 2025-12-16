import { getDb } from "./db";
import { treasuryDirectTitlesCache } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Busca todos os títulos em cache
 */
export async function getTreasuryDirectTitlesFromCache() {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  return database
    .select()
    .from(treasuryDirectTitlesCache)
    .orderBy(treasuryDirectTitlesCache.category);
}

/**
 * Busca títulos de uma categoria específica
 */
export async function getTreasuryDirectTitlesByCategoryFromCache(category: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  return database
    .select()
    .from(treasuryDirectTitlesCache)
    .where(eq(treasuryDirectTitlesCache.category, category));
}

/**
 * Busca um título específico pelo código
 */
export async function getTreasuryDirectTitleByCodeFromCache(code: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const result = await database
    .select()
    .from(treasuryDirectTitlesCache)
    .where(eq(treasuryDirectTitlesCache.code, code))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * Atualiza o cache com novos títulos
 */
export async function updateTreasuryDirectTitlesCache(titles: any[]) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  // Limpar cache antigo
  await database.delete(treasuryDirectTitlesCache);
  
  // Inserir novos títulos
  if (titles.length > 0) {
    await database.insert(treasuryDirectTitlesCache).values(titles);
  }
  
  return titles.length;
}

/**
 * Verifica se o cache está vazio
 */
export async function isTreasuryDirectCacheEmpty() {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const result = await database
    .select()
    .from(treasuryDirectTitlesCache)
    .limit(1);
  
  return result.length === 0;
}
