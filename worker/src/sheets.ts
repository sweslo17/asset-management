/**
 * Google Sheets REST API v4 wrapper for Cloudflare Workers.
 *
 * All network calls use the global `fetch` (Web API) — no Node.js built-ins.
 * Each exported function acquires a fresh (or cached) access token automatically.
 */

import { getAccessToken, invalidateTokenCache } from './auth';
import type { Env, SheetRow } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the base URL for all Sheets API v4 requests targeting a specific
 * spreadsheet identified by the GOOGLE_SHEETS_ID env binding.
 */
function baseUrl(sheetsId: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}`;
}

/**
 * Returns the authorization headers for a Sheets API request.
 */
async function authHeaders(
  env: Env,
): Promise<{ Authorization: string; 'Content-Type': string }> {
  const token = await getAccessToken(env);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Performs a fetch against the Sheets API with automatic 401 retry.
 *
 * If the first attempt returns 401 (token expired mid-request) the token
 * cache is invalidated and the request is retried once with a fresh token.
 */
async function sheetsRequest(
  url: string,
  init: RequestInit,
  env: Env,
): Promise<Response> {
  const headers = await authHeaders(env);
  // Spread any caller-supplied headers on top of the auth headers.
  // init.headers may be HeadersInit (object, Headers instance, or undefined);
  // we cast to a plain object for the spread — only plain-object headers are
  // passed internally in this module.
  const callerHeaders =
    (init.headers as Record<string, string> | undefined) ?? {};

  const firstResponse = await fetch(url, {
    ...init,
    headers: { ...headers, ...callerHeaders },
  });

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  // Token was rejected — invalidate cache and retry once.
  invalidateTokenCache();
  const retryHeaders = await authHeaders(env);
  return fetch(url, {
    ...init,
    headers: { ...retryHeaders, ...callerHeaders },
  });
}

/**
 * Throws a descriptive error when a Sheets API response indicates failure.
 */
async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Sheets API error [${context}] HTTP ${response.status}: ${body}`,
    );
  }
}

/**
 * Converts an array of header strings and a row of raw cell values into a
 * typed plain object.  Missing trailing cells are treated as empty strings.
 */
