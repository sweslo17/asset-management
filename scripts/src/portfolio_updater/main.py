"""Main entry point for the portfolio updater."""

from __future__ import annotations

import sys
from datetime import datetime, timezone

from loguru import logger

from .config import get_settings
from .models import ExchangeRateRecord, PriceRecord
from .price_fetcher import fetch_historical_prices, fetch_recent_prices
from .rate_fetcher import fetch_historical_rates, fetch_recent_rates
from .sheets_client import SheetsClient

# ------------------------------------------------------------------
# Logging setup
# ------------------------------------------------------------------

logger.remove()
logger.add(
    sys.stderr,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan> | "
        "{message}"
    ),
    level="DEBUG",
    colorize=True,
)


# ------------------------------------------------------------------
# Core logic
# ------------------------------------------------------------------


def _filter_new_prices(
    records: list[PriceRecord],
    existing: set[tuple[str, str]],
) -> list[PriceRecord]:
    """Return only records whose (ticker, date) pair is not yet in *existing*."""
    return [r for r in records if (r.ticker, r.date) not in existing]


def _filter_new_rates(
    records: list[ExchangeRateRecord],
    existing: set[str],
) -> list[ExchangeRateRecord]:
    """Return only records whose date is not yet in *existing*."""
    return [r for r in records if r.date not in existing]


def main() -> None:
    """Run the portfolio updater pipeline."""
    logger.info("=== Portfolio Updater starting ===")

    settings = get_settings()
    logger.info(
        "Config loaded — spreadsheet_id={} backfill={} service_account={}",
        settings.google_sheets_id,
        settings.backfill,
        settings.service_account_json_path,
    )

    # 1. Initialise Google Sheets client.
    sheets = SheetsClient(
        spreadsheet_id=settings.google_sheets_id,
        service_account_json_path=settings.service_account_json_path,
    )

    # 2. Read all investments to derive the unique ticker list and earliest date.
    investments = sheets.get_investments()
    if not investments:
        logger.warning("No investments found — nothing to do")
        return

    unique_tickers: list[str] = sorted({inv.ticker for inv in investments})
    logger.info("Unique tickers: {}", unique_tickers)

    earliest_date: str = min(inv.date for inv in investments)
    logger.info("Earliest investment date: {}", earliest_date)

    # 3. Load existing records for deduplication.
    existing_prices = sheets.get_existing_prices()
    existing_rates = sheets.get_existing_rates()

    # 4. Fetch prices and rates.
    if settings.backfill:
        logger.info("Backfill mode — fetching full history from {}", earliest_date)
        raw_prices = fetch_historical_prices(unique_tickers, start_date=earliest_date)
        raw_rates = fetch_historical_rates(start_date=earliest_date)
    else:
        logger.info("Incremental mode — fetching last 5 trading days")
        raw_prices = fetch_recent_prices(unique_tickers, days=5)
        raw_rates = fetch_recent_rates(days=5)

    # 5. Deduplicate.
    new_prices = _filter_new_prices(raw_prices, existing_prices)
    new_rates = _filter_new_rates(raw_rates, existing_rates)

    logger.info(
        "Prices: {} fetched, {} already exist, {} new",
        len(raw_prices),
        len(raw_prices) - len(new_prices),
        len(new_prices),
    )
    logger.info(
        "Rates:  {} fetched, {} already exist, {} new",
        len(raw_rates),
        len(raw_rates) - len(new_rates),
        len(new_rates),
    )

    # 6. Write new records to sheets.
    sheets.append_prices(new_prices)
    sheets.append_rates(new_rates)

    # 7. Update last_update metadata timestamp.
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sheets.update_metadata("last_update", timestamp)

    # 8. Summary.
    logger.info(
        "=== Done — wrote {} price record(s) and {} exchange rate record(s) ===",
        len(new_prices),
        len(new_rates),
    )


if __name__ == "__main__":
    main()
