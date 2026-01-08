import { getDb } from "./db";
import { rentals, rentalConfigs, rentalSyncLogs, Rental, RentalConfig, RentalSyncLog } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Converter timestamp para string ISO (YYYY-MM-DD)
 */
function convertRentalDatesToISO(rental: any): any {
  const convertDate = (date: any): string => {
    if (!date) return date;
    
    if (date instanceof Date) {
      // Converter Date para YYYY-MM-DD usando UTC
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    if (typeof date === 'string') {
      // Se já é string, extrair apenas a parte da data
      return date.split('T')[0];
    }
    
    return date;
  };
  
  return {
    ...rental,
    startDate: convertDate(rental.startDate),
    endDate: convertDate(rental.endDate),
  };
}

/**
 * Obter reservas por entidade
 */
export async function getRentalsByEntityId(entityId: number): Promise<Rental[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(rentals).where(eq(rentals.entityId, entityId));
  return results.map(convertRentalDatesToISO);
}

/**
 * Obter uma reserva específica
 */
export async function getRentalById(id: number): Promise<Rental | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rentals).where(eq(rentals.id, id));
  return result[0] ? convertRentalDatesToISO(result[0]) : undefined;
}

/**
 * Criar uma nova reserva
 */
export async function createRental(data: {
  entityId: number;
  userId: number;
  startDate: string;
  endDate: string;
  source: "AIRBNB" | "DIRECT" | "BLOCKED";
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  dailyRate?: number;
  totalAmount?: number;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  specialRequests?: string;
  numberOfGuests?: number;
  extraFeeType?: string;
  extraFeeAmount?: number;
  competencyDate?: string;
}): Promise<Rental> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Converter string de data (YYYY-MM-DD ou DD/MM/YYYY) para ISO string (YYYY-MM-DD)
  const parseDate = (dateStr: string): string => {
    let year, month, day;
    
    // Detectar formato: DD/MM/YYYY ou YYYY-MM-DD
    if (dateStr.includes('/')) {
      // Formato DD/MM/YYYY
      const [d, m, y] = dateStr.split('/').map(Number);
      day = d;
      month = m;
      year = y;
    } else {
      // Formato YYYY-MM-DD
      const [y, m, d] = dateStr.split('-').map(Number);
      year = y;
      month = m;
      day = d;
    }
    
    // Retornar como string ISO (YYYY-MM-DD) sem timezone
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  
  // Validar que startDate não é uma data passada
  const startDateParsed = parseDate(data.startDate);
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  
  if (startDateParsed < todayStr) {
    throw new Error("Não é permitido criar reservas em datas passadas");
  }
  
  const result = await db.insert(rentals).values({
    entityId: data.entityId,
    userId: data.userId,
    startDate: new Date(`${parseDate(data.startDate)}T00:00:00Z`),
    endDate: new Date(`${parseDate(data.endDate)}T00:00:00Z`),
    source: data.source,
    status: data.source === "BLOCKED" ? "BLOCKED" : `RESERVED_${data.source}`,
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestPhone: data.guestPhone,
    dailyRate: data.dailyRate,
    totalAmount: data.totalAmount,
    checkInTime: data.checkInTime || "14:00",
    checkOutTime: data.checkOutTime || "11:00",
    notes: data.notes,
    specialRequests: data.specialRequests,
    numberOfGuests: data.numberOfGuests || 1,
    extraFeeType: data.extraFeeType,
    extraFeeAmount: data.extraFeeAmount,
    competencyDate: data.competencyDate || "CHECK_IN",
  }).returning();
  
  return convertRentalDatesToISO(result[0]);
}

/**
 * Atualizar uma reserva
 */