function rowToObject(
  headers: string[],
  row: string[],
): Record<string, string> {
  return Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads all data rows from a named sheet and returns them as an array of
 * plain objects where the keys are the header values from the first row.
 *
 * Returns an empty array when the sheet has no data rows (only a header row
 * or is completely empty).
 *
 * @param sheetName - The exact name of the sheet tab (e.g. "investments").
 * @param env       - Worker environment bindings.
 */
export async function readSheet(
  sheetName: string,
  env: Env,
): Promise<Array<Record<string, string | undefined>>> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(`${sheetName}`);
  const url = `${baseUrl(sheetsId)}/values/${range}`;

  const response = await sheetsRequest(url, { method: 'GET' }, env);
  await assertOk(response, `readSheet(${sheetName})`);

  const data: { values?: SheetRow[] } = await response.json();

  if (!data.values || data.values.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = data.values;

  // headerRow is guaranteed non-undefined because we checked length > 0 above.
  if (headerRow === undefined) {
    return [];
  }

  return dataRows.map((row) => rowToObject(headerRow, row));
}

/**
 * Appends one or more rows to the end of a named sheet.
 *
 * Each element of `rows` is an ordered array of cell values matching the
 * column order of the sheet header.
 *
 * @param sheetName - The exact name of the sheet tab.
 * @param rows      - Array of value arrays to append.
 * @param env       - Worker environment bindings.
 */
export async function appendRows(
  sheetName: string,
  rows: SheetRow[],
  env: Env,
): Promise<void> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(sheetName);
  const url =
    `${baseUrl(sheetsId)}/values/${range}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const body = JSON.stringify({ values: rows });

  const response = await sheetsRequest(url, { method: 'POST', body }, env);
  await assertOk(response, `appendRows(${sheetName})`);
}

/**
 * Overwrites a single data row at a 1-based `rowIndex` (where row 1 is the
 * header row, so the first data row is row 2).
 *
 * @param sheetName - The exact name of the sheet tab.
 * @param rowIndex  - 1-based row number (including the header row).
 * @param values    - Ordered array of new cell values for that row.
 * @param env       - Worker environment bindings.
 */
export async function updateRow(
  sheetName: string,
  rowIndex: number,
  values: SheetRow,
  env: Env,
): Promise<void> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(`${sheetName}!${rowIndex}:${rowIndex}`);
  const url =
    `${baseUrl(sheetsId)}/values/${range}?valueInputOption=RAW`;

  const body = JSON.stringify({ values: [values] });

  const response = await sheetsRequest(url, { method: 'PUT', body }, env);
  await assertOk(response, `updateRow(${sheetName}, row=${rowIndex})`);
}

/**
 * Deletes a single row by its 1-based sheet index using the batchUpdate
 * deleteDimension request (the only way to physically remove a row via the
 * Sheets REST API v4).
 *
 * @param sheetName - The exact name of the sheet tab.
 * @param rowIndex  - 1-based row number (including the header row).
 * @param env       - Worker environment bindings.
 */
export async function deleteRow(
  sheetName: string,
  rowIndex: number,
  env: Env,
): Promise<void> {
  const sheetsId = env.GOOGLE_SHEETS_ID;

  // First we need the numeric sheetId for the named tab.
  const sheetId = await getSheetId(sheetName, sheetsId, env);

  const url = `${baseUrl(sheetsId)}:batchUpdate`;
  const body = JSON.stringify({
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            // startIndex is 0-based, endIndex is exclusive.
            startIndex: rowIndex - 1,
            endIndex: rowIndex,
          },
        },
      },
    ],
  });

  const response = await sheetsRequest(url, { method: 'POST', body }, env);
  await assertOk(response, `deleteRow(${sheetName}, row=${rowIndex})`);
}

/**
 * Searches a column in a sheet for a specific value and returns the 1-based
 * row index of the first matching row (header row counts as row 1).
 *
 * Returns `null` when no match is found.
 *
 * @param sheetName   - The exact name of the sheet tab.
 * @param columnIndex - 0-based column index to search.
 * @param value       - The value to search for.
 * @param env         - Worker environment bindings.
 */
export async function findRowIndex(
  sheetName: string,
  columnIndex: number,
  value: string,
  env: Env,
): Promise<number | null> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(sheetName);
  const url = `${baseUrl(sheetsId)}/values/${range}`;

  const response = await sheetsRequest(url, { method: 'GET' }, env);
  await assertOk(response, `findRowIndex(${sheetName}, col=${columnIndex})`);

  const data: { values?: SheetRow[] } = await response.json();

  if (!data.values) {
    return null;
  }

  for (let i = 0; i < data.values.length; i++) {
    const row = data.values[i];
    if (row !== undefined && row[columnIndex] === value) {
      // Return 1-based index.
      return i + 1;
    }
  }

  return null;
}

/**
 * Finds ALL row indices (1-based) in a sheet where the specified column
 * matches the given value.  Useful for bulk-delete operations.
 *
 * @param sheetName   - The exact name of the sheet tab.
 * @param columnIndex - 0-based column index to search.
 * @param value       - The value to match.
 * @param env         - Worker environment bindings.
 */
export async function findAllRowIndices(
  sheetName: string,
  columnIndex: number,
  value: string,
  env: Env,
): Promise<number[]> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(sheetName);
  const url = `${baseUrl(sheetsId)}/values/${range}`;

  const response = await sheetsRequest(url, { method: 'GET' }, env);
  await assertOk(
    response,
    `findAllRowIndices(${sheetName}, col=${columnIndex})`,
  );

  const data: { values?: SheetRow[] } = await response.json();

  if (!data.values) {
    return [];
  }

  const indices: number[] = [];
  for (let i = 0; i < data.values.length; i++) {
    const row = data.values[i];
    if (row !== undefined && row[columnIndex] === value) {
      indices.push(i + 1);
    }
  }
  return indices;
}

/**
 * Reads all rows from a sheet and returns the raw 2-D string array
 * (including the header row as index 0).
 *
 * Used internally when we need both the header and raw row data.
 */
export async function readRawRows(
  sheetName: string,
  env: Env,
): Promise<SheetRow[]> {
  const sheetsId = env.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(sheetName);
  const url = `${baseUrl(sheetsId)}/values/${range}`;

  const response = await sheetsRequest(url, { method: 'GET' }, env);
  await assertOk(response, `readRawRows(${sheetName})`);

  const data: { values?: SheetRow[] } = await response.json();
  return data.values ?? [];
}

// ---------------------------------------------------------------------------
// Internal utility: resolve sheet name → numeric sheetId
// ---------------------------------------------------------------------------

/**
 * Fetches spreadsheet metadata to resolve the numeric sheetId for a given
 * sheet name.  Required for batchUpdate (deleteDimension) calls.
 *
 * Throws if the sheet name is not found.
 */
async function getSheetId(
  sheetName: string,
  sheetsId: string,
  env: Env,
): Promise<number> {
  const url = `${baseUrl(sheetsId)}?fields=sheets.properties`;

  const response = await sheetsRequest(url, { method: 'GET' }, env);
  await assertOk(response, `getSheetId(${sheetName})`);

  const data: {
    sheets: Array<{
      properties: { sheetId: number; title: string };
    }>;
  } = await response.json();

  const sheet = data.sheets.find((s) => s.properties.title === sheetName);
  if (!sheet) {
    throw new Error(
      `Sheet "${sheetName}" not found in spreadsheet ${sheetsId}`,
    );
  }
  return sheet.properties.sheetId;
}
