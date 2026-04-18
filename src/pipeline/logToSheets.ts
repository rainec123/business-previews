import { google } from 'googleapis';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const SHEET_NAME = 'Pipeline';

const HEADERS = [
  'Timestamp',
  'Business Name',
  'City',
  'Category',
  'Phone',
  'Rating',
  'Preview URL',
  'Email Found',
  'Email Sent',
  'Status',
  'Notes',
];

/** Returns true if Google Sheets is configured. */
function sheetsConfigured(): boolean {
  return !!(config.googleSheetsId && config.googleServiceAccountJson);
}

/** Create an authenticated Google Sheets client. */
function getSheetsClient() {
  const credentials = JSON.parse(config.googleServiceAccountJson) as object;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the Pipeline sheet exists and has a header row.
 * Idempotent — safe to call on every run.
 */
async function ensureSheet(sheets: ReturnType<typeof getSheetsClient>): Promise<void> {
  try {
    // Try to read the sheet — if it doesn't exist, create it
    await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheetsId,
      range: `${SHEET_NAME}!A1`,
    });
  } catch {
    // Sheet doesn't exist — create it
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSheetsId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: SHEET_NAME },
            },
          },
        ],
      },
    });

    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetsId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

export interface LogEntry {
  businessName: string;
  city: string;
  category: string;
  phone: string;
  rating: number;
  previewUrl: string;
  emailFound: boolean;
  emailSent: boolean;
  status: string;
  notes?: string;
}

/**
 * Append a new row to the Pipeline Google Sheet for a processed business.
 */
export async function logBusiness(entry: LogEntry): Promise<void> {
  if (!sheetsConfigured()) {
    logger.info(`[Sheets skipped] ${entry.businessName} — ${entry.status}`);
    return;
  }
  try {
    const sheets = getSheetsClient();
    await ensureSheet(sheets);

    const row = [
      new Date().toISOString(),
      entry.businessName,
      entry.city,
      entry.category,
      entry.phone,
      entry.rating,
      entry.previewUrl,
      entry.emailFound ? 'Yes' : 'No',
      entry.emailSent ? 'Yes' : 'No',
      entry.status,
      entry.notes ?? '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.googleSheetsId,
      range: `${SHEET_NAME}!A:K`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    logger.info(`Logged "${entry.businessName}" to Google Sheets.`);
  } catch (err) {
    logger.error(`Failed to log to Google Sheets: ${(err as Error).message}`);
  }
}

/**
 * Update the status of an existing row in the Pipeline sheet.
 * Finds the row by business name and updates the Status column.
 */
export async function updateStatus(
  businessName: string,
  status: string,
  notes?: string,
): Promise<void> {
  if (!sheetsConfigured()) return;
  try {
    const sheets = getSheetsClient();

    // Read all rows to find the matching one
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheetsId,
      range: `${SHEET_NAME}!A:K`,
    });

    const rows = res.data.values as string[][] ?? [];
    const rowIndex = rows.findIndex((r) => r[1] === businessName); // column B = Business Name

    if (rowIndex === -1) {
      logger.warn(`Could not find "${businessName}" in Google Sheets to update status.`);
      return;
    }

    // Row index is 1-based in Sheets (row 1 = headers, so data starts at row 2)
    const sheetRow = rowIndex + 1;

    // Update Status column (J = index 9) and Notes (K = index 10)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.googleSheetsId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${SHEET_NAME}!J${sheetRow}`,
            values: [[status]],
          },
          ...(notes
            ? [{
              range: `${SHEET_NAME}!K${sheetRow}`,
              values: [[notes]],
            }]
            : []),
        ],
      },
    });

    logger.info(`Updated status for "${businessName}" to "${status}" in Google Sheets.`);
  } catch (err) {
    logger.error(`Failed to update Google Sheets status: ${(err as Error).message}`);
  }
}