export async function updateRental(
  id: number,
  data: {
    startDate?: string;
    endDate?: string;
    source?: "AIRBNB" | "DIRECT" | "BLOCKED";
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    dailyRate?: number;
    totalAmount?: number;
    checkInTime?: string;
    checkOutTime?: string;
    notes?: string;
    specialRequests?: string;
    numberOfGuests?: number;
    extraFeeType?: string;
    extraFeeAmount?: number;
    competencyDate?: string;
  }
): Promise<Rental> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = {};
  
  // Converter string de data (YYYY-MM-DD ou DD/MM/YYYY) para ISO string (YYYY-MM-DD)
  const parseDate = (dateStr: string): string => {
    let year, month, day;
    
    // Detectar formato: DD/MM/YYYY ou YYYY-MM-DD
    if (dateStr.includes('/')) {
      // Formato DD/MM/YYYY
      const [d, m, y] = dateStr.split('/').map(Number);
      day = d;
      month = m;
      year = y;
    } else {
      // Formato YYYY-MM-DD
      const [y, m, d] = dateStr.split('-').map(Number);
      year = y;
      month = m;
      day = d;
    }
    
    // Retornar como string ISO (YYYY-MM-DD) sem timezone
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  
  if (data.startDate) updateData.startDate = new Date(parseDate(data.startDate));
  if (data.endDate) updateData.endDate = new Date(parseDate(data.endDate));
  if (data.source) {
    updateData.source = data.source;
    updateData.status = data.source === "BLOCKED" ? "BLOCKED" : `RESERVED_${data.source}`;
  }
  if (data.guestName !== undefined) updateData.guestName = data.guestName;
  if (data.guestEmail !== undefined) updateData.guestEmail = data.guestEmail;
  if (data.guestPhone !== undefined) updateData.guestPhone = data.guestPhone;
  if (data.dailyRate !== undefined) updateData.dailyRate = data.dailyRate;
  if (data.totalAmount !== undefined) updateData.totalAmount = data.totalAmount;
  if (data.checkInTime !== undefined) updateData.checkInTime = data.checkInTime;
  if (data.checkOutTime !== undefined) updateData.checkOutTime = data.checkOutTime;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.specialRequests !== undefined) updateData.specialRequests = data.specialRequests;
  if (data.numberOfGuests !== undefined) updateData.numberOfGuests = data.numberOfGuests;
  if (data.extraFeeType !== undefined) updateData.extraFeeType = data.extraFeeType;
  if (data.extraFeeAmount !== undefined) updateData.extraFeeAmount = data.extraFeeAmount;
  if (data.competencyDate !== undefined) updateData.competencyDate = data.competencyDate;
  
  updateData.updatedAt = new Date();
  
  const result = await db.update(rentals).set(updateData).where(eq(rentals.id, id)).returning();
  return convertRentalDatesToISO(result[0]);
}

/**
 * Deletar uma reserva
 */
export async function deleteRental(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(rentals).where(eq(rentals.id, id));
  return true;
}

/**
 * Obter configuração de locação por entidade
 */
export async function getRentalConfigByEntityId(entityId: number): Promise<RentalConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rentalConfigs).where(eq(rentalConfigs.entityId, entityId));
  return result[0];
}

/**
 * Criar configuração de locação
 */
export async function createRentalConfig(data: {
  entityId: number;
  userId: number;
  defaultCheckInTime?: string;
  defaultCheckOutTime?: string;
}): Promise<RentalConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(rentalConfigs).values({
    entityId: data.entityId,
    userId: data.userId,
    defaultCheckInTime: data.defaultCheckInTime || "14:00",
    defaultCheckOutTime: data.defaultCheckOutTime || "11:00",
  }).returning();
  
  return result[0] ? convertRentalDatesToISO(result[0]) : result[0];
}

/**
 * Atualizar configuração de locação
 */
export async function updateRentalConfig(
  entityId: number,
  data: {
    defaultCheckInTime?: string;
    defaultCheckOutTime?: string;
    airbnbApiKey?: string;
    airbnbListingIds?: string[];
    airbnbSyncEnabled?: boolean;
    airbnbWebhookSecret?: string;
  }
): Promise<RentalConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = {
    updatedAt: new Date(),
  };
  
  if (data.defaultCheckInTime !== undefined) updateData.defaultCheckInTime = data.defaultCheckInTime;
  if (data.defaultCheckOutTime !== undefined) updateData.defaultCheckOutTime = data.defaultCheckOutTime;
  if (data.airbnbApiKey !== undefined) updateData.airbnbApiKey = data.airbnbApiKey;
  if (data.airbnbListingIds !== undefined) updateData.airbnbListingIds = JSON.stringify(data.airbnbListingIds);
  if (data.airbnbSyncEnabled !== undefined) updateData.airbnbSyncEnabled = data.airbnbSyncEnabled;
  if (data.airbnbWebhookSecret !== undefined) updateData.airbnbWebhookSecret = data.airbnbWebhookSecret;
  
  const result = await db.update(rentalConfigs).set(updateData).where(eq(rentalConfigs.entityId, entityId)).returning();
  return result[0] ? convertRentalDatesToISO(result[0]) : result[0];
}

/**
 * Registrar log de sincronização
 */
export async function createSyncLog(data: {
  entityId: number;
  userId: number;
  syncType: "MANUAL" | "WEBHOOK" | "CRON";
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  message?: string;
  itemsSynced?: number;
  itemsFailed?: number;
}): Promise<RentalSyncLog> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(rentalSyncLogs).values({
    entityId: data.entityId,
    userId: data.userId,
    syncType: data.syncType,
    status: data.status,
    message: data.message,
    itemsSynced: data.itemsSynced || 0,
    itemsFailed: data.itemsFailed || 0,
  }).returning();
  
  return result[0];
}

/**
 * Obter logs de sincronização
 */
export async function getSyncLogsByEntityId(entityId: number, limit: number = 10): Promise<RentalSyncLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(rentalSyncLogs)
    .where(eq(rentalSyncLogs.entityId, entityId))
    .orderBy((t: any) => t.createdAt)
    .limit(limit);
}
