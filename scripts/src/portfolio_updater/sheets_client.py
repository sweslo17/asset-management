"""Google Sheets client using gspread and google-auth service account credentials."""

from __future__ import annotations

from typing import Any

import gspread
from google.oauth2.service_account import Credentials
from loguru import logger

from .models import ExchangeRateRecord, Investment, PriceRecord

# Scopes required for reading and writing Sheets and Drive metadata.
_SCOPES: list[str] = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Sheet tab names — adjust if your spreadsheet uses different names.
_SHEET_INVESTMENTS = "investments"
_SHEET_PRICES = "prices"
_SHEET_RATES = "exchange_rates"
_SHEET_METADATA = "metadata"


class SheetsClient:
    """Thin wrapper around gspread that exposes typed read/write helpers.

    Parameters
    ----------
    spreadsheet_id:
        The Google Spreadsheet ID found in its URL.
    service_account_json_path:
        Path to the service-account credentials JSON downloaded from Google Cloud Console.
    """

    def __init__(self, spreadsheet_id: str, service_account_json_path: str) -> None:
        logger.info(
            "Authenticating with Google Sheets using service account: {}",
            service_account_json_path,
        )
        credentials = Credentials.from_service_account_file(
            service_account_json_path,
            scopes=_SCOPES,
        )
        client = gspread.authorize(credentials)  # type: ignore[no-untyped-call]
        self._spreadsheet = client.open_by_key(spreadsheet_id)
        logger.info("Opened spreadsheet: {}", self._spreadsheet.title)

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    def get_investments(self) -> list[Investment]:
        """Return all rows from the investments sheet as ``Investment`` objects.

        The sheet must have a header row whose column names match the
        ``Investment`` field names (case-insensitive).
        """
        logger.debug("Reading investments sheet…")
        worksheet = self._spreadsheet.worksheet(_SHEET_INVESTMENTS)
        rows: list[dict[str, Any]] = worksheet.get_all_records(
            expected_headers=[
                "id",
                "batch_id",
                "ticker",
                "name",
                "market",
                "date",
                "units",
                "price_per_unit",
                "exchange_rate",
                "fees",
                "tags",
            ]
        )
        investments: list[Investment] = []
        for row in rows:
            try:
                investments.append(Investment.model_validate(row))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Skipping invalid investment row {}: {}", row, exc)
        logger.info("Loaded {} investments", len(investments))
        return investments

    def get_existing_prices(self) -> set[tuple[str, str]]:
        """Return a set of (ticker, date) tuples already present in the prices sheet."""
        logger.debug("Reading existing prices for deduplication…")
        try:
            worksheet = self._spreadsheet.worksheet(_SHEET_PRICES)
        except gspread.WorksheetNotFound:
            logger.warning("Prices sheet '{}' not found; treating as empty", _SHEET_PRICES)
            return set()

        rows: list[dict[str, Any]] = worksheet.get_all_records()
        existing: set[tuple[str, str]] = {
            (str(row["ticker"]), str(row["date"])) for row in rows if row.get("ticker") and row.get("date")
        }
        logger.info("Found {} existing price records", len(existing))
        return existing

    def get_existing_rates(self) -> set[str]:
        """Return a set of date strings already present in the exchange_rates sheet."""
        logger.debug("Reading existing exchange rates for deduplication…")
        try:
            worksheet = self._spreadsheet.worksheet(_SHEET_RATES)
        except gspread.WorksheetNotFound:
            logger.warning(
                "Exchange rates sheet '{}' not found; treating as empty", _SHEET_RATES
            )
            return set()

        rows: list[dict[str, Any]] = worksheet.get_all_records()
        existing: set[str] = {str(row["date"]) for row in rows if row.get("date")}
        logger.info("Found {} existing exchange rate records", len(existing))
        return existing

    # ------------------------------------------------------------------
    # Write helpers
    # ------------------------------------------------------------------

    def append_prices(self, records: list[PriceRecord]) -> None:
        """Append price records to the prices sheet.

        Creates the sheet with a header row if it does not yet exist.
        """
        if not records:
            logger.debug("No new price records to append")
            return

        worksheet = self._get_or_create_worksheet(
            _SHEET_PRICES, headers=["ticker", "date", "close"]
        )
        rows = [[r.ticker, r.date, r.close] for r in records]
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")
        logger.info("Appended {} price record(s) to '{}'", len(rows), _SHEET_PRICES)

    def append_rates(self, records: list[ExchangeRateRecord]) -> None:
        """Append exchange rate records to the exchange_rates sheet.

        Creates the sheet with a header row if it does not yet exist.
        """
        if not records:
            logger.debug("No new exchange rate records to append")
            return

        worksheet = self._get_or_create_worksheet(
            _SHEET_RATES, headers=["date", "usd_twd"]
        )
        rows = [[r.date, r.usd_twd] for r in records]
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")
        logger.info("Appended {} exchange rate record(s) to '{}'", len(rows), _SHEET_RATES)

    def update_metadata(self, key: str, value: str) -> None:
        """Set ``key`` to ``value`` in the metadata sheet.

        If a row for ``key`` already exists it is updated in place;
        otherwise a new row is appended.
        """
        logger.debug("Updating metadata: {} = {}", key, value)
        worksheet = self._get_or_create_worksheet(
            _SHEET_METADATA, headers=["key", "value"]
        )
        rows: list[dict[str, Any]] = worksheet.get_all_records()
        for idx, row in enumerate(rows, start=2):  # row 1 is the header
            if str(row.get("key", "")) == key:
                # Column B (index 2) holds the value.
                worksheet.update_cell(idx, 2, value)
                logger.info("Updated metadata key '{}' at row {}", key, idx)
                return

        worksheet.append_row([key, value], value_input_option="USER_ENTERED")
        logger.info("Appended new metadata key '{}'", key)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_or_create_worksheet(
        self, title: str, headers: list[str]
    ) -> gspread.Worksheet:
        """Return the worksheet named *title*, creating it with *headers* if absent."""
        try:
            return self._spreadsheet.worksheet(title)
        except gspread.WorksheetNotFound:
            logger.info("Sheet '{}' not found — creating it now", title)
            worksheet: gspread.Worksheet = self._spreadsheet.add_worksheet(
                title=title, rows=1000, cols=len(headers)
            )
            worksheet.append_row(headers, value_input_option="USER_ENTERED")
            return worksheet
